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

import {SpreadsheetService} from './spreadsheet_service';
import {
  AdGroupResponse,
  BiddingStrategyResponse,
  CampaignResponse,
  GoogleAdsClient,
  StrategyType,
} from './google_ads_client';

// Date ranges to include on the list of bidding targets
// https://developers.google.com/google-ads/api/docs/query/date-ranges#predefined_date_range
const DATE_RANGES = ['LAST_30_DAYS'];

// Metrics to include on the list of bidding targets (GAQL naming)
const TARGETS_METRICS = [
  'conversions',
  'conversions_value',
  'cost_micros',
  'average_cpc',
];

/**
 * Enum for Targets sheet columns
 */
export enum TargetsLabelsIndex {
  ID = 0,
  NAME = 1,
  STRATEGY_TYPE = 2,
  CURRENT_TARGET = 3,
  NEW_TARGET = 4,
}

/**
 * A class for handling operations related to the "Targets" sheet.
 */
export class TargetsSheet {
  static readonly TARGETS_SHEET = 'Targets';

  constructor(private spreadsheetService: SpreadsheetService) {}

  /**
   * Initializes the Targets sheet with its headers.
   */
  initializeSheet(): void {
    this.spreadsheetService.insertSheet(
      TargetsSheet.TARGETS_SHEET,
      this.getTargetsHeaders()
    );
  }

  /**
   * Loads bidding targets from the API to the spreadsheet.
   * @param googleAdsClient instance of GoogleAdsClient
   */
  load(googleAdsClient: GoogleAdsClient): void {
    const apiRows = this.getAllTargets(googleAdsClient);
    this.spreadsheetService.updateRows(
      TargetsSheet.TARGETS_SHEET,
      apiRows,
      TargetsLabelsIndex.ID
    );
  }

  /**
   * Updates bidding strategy targets via Google Ads API.
   * @param googleAdsClient instance of GoogleAdsClient
   */
  update(googleAdsClient: GoogleAdsClient): void {
    const editData = this.spreadsheetService
      .getSpreadsheet(TargetsSheet.TARGETS_SHEET)
      .getDataRange()
      .getValues();

    // Update only the rows that contain a changed ROAS or CPA target
    const toUpdate = editData.filter(r => {
      if (
        r[TargetsLabelsIndex.NEW_TARGET] !==
        r[TargetsLabelsIndex.CURRENT_TARGET]
      ) {
        return (
          r[TargetsLabelsIndex.NEW_TARGET] !== '' &&
          Number(r[TargetsLabelsIndex.NEW_TARGET]) > 0
        );
      }
      return false;
    });

    const cids = googleAdsClient.getCids();
    for (const cid of cids) {
      // Populate update operations by first filtering on the CID
      const biddingStrategyOperations = toUpdate
        .filter(r => {
          return (
            r[TargetsLabelsIndex.ID].indexOf(cid + '/biddingStrategies') > -1
          );
        })
        .map(r => this.createBiddingStrategyOperation(r));

      const campaignOperations = toUpdate
        .filter(r => {
          return r[TargetsLabelsIndex.ID].indexOf(cid + '/campaigns') > -1;
        })
        .map(r => this.createCampaignOperation(r));

      const adGroupOperations = toUpdate
        .filter(r => {
          return r[TargetsLabelsIndex.ID].indexOf(cid + '/adGroups') > -1;
        })
        .map(r => this.createAdGroupOperation(r));

      const mutateOperations = [
        ...biddingStrategyOperations,
        ...campaignOperations,
        ...adGroupOperations,
      ];

      if (mutateOperations.length > 0) {
        googleAdsClient.mutateTargets(cid, mutateOperations);
      }
    }

    this.load(googleAdsClient);
  }

