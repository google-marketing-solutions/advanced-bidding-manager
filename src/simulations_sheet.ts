/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  BaseSimulation,
  GoogleAdsClient,
  StrategyType,
} from './google_ads_client';
import {SpreadsheetService} from './spreadsheet_service';

enum SimLabelsIndex {
  CUSTOMER_NAME = 0, // Column A
  ENTITY_NAME = 1, // Column B
  ENTITY_ID = 2, // Column C
  STRATEGY_TYPE = 3, // Column D
  SIMULATION_TYPE = 4, // Column E
  CURRENT_TARGET = 5, // Column F
  START_DATE = 6, // Column G
  END_DATE = 7, // Column H
  SIMULATION_TARGET = 8, // Column I
  SIMULATION_BIDDABLE_CONVERSIONS = 9, // Column J
  SIMULATION_BIDDABLE_CONVERSIONS_VALUE = 10, // Column K
  SIMULATION_CLICKS = 11, // Column L
  SIMULATION_COST = 12, // Column M
  SIMULATION_IMPRESSIONS = 13, // Column N
  SIMULATION_TOP_SLOT_IMPRESSIONS = 14, // Column O
  FORMULAS = 15, // Column P, start of formulas
}

interface SimulationFormula {
  header: string;
  formula: string;
}

// Calculated formulas on top of simulation data-points to enrich
const SimulationFormulas: SimulationFormula[] = [
  // Subtracting cost (M) from conversion value (K)
  {
    header: 'Value-cost',
    formula: 'K2-M2',
  },
  // VLookup of conversion value (K) on closest target (I) to current target (F)
  {
    header: 'Value target',
    formula: `VLOOKUP(F2,
      SORT(FILTER(I:M, C:C = C2), 1, TRUE),
      COLUMN(K2)-COLUMN(I2)+1,
      TRUE)`,
  },
  // Subtracting current conversion value (Q) from simulated conversion value (K)
  {
    header: 'Value diff',
    formula: 'K2-Q2',
  },
  // VLookup of cost (M) on closest target (I) to current target (F)
  {
    header: 'Cost target',
    formula: `VLOOKUP(F2,
      SORT(FILTER(I:M, C:C = C2), 1, TRUE),
      COLUMN(M2)-COLUMN(I2)+1,
      TRUE)`,
  },
  // Subtracting current cost (S) from simulated cost (M)
  {
    header: 'Cost diff',
    formula: 'M2-S2',
  },
  // Rank simulation data points based on the value-cost (P)
  {
    header: 'Rank (value-cost)',
    formula: 'RANK(P2, FILTER(P:P, C:C = C2))',
  },
  // Relative change of simulated (I) to current target (F)
  {
    header: 'ROAS change (%)',
    formula: 'I2/F2',
  },
  // Incremental target
  {
    header: 'Incremental target',
    formula: 'IF(R2>=0, R2/MAX(T2,0.1), T2/R2)',
  },
];

/**
 * A class for handling operations related to the "Simulations" sheet.
 */
export class SimulationsSheet {
  static readonly SIM_SHEET = 'Simulations';

  constructor(private spreadsheetService: SpreadsheetService) {}

  /**
   * Loads bidding strategies simulations from the API to the spreadsheet.
   * @param googleAdsClient instance of GoogleAdsClient
   */
  load(googleAdsClient: GoogleAdsClient): void {
    this.spreadsheetService.clearSheet(SimulationsSheet.SIM_SHEET);
    const sheet = this.spreadsheetService.getSpreadsheet(
      SimulationsSheet.SIM_SHEET
    );

    const allSimulations = [
      ...this.getStrategySimulations(googleAdsClient),
      ...this.getCampaignSimulations(googleAdsClient),
      ...this.getAdGroupSimulations(googleAdsClient),
    ];

    this.spreadsheetService.appendRows(
      SimulationsSheet.SIM_SHEET,
      allSimulations
    );
    this.appendFormulas(sheet);
  }

  /**
   * Returns the headers for Simulations sheet.
   */
  private getSimulationsHeaders(): string[] {
    const headers: string[] = [];
    headers[SimLabelsIndex.CUSTOMER_NAME] = 'Customer name';
    headers[SimLabelsIndex.ENTITY_NAME] = 'Simulated entity name';
    headers[SimLabelsIndex.ENTITY_ID] = 'Simulated entity ID';
    headers[SimLabelsIndex.STRATEGY_TYPE] = 'Strategy type';
    headers[SimLabelsIndex.SIMULATION_TYPE] = 'Simulation type';
    headers[SimLabelsIndex.CURRENT_TARGET] = 'Current target';
    headers[SimLabelsIndex.START_DATE] = 'Start date';
    headers[SimLabelsIndex.END_DATE] = 'End date';
    headers[SimLabelsIndex.SIMULATION_TARGET] = 'Simulation target';
    headers[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS] =
      'Biddable conversions';
    headers[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS_VALUE] =
      'Biddable conversions value';
    headers[SimLabelsIndex.SIMULATION_CLICKS] = 'Clicks';
    headers[SimLabelsIndex.SIMULATION_COST] = 'Cost';
    headers[SimLabelsIndex.SIMULATION_IMPRESSIONS] = 'Impressions';
    headers[SimLabelsIndex.SIMULATION_TOP_SLOT_IMPRESSIONS] =
      'Top slot impressions';

    // Add formulas headers
    for (const formula of SimulationFormulas) {
      headers.push(formula.header);
    }

    return headers;
  }