  private getTargetsHeaders(): string[] {
    const headers: string[] = [];
    headers[TargetsLabelsIndex.ID] = 'ID';
    headers[TargetsLabelsIndex.NAME] = 'Name';
    headers[TargetsLabelsIndex.STRATEGY_TYPE] = 'Bidding strategy type';
    headers[TargetsLabelsIndex.CURRENT_TARGET] = 'Current target';
    headers[TargetsLabelsIndex.NEW_TARGET] = 'New target';

    // Build the metrics x date ranges columns
    for (const m of TARGETS_METRICS) {
      const metricHeader = this.getMetricHeader(m);
      for (const d of DATE_RANGES) {
        headers.push(`${metricHeader} - ${d}`);
      }
    }

    return headers;
  }

  private getMetricHeader(metricName: string): string {
    if (metricName === 'cost_micros') {
      return 'cost';
    }
    // Replace underscore with space
    return metricName.replace(/_/g, ' ');
  }

  private getAllTargets(
    googleAdsClient: GoogleAdsClient
  ): Array<Array<string | number | ''>> {
    const portfolioTargets = this.getPortfolioTargets(googleAdsClient);
    const campaignTargets = this.getCampaignTargets(googleAdsClient);
    const adGroupTargets = this.getAdGroupTargets(googleAdsClient);

    return [...portfolioTargets, ...campaignTargets, ...adGroupTargets];
  }

  private getPortfolioTargetsByDateRange(googleAdsClient: GoogleAdsClient): {
    [key: string]: BiddingStrategyResponse[];
  } {
    const columns = [
      'bidding_strategy.name',
      'bidding_strategy.type',
      'bidding_strategy.target_roas.target_roas',
      'bidding_strategy.target_cpa.target_cpa_micros',
      'bidding_strategy.maximize_conversion_value.target_roas',
      'bidding_strategy.maximize_conversions.target_cpa_micros',
    ];
    const selectGaql = this.buildGaqlColumns(columns);

    const portfolioStrategies: {[key: string]: BiddingStrategyResponse[]} = {};
    for (const d of DATE_RANGES) {
      const query = `
                 SELECT ${selectGaql}
                 FROM bidding_strategy
                 WHERE
                   bidding_strategy.status = 'ENABLED'
                   AND bidding_strategy.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}',
                                                  '${StrategyType.MAXIMIZE_CONVERSIONS}', '${StrategyType.MAXIMIZE_CONVERSION_VALUE}')
                   AND segments.date DURING ${d}`;
      portfolioStrategies[d] =
        googleAdsClient.searchStream<BiddingStrategyResponse>(query);
    }

    return portfolioStrategies;
  }

  private getPortfolioTargets(
    googleAdsClient: GoogleAdsClient
  ): Array<Array<string | number | ''>> {
    const portfolioStrategies =
      this.getPortfolioTargetsByDateRange(googleAdsClient);

    // Keep only CPA and ROAS strategies
    const rows = portfolioStrategies[DATE_RANGES[0]]
      .filter(r => {
        return r.biddingStrategy.targetRoas || r.biddingStrategy.targetCpa;
      })
      .map(r => {
        const row: Array<string | number | ''> = [];
        row[TargetsLabelsIndex.ID] = r.biddingStrategy.resourceName;
        row[TargetsLabelsIndex.NAME] = r.biddingStrategy.name;
        row[TargetsLabelsIndex.STRATEGY_TYPE] = r.biddingStrategy.type;
        row[TargetsLabelsIndex.CURRENT_TARGET] = this.getTargetFromType(
          r.biddingStrategy.type,
          r.biddingStrategy
        );
        row[TargetsLabelsIndex.NEW_TARGET] = '';

        for (const m of TARGETS_METRICS) {
          for (const d of DATE_RANGES) {
            const entry = portfolioStrategies[d].find(
              group =>
                group.biddingStrategy.resourceName ===
                r.biddingStrategy.resourceName
            );
            row.push(this.readMetric(entry, m));
          }
        }

        return row;
      });

    return rows;
  }

  private getCampaignTargetsByDateRange(googleAdsClient: GoogleAdsClient): {
    [key: string]: CampaignResponse[];
  } {
    const columns = [
      'campaign.name',
      'campaign.bidding_strategy_type',
      'campaign.target_roas.target_roas',
      'campaign.target_cpa.target_cpa_micros',
      'campaign.maximize_conversion_value.target_roas',
      'campaign.maximize_conversions.target_cpa_micros',
    ];
    const selectGaql = this.buildGaqlColumns(columns);
    const campaigns: {[key: string]: CampaignResponse[]} = {};
    for (const d of DATE_RANGES) {
      const query = `
                 SELECT ${selectGaql}
                 FROM campaign
                 WHERE
                   campaign.status != 'REMOVED'
                   AND segments.date DURING ${d}
                   AND campaign.bidding_strategy IS NULL
                   AND campaign.bidding_strategy_type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}',
                                                          '${StrategyType.MAXIMIZE_CONVERSIONS}', '${StrategyType.MAXIMIZE_CONVERSION_VALUE}')`;
      campaigns[d] = googleAdsClient.searchStream<CampaignResponse>(query);
    }
    return campaigns;
  }

  private getCampaignTargets(
    googleAdsClient: GoogleAdsClient
  ): Array<Array<string | number | ''>> {
    const campaigns = this.getCampaignTargetsByDateRange(googleAdsClient);

    // Keep only CPA and ROAS strategies
    const rows = campaigns[DATE_RANGES[0]]
      .filter(r => {
        return (
          r.campaign.maximizeConversionValue ||
          r.campaign.maximizeConversions ||
          r.campaign.targetRoas
        );
      })
      .map(r => {
        const row: Array<string | number | ''> = [];
        row[TargetsLabelsIndex.ID] = r.campaign.resourceName;
        row[TargetsLabelsIndex.NAME] = r.campaign.name;
        row[TargetsLabelsIndex.STRATEGY_TYPE] = r.campaign.biddingStrategyType;
        row[TargetsLabelsIndex.CURRENT_TARGET] = this.getTargetFromType(
          r.campaign.biddingStrategyType,
          r.campaign
        );
        row[TargetsLabelsIndex.NEW_TARGET] = '';

        for (const m of TARGETS_METRICS) {
          for (const d of DATE_RANGES) {
            const entry = campaigns[d].find(
              group => group.campaign.resourceName === r.campaign.resourceName
            );
            row.push(this.readMetric(entry, m));
          }
        }

        return row;
      });

    return rows;
  }

  private getAdGroupTargetsByDateRange(
    googleAdsClient: GoogleAdsClient,
    targetField = 'ad_group.target_roas'
  ): {
    [key: string]: AdGroupResponse[];
  } {
    const columns = [
      'ad_group.name',
      'campaign.bidding_strategy_type',
      targetField,
    ];
    const selectGaql = this.buildGaqlColumns(columns);
    const ad_groups: {[key: string]: AdGroupResponse[]} = {};
    for (const d of DATE_RANGES) {
      const query = `
                 SELECT ${selectGaql}
                 FROM ad_group
                 WHERE
                   ad_group.status != 'REMOVED'
                   AND ${targetField} > 0
                   AND segments.date DURING ${d}
                   AND campaign.bidding_strategy_type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}',
                                                          '${StrategyType.MAXIMIZE_CONVERSIONS}', '${StrategyType.MAXIMIZE_CONVERSION_VALUE}')`;
      ad_groups[d] = googleAdsClient.searchStream<AdGroupResponse>(query);
    }
    return ad_groups;
  }