  private getStrategySimulations(
    googleAdsClient: GoogleAdsClient
  ): Array<Array<string | number>> {
    const simulations = googleAdsClient.fetchBiddingStrategySimulations();
    const apiRows: Array<Array<string | number>> = [];
    for (const s of simulations) {
      const sim = s.biddingStrategySimulation;
      const currentTarget =
        googleAdsClient.getEntityTarget(sim.type, s.biddingStrategy) ?? '';
      apiRows.push(
        ...this.createSimulationRows(
          sim.biddingStrategyId,
          `Strategy: ${s.biddingStrategy.name}`,
          s.biddingStrategy.type,
          s.customer.descriptiveName,
          currentTarget,
          sim
        )
      );
    }

    return apiRows;
  }

  private getCampaignSimulations(
    googleAdsClient: GoogleAdsClient
  ): Array<Array<string | number>> {
    const simulations = googleAdsClient.fetchCampaignSimulations();
    const apiRows: Array<Array<string | number>> = [];
    for (const s of simulations) {
      const sim = s.campaignSimulation;
      apiRows.push(
        ...this.createSimulationRows(
          sim.campaignId,
          `Campaign: ${s.campaign.name}`,
          s.campaign.biddingStrategyType,
          s.customer.descriptiveName,
          googleAdsClient.getEntityTarget(sim.type, s.campaign) ?? '',
          sim
        )
      );
    }

    return apiRows;
  }

  private getAdGroupSimulations(
    googleAdsClient: GoogleAdsClient
  ): Array<Array<string | number>> {
    const simulations = googleAdsClient.fetchAdGroupSimulations();
    const apiRows: Array<Array<string | number>> = [];
    for (const s of simulations) {
      const sim = s.adGroupSimulation;
      // For ad groups, the simulation type is the same as the strategy type
      const strategyType = sim.type;
      const currentTarget =
        googleAdsClient.getEntityTarget(strategyType, s.adGroup) ?? '';
      apiRows.push(
        ...this.createSimulationRows(
          sim.adGroupId,
          `Ad Group: ${s.adGroup.name}`,
          strategyType,
          s.customer.descriptiveName,
          currentTarget,
          sim
        )
      );
    }

    return apiRows;
  }

  private createSimulationRows(
    id: string,
    name: string,
    strategyType: string | StrategyType,
    customerName: string,
    currentTarget: string | number,
    simulation: BaseSimulation
  ): Array<Array<string | number>> {
    const points =
      simulation.type === StrategyType.TARGET_ROAS
        ? simulation.targetRoasPointList?.points
        : simulation.targetCpaPointList?.points;

    if (!points) {
      return [];
    }

    return points.map(point => {
      const simulationTarget =
        simulation.type === StrategyType.TARGET_ROAS
          ? (point as {targetRoas: number}).targetRoas
          : (point as {targetCpaMicros: number}).targetCpaMicros / 1e6;

      const row = new Array<string | number>();
      row[SimLabelsIndex.CUSTOMER_NAME] = customerName;
      row[SimLabelsIndex.ENTITY_NAME] = name;
      row[SimLabelsIndex.ENTITY_ID] = id;
      row[SimLabelsIndex.STRATEGY_TYPE] = strategyType;
      row[SimLabelsIndex.SIMULATION_TYPE] = simulation.type;
      row[SimLabelsIndex.CURRENT_TARGET] = currentTarget;
      row[SimLabelsIndex.START_DATE] = simulation.startDate;
      row[SimLabelsIndex.END_DATE] = simulation.endDate;
      row[SimLabelsIndex.SIMULATION_TARGET] = simulationTarget;
      row[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS] =
        point.biddableConversions;
      row[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS_VALUE] =
        point.biddableConversionsValue;
      row[SimLabelsIndex.SIMULATION_CLICKS] = point.clicks;
      row[SimLabelsIndex.SIMULATION_COST] = point.costMicros / 1e6;
      row[SimLabelsIndex.SIMULATION_IMPRESSIONS] = point.impressions;
      row[SimLabelsIndex.SIMULATION_TOP_SLOT_IMPRESSIONS] =
        point.topSlotImpressions;
      return row;
    });
  }

  private appendFormulas(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
    const lastRow = sheet.getLastRow();
    if (lastRow <= 2) return;
    SimulationFormulas.forEach((value, index) => {
      // R1C1 column position is offset by 1
      const column = SimLabelsIndex.FORMULAS + index + 1;
      sheet
        .getRange(2, column)
        .setFormula(value.formula)
        // Copy to rest rows
        .copyTo(sheet.getRange(3, column, lastRow - 2));
    });
  }

  /**
   * Initializes the Simulations sheet with its headers.
   */
  initializeSheet(): void {
    this.spreadsheetService.insertSheet(
      SimulationsSheet.SIM_SHEET,
      this.getSimulationsHeaders()
    );
  }
}