  private getAdGroupTargets(
    googleAdsClient: GoogleAdsClient
  ): Array<Array<string | number | ''>> {
    const ad_groups_roas = this.getAdGroupTargetsByDateRange(
      googleAdsClient,
      'ad_group.target_roas'
    );
    const ad_groups_cpa = this.getAdGroupTargetsByDateRange(
      googleAdsClient,
      'ad_group.target_cpa_micros'
    );
    const ad_groups: {[key: string]: AdGroupResponse[]} = {};

    for (const d of DATE_RANGES) {
      ad_groups[d] = [...ad_groups_roas[d], ...ad_groups_cpa[d]];
    }

    // Keep only ad group level CPA and ROAS strategies
    const rows = ad_groups[DATE_RANGES[0]].map(r => {
      const row: Array<string | number | ''> = [];
      row[TargetsLabelsIndex.ID] = r.adGroup.resourceName;
      row[TargetsLabelsIndex.NAME] = r.adGroup.name;
      row[TargetsLabelsIndex.STRATEGY_TYPE] = r.campaign.biddingStrategyType;
      if (
        [
          StrategyType.TARGET_ROAS,
          StrategyType.MAXIMIZE_CONVERSION_VALUE,
        ].includes(r.campaign.biddingStrategyType) &&
        r.adGroup.targetRoas
      ) {
        row[TargetsLabelsIndex.CURRENT_TARGET] = r.adGroup.targetRoas;
      } else if (
        [StrategyType.TARGET_CPA, StrategyType.MAXIMIZE_CONVERSIONS].includes(
          r.campaign.biddingStrategyType
        ) &&
        r.adGroup.targetCpaMicros
      ) {
        row[TargetsLabelsIndex.CURRENT_TARGET] = r.adGroup.targetCpaMicros;
      }
      row[TargetsLabelsIndex.NEW_TARGET] = '';

      for (const m of TARGETS_METRICS) {
        for (const d of DATE_RANGES) {
          const entry = ad_groups[d].find(
            group => group.adGroup.resourceName === r.adGroup.resourceName
          );
          row.push(this.readMetric(entry, m));
        }
      }

      return row;
    });

    return rows;
  }

  private getTargetFromType(
    type: StrategyType,
    entity:
      | CampaignResponse['campaign']
      | BiddingStrategyResponse['biddingStrategy']
  ): number {
    if (type === StrategyType.TARGET_ROAS && entity.targetRoas) {
      return entity.targetRoas?.targetRoas;
    } else if (type === StrategyType.TARGET_CPA && entity.targetCpa) {
      return entity.targetCpa?.targetCpaMicros;
    } else if (
      type === StrategyType.MAXIMIZE_CONVERSION_VALUE &&
      entity.maximizeConversionValue
    ) {
      return entity.maximizeConversionValue?.targetRoas;
    } else if (
      type === StrategyType.MAXIMIZE_CONVERSIONS &&
      entity.maximizeConversions
    ) {
      return entity.maximizeConversions?.targetCpaMicros;
    }

    throw new Error(`Cannot read target for entity with type ${type}`);
  }

  private buildGaqlColumns(columns: string[]): string {
    // Add metrics. prefix for GAQL
    const metricsFq = TARGETS_METRICS.map(m => 'metrics.' + m);
    columns.push(...metricsFq);
    return columns.join(', ');
  }

  private readMetric(
    entry:
      | AdGroupResponse
      | CampaignResponse
      | BiddingStrategyResponse
      | undefined,
    metricName: string
  ): number | string {
    if (!entry || !entry.metrics) {
      return '';
    }
    const metric = this.getMetricApiNotation(metricName);
    const metrics = entry.metrics as Record<string, number | undefined>;
    const value = metrics[metric];

    if (['cost_micros', 'average_cpc'].indexOf(metricName) > -1) {
      return (value || 0) / 1e6;
    }
    return value ?? '';
  }

  private getMetricApiNotation(metricName: string): string {
    // Replace underscore followed by letter with just uppercase letter
    return metricName.replace(/(_.)/g, (_m, chr) => chr[1].toUpperCase());
  }

  private createBiddingStrategyOperation(
    row: Array<string | number>
  ): GoogleAds.BiddingStrategyOperation {
    return {biddingStrategyOperation: this.createBiddingOperation(row)};
  }

  private createCampaignOperation(
    row: Array<string | number>
  ): GoogleAds.CampaignOperation {
    return {campaignOperation: this.createBiddingOperation(row)};
  }

  private createBiddingOperation(row: Array<string | number>): {
    updateMask: string;
    update: {
      resourceName: string;
      maximizeConversionValue?: {
        targetRoas: number;
      };
      maximizeConversions?: {
        targetCpaMicros: number;
      };
      targetRoas?: {
        targetRoas: number;
      };
      targetCpa?: {
        targetCpaMicros: number;
      };
    };
  } {
    if (
      row[TargetsLabelsIndex.STRATEGY_TYPE] ===
      StrategyType.MAXIMIZE_CONVERSION_VALUE
    ) {
      return {
        updateMask: 'maximizeConversionValue.targetRoas',
        update: {
          resourceName: row[TargetsLabelsIndex.ID] as string,
          maximizeConversionValue: {
            targetRoas: row[TargetsLabelsIndex.NEW_TARGET] as number,
          },
        },
      };
    } else if (
      row[TargetsLabelsIndex.STRATEGY_TYPE] ===
      StrategyType.MAXIMIZE_CONVERSIONS
    ) {
      return {
        updateMask: 'maximizeConversions.targetCpaMicros',
        update: {
          resourceName: row[TargetsLabelsIndex.ID] as string,
          maximizeConversions: {
            targetCpaMicros: row[TargetsLabelsIndex.NEW_TARGET] as number,
          },
        },
      };
    } else if (
      row[TargetsLabelsIndex.STRATEGY_TYPE] === StrategyType.TARGET_ROAS
    ) {
      return {
        updateMask: 'targetRoas.targetRoas',
        update: {
          resourceName: row[TargetsLabelsIndex.ID] as string,
          targetRoas: {
            targetRoas: row[TargetsLabelsIndex.NEW_TARGET] as number,
          },
        },
      };
    } else if (
      row[TargetsLabelsIndex.STRATEGY_TYPE] === StrategyType.TARGET_CPA
    ) {
      return {
        updateMask: 'targetCpa.targetCpaMicros',
        update: {
          resourceName: row[TargetsLabelsIndex.ID] as string,
          targetCpa: {
            targetCpaMicros: row[TargetsLabelsIndex.NEW_TARGET] as number,
          },
        },
      };
    }

    throw new Error(
      `Invalid strategy type: ${row[TargetsLabelsIndex.STRATEGY_TYPE]}`
    );
  }

  private createAdGroupOperation(
    row: Array<string | number>
  ): GoogleAds.AdGroupOperation {
    if (
      [
        StrategyType.TARGET_ROAS,
        StrategyType.MAXIMIZE_CONVERSION_VALUE,
      ].includes(row[TargetsLabelsIndex.STRATEGY_TYPE] as StrategyType)
    ) {
      return {
        adGroupOperation: {
          updateMask: 'targetRoas',
          update: {
            resourceName: row[TargetsLabelsIndex.ID] as string,
            targetRoas: row[TargetsLabelsIndex.NEW_TARGET] as number,
          },
        },
      };
    } else if (
      [StrategyType.TARGET_CPA, StrategyType.MAXIMIZE_CONVERSIONS].includes(
        row[TargetsLabelsIndex.STRATEGY_TYPE] as StrategyType
      )
    ) {
      return {
        adGroupOperation: {
          updateMask: 'targetCpaMicros',
          update: {
            resourceName: row[TargetsLabelsIndex.ID] as string,
            targetCpaMicros: row[TargetsLabelsIndex.NEW_TARGET] as number,
          },
        },
      };
    }

    throw new Error(
      `Invalid ad group operation for strategy type: ${
        row[TargetsLabelsIndex.STRATEGY_TYPE]
      }`
    );
  }
}
