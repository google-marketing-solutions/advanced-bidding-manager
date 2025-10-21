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

import {Curve} from './curve';
import {
  AdGroupResponse,
  BaseSimulation,
  BiddingStrategyResponse,
  CampaignResponse,
  GoogleAdsClient,
  SimulationPoint,
  StrategyType,
} from './google_ads_client';
import {TargetAnalyzer} from './target_analyzer';
import {SpreadsheetService} from './spreadsheet_service';
/**
 * Enum for Suggested Targets sheet columns
 */
export enum SuggestedTargetsLabelsIndex {
  BIDDING_STRATEGY_ID = 0,
  BIDDING_STRATEGY_NAME = 1,
  BIDDING_STRATEGY_TYPE = 2,
  CURRENT_TARGET = 3,
  SUGGESTED_TARGET = 4,
  OPTIMAL_TARGET = 5,
  CURRENT_PROFIT = 6,
  SUGGESTED_PROFIT = 7,
  OPTIMAL_PROFIT = 8,
  CURRENT_COST = 9,
  SUGGESTED_COST = 10,
  OPTIMAL_COST = 11,
  CURRENT_CONVERSION_VALUE = 12,
  SUGGESTED_CONVERSION_VALUE = 13,
  OPTIMAL_CONVERSION_VALUE = 14,
  CURRENT_CLICKS = 15,
  SUGGESTED_CLICKS = 16,
  OPTIMAL_CLICKS = 17,
  CURRENT_IMPRESSIONS = 18,
  SUGGESTED_IMPRESSIONS = 19,
  OPTIMAL_IMPRESSIONS = 20,
  CURRENT_CONVERSIONS = 21,
  SUGGESTED_CONVERSIONS = 22,
  OPTIMAL_CONVERSIONS = 23,
}

/**
 * A class for handling operations related to the "Suggestions" sheet.
 */
export class SuggestedTargetsSheet {
  static readonly SUGGESTED_TARGETS_SHEET = 'Suggestions';
  static readonly METRIC_TO_OPTIMIZE_TO = 'profit';
  static readonly METRICS = [
    'profit',
    'cost',
    'conversionvalue',
    'clicks',
    'impressions',
    'conversions',
  ];

  constructor(private spreadsheetService: SpreadsheetService) {}

  /**
   * Initializes the Suggestions sheet with its headers.
   */
  initializeSheet(): void {
    this.spreadsheetService.insertSheet(
      SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET,
      this.getSuggestedTargetsHeaders()
    );
  }

  /**
   * Returns the headers for the Suggestions sheet.
   * @return An array of header strings.
   */
  private getSuggestedTargetsHeaders(): string[] {
    const headers: string[] = [];
    headers[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_ID] =
      'Bidding Strategy ID';
    headers[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_NAME] =
      'Bidding Strategy Name';
    headers[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_TYPE] =
      'Bidding Strategy Type';
    headers[SuggestedTargetsLabelsIndex.CURRENT_TARGET] = 'Current Target';
    headers[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] = 'Suggested Target';
    headers[SuggestedTargetsLabelsIndex.OPTIMAL_TARGET] = 'Optimal Target';
    headers[SuggestedTargetsLabelsIndex.CURRENT_PROFIT] = 'Current Profit';
    headers[SuggestedTargetsLabelsIndex.SUGGESTED_PROFIT] = 'Suggested Profit';
    headers[SuggestedTargetsLabelsIndex.OPTIMAL_PROFIT] = 'Optimal Profit';
    headers[SuggestedTargetsLabelsIndex.CURRENT_COST] = 'Current Cost';
    headers[SuggestedTargetsLabelsIndex.SUGGESTED_COST] = 'Suggested Cost';
    headers[SuggestedTargetsLabelsIndex.OPTIMAL_COST] = 'Optimal Cost';
    headers[SuggestedTargetsLabelsIndex.CURRENT_CONVERSION_VALUE] =
      'Current Conversion Value';
    headers[SuggestedTargetsLabelsIndex.SUGGESTED_CONVERSION_VALUE] =
      'Suggested Conversion Value';
    headers[SuggestedTargetsLabelsIndex.OPTIMAL_CONVERSION_VALUE] =
      'Optimal Conversion Value';
    headers[SuggestedTargetsLabelsIndex.CURRENT_CONVERSIONS] =
      'Current Conversions';
    headers[SuggestedTargetsLabelsIndex.SUGGESTED_CONVERSIONS] =
      'Suggested Conversions';
    headers[SuggestedTargetsLabelsIndex.OPTIMAL_CONVERSIONS] =
      'Optimal Conversions';
    headers[SuggestedTargetsLabelsIndex.CURRENT_CLICKS] = 'Current Clicks';
    headers[SuggestedTargetsLabelsIndex.SUGGESTED_CLICKS] = 'Suggested Clicks';
    headers[SuggestedTargetsLabelsIndex.OPTIMAL_CLICKS] = 'Optimal Clicks';
    headers[SuggestedTargetsLabelsIndex.CURRENT_IMPRESSIONS] =
      'Current Impressions';
    headers[SuggestedTargetsLabelsIndex.SUGGESTED_IMPRESSIONS] =
      'Suggested Impressions';
    headers[SuggestedTargetsLabelsIndex.OPTIMAL_IMPRESSIONS] =
      'Optimal Impressions';
    return headers;
  }

  /**
   * Loads suggestions from the API to the spreadsheet.
   * @param googleAdsClient An instance of GoogleAdsClient.
   */
  load(googleAdsClient: GoogleAdsClient): void {
    this.spreadsheetService.clearSheet(
      SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET
    );

    const metricToOptimizeTowards = SuggestedTargetsSheet.METRIC_TO_OPTIMIZE_TO;
    const metrics = SuggestedTargetsSheet.METRICS;

    // Fetch and append strategy suggestions
    const portfolioSuggestions = this.getStrategySuggestions(
      googleAdsClient,
      metricToOptimizeTowards,
      metrics
    );
    this.spreadsheetService.appendRows(
      SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET,
      portfolioSuggestions
    );

    // Fetch and append campaign suggestions
    const campaignSuggestions = this.getCampaignSuggestions(
      googleAdsClient,
      metricToOptimizeTowards,
      metrics
    );
    this.spreadsheetService.appendRows(
      SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET,
      campaignSuggestions
    );

    // Fetch and append ad group suggestions
    const adGroupSuggestions = this.getAdGroupSuggestions(
      googleAdsClient,
      metricToOptimizeTowards,
      metrics
    );
    this.spreadsheetService.appendRows(
      SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET,
      adGroupSuggestions
    );
  }

  /**
   * Fetches and processes bidding strategy suggestions.
   * @param googleAdsClient An instance of GoogleAdsClient.
   * @param metricToOptimizeTowards The metric to optimize towards (e.g., 'profit').
   * @param metrics A list of metrics to include in the suggestions.
   * @return An array of rows for the suggestions sheet.
   */
  private getStrategySuggestions(
    googleAdsClient: GoogleAdsClient,
    metricToOptimizeTowards: string,
    metrics: string[]
  ): Array<Array<string | number>> {
    const sheetRows: Array<Array<string | number>> = [];
    const simulations = googleAdsClient.fetchBiddingStrategySimulations();
    for (const s of simulations) {
      const simulation = s.biddingStrategySimulation;
      const entity = s.biddingStrategy;
      const row = this.generateSuggestionsRow(
        googleAdsClient,
        simulation,
        entity,
        metricToOptimizeTowards,
        metrics
      );
      sheetRows.push(row);
    }
    return sheetRows;
  }

  /**
   * Fetches and processes campaign suggestions.
   * @param googleAdsClient An instance of GoogleAdsClient.
   * @param metricToOptimizeTowards The metric to optimize towards (e.g., 'profit').
   * @param metrics A list of metrics to include in the suggestions.
   * @return An array of rows for the suggestions sheet.
   */
  private getCampaignSuggestions(
    googleAdsClient: GoogleAdsClient,
    metricToOptimizeTowards: string,
    metrics: string[]
  ): Array<Array<string | number>> {
    const sheetRows: Array<Array<string | number>> = [];
    const simulations = googleAdsClient.fetchCampaignSimulations();
    for (const s of simulations) {
      const simulation = s.campaignSimulation;
      const entity = s.campaign;
      const row = this.generateSuggestionsRow(
        googleAdsClient,
        simulation,
        entity,
        metricToOptimizeTowards,
        metrics
      );

      sheetRows.push(row);
    }
    return sheetRows;
  }

  /**
   * Fetches and processes ad group suggestions.
   * @param googleAdsClient An instance of GoogleAdsClient.
   * @param metricToOptimizeTowards The metric to optimize towards (e.g., 'profit').
   * @param metrics A list of metrics to include in the suggestions.
   * @return An array of rows for the suggestions sheet.
   */
  private getAdGroupSuggestions(
    googleAdsClient: GoogleAdsClient,
    metricToOptimizeTowards: string,
    metrics: string[]
  ): Array<Array<string | number>> {
    const sheetRows: Array<Array<string | number>> = [];
    const simulations = googleAdsClient.fetchAdGroupSimulations();
    for (const s of simulations) {
      const simulation = s.adGroupSimulation;
      const entity = s.adGroup;
      const row = this.generateSuggestionsRow(
        googleAdsClient,
        simulation,
        entity,
        metricToOptimizeTowards,
        metrics
      );
      sheetRows.push(row);
    }
    return sheetRows;
  }

  /**
   * Generates a single row of suggestion data for the spreadsheet.
   * @param googleAdsClient An instance of GoogleAdsClient.
   * @param simulation The simulation object.
   * @param entity The entity (bidding strategy, campaign, or ad group).
   * @param metricToOptimizeTowards The metric to optimize towards (e.g., 'profit').
   * @param metrics A list of metrics to include in the suggestions.
   * @return A row of data for the suggestions sheet.
   */
  private generateSuggestionsRow(
    googleAdsClient: GoogleAdsClient,
    simulation: BaseSimulation,
    entity:
      | BiddingStrategyResponse['biddingStrategy']
      | CampaignResponse['campaign']
      | AdGroupResponse['adGroup'],
    metricToOptimizeTowards: string,
    metrics: string[]
  ): Array<string | number> {
    const row = [];

    // Populate initial columns
    row[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_ID] = entity.resourceName;
    row[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_NAME] = entity.name;
    const simType = simulation.type;
    row[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_TYPE] = simType;
    const currentTarget = googleAdsClient.getEntityTarget(simType, entity) ?? 0;
    row[SuggestedTargetsLabelsIndex.CURRENT_TARGET] = currentTarget ?? '';
    const currentFilledInCellsCount = 5;
    const remainingCellsCount =
      this.getSuggestedTargetsHeaders().length - currentFilledInCellsCount;
    const points = googleAdsClient.getPoints(simulation);
    if (!points) {
      row[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] =
        'ERROR: No points found';
      // Fill the row with a fixed size to match the number of headers.
      const emptyRow = new Array(remainingCellsCount).fill('No data points');
      row.push(...emptyRow);
      return row;
    }
    // Initial parameters for the curve fitting algorithm. These values serve as
    // starting guesses for the parameters of the mathematical function used
    // to model the simulation points. The specific meaning of each number
    // depends on the curve type being fitted within the Curve class.

    let initialParams = [-2, 2, -0.5]; // Initial params for power curve
    if (simType === StrategyType.TARGET_CPA) {
      initialParams = [0.1, 1, 25]; // Initial params for polynomial curve
    }

    const curves = this.createCurvesForAllMetrics(
      googleAdsClient,
      simType,
      currentTarget,
      points,
      metrics,
      initialParams
    );

    const [, dataMetric] = this.calculateValuePerMetric(
      googleAdsClient,
      simType,
      points,
      currentTarget,
      metricToOptimizeTowards
    );

    if (dataMetric && metricToOptimizeTowards in curves) {
      const [optimalTarget, suggestedTarget] = this.getTargetSuggestions(
        currentTarget,
        dataMetric,
        curves,
        metricToOptimizeTowards
      );

      row[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] = suggestedTarget ?? '';
      row[SuggestedTargetsLabelsIndex.OPTIMAL_TARGET] = optimalTarget ?? '';

      metrics.forEach(metric => {
        if (metric in curves) {
          const {curve, offset} = curves[metric];
          const getOriginalValue = (target: number | undefined) => {
            const predictedValue = curve.predictValue(target);
            if (predictedValue === undefined || predictedValue === null) {
              return 'N/A';
            }
            return predictedValue - offset; // Subtract the offset
          };

          const currentActualValue = getOriginalValue(currentTarget) ?? 'N/A';
          const suggestedActualValue =
            getOriginalValue(suggestedTarget) ?? 'N/A';
          const optimalActualValue = getOriginalValue(optimalTarget) ?? 'N/A';
          row.push(
            ...[currentActualValue, suggestedActualValue, optimalActualValue]
          );
        } else {
          row.push(...['N/A', 'N/A', 'N/A']);
        }
      });
      return row;
    } else {
      row[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] =
        'ERROR: No data found for optimization metric';
      const emptyRow = new Array(remainingCellsCount).fill('No data points');
      row.push(...emptyRow);
      return row;
    }
  }

  /**
   * Determines suggested and optimal targets.
   * @param currentTarget The current target value.
   * @param dataMetric The metric data points.
   * @param curves An object containing curves for various metrics.
   * @return A tuple containing the optimal and suggested target values.
   */
  private getTargetSuggestions(
    currentTarget: number,
    dataMetric: Array<[number, number]>,
    curves: {[key: string]: {curve: Curve; offset: number}},
    metricToOptimizeTowards: string = SuggestedTargetsSheet.METRIC_TO_OPTIMIZE_TO
  ): [number | undefined, number | undefined] {
    if (dataMetric && dataMetric.length > 0) {
      const {curve} = curves[metricToOptimizeTowards];
      if (curve) {
        const analyzer = new TargetAnalyzer(curve);
        const optimalTarget = analyzer.findOptimalTargetForProfitUnconstrained(
          curve.strategyType
        );
        const suggestedTarget = analyzer.suggestNewTarget(
          currentTarget,
          optimalTarget,
          curve.strategyType
        );
        return [optimalTarget, suggestedTarget];
      } else {
        return [undefined, undefined];
      }
    } else {
      return [undefined, undefined];
    }
  }

  /**
   * Creates and validates curves for all specified metrics.
   * @param googleAdsClient An instance of GoogleAdsClient.
   * @param strategyType The bidding strategy type.
   * @param currentTarget The current target value.
   * @param points The simulation points.
   * @param metrics A list of metrics to create curves for.
   * @param initialParams Initial parameters for curve fitting.
   * @return An object containing validated curves for each metric.
   */
  private createCurvesForAllMetrics(
    googleAdsClient: GoogleAdsClient,
    strategyType: StrategyType,
    currentTarget: number | undefined,
    points: SimulationPoint[],
    metrics: string[],
    initialParams: number[]
  ): {[key: string]: {curve: Curve; offset: number}} {
    const curves: {[key: string]: {curve: Curve, offset: number}} = {};
    metrics.forEach(metric => {
      const [, dataMetric, valueToAdd] = this.calculateValuePerMetric(
        googleAdsClient,
        strategyType,
        points,
        currentTarget,
        metric
      );
      const curve = this.createAndValidateCurve(
        strategyType,
        dataMetric,
        metric,
        initialParams
      );
      if (curve) {
        curves[metric] = {curve, offset: valueToAdd};
      }
    });
    return curves;
  }

  /**
   * Calculates target values and corresponding metric values from simulation points.
   * @param googleAdsClient An instance of GoogleAdsClient.
   * @param strategyType The bidding strategy type.
   * @param points The simulation points.
   * @param currentTarget The current target value.
   * @param metric The metric to calculate values for.
   * @return A list containing the current target, an array of [target, value] pairs and offset.
   */
  private calculateValuePerMetric(
    googleAdsClient: GoogleAdsClient,
    strategyType: StrategyType,
    points: SimulationPoint[],
    currentTarget: number | undefined,
    metric: string
  ): [number | undefined, Array<[number, number]>, number] {
    const targetValues: number[] = [];
    let values: number[] = [];

    if (points) {
      let valueToAdd = 0;
      points.forEach(point => {
        const pTarget = googleAdsClient.getPointTarget(strategyType, point);
        targetValues.push(pTarget);
        try {
          values.push(this.calculateValue(point, metric));
        } catch (e) {
          console.error(
            `Skipping point due to error in metric calculation: ${
              e instanceof Error ? e.message : e
            }`
          );
        }
      });

      const lowestValue = Math.min(...values);
      if (lowestValue < 0) {
        valueToAdd = -lowestValue + 1;
        values = values.map(num => num + valueToAdd); // Ensure all values are positive for curve fitting
      }
      const result = targetValues.map(
        (target, i) => [target, values[i]] as [number, number]
      );
      return [currentTarget, result, valueToAdd];
    }
    return [currentTarget, [], 0]; // Return empty array if no points
  }

  /**
   * Creates and validates a curve for a given metric.
   * @param strategyType The bidding strategy type.
   * @param data The data points for the curve.
   * @param metricName The name of the metric.
   * @param initialParams Initial parameters for curve fitting.
   * @return The validated Curve object, or null if validation fails.
   */
  private createAndValidateCurve(
    strategyType: StrategyType,
    data: Array<[number, number]>,
    metricName: string,
    initialParams: number[]
  ): Curve | null {
    if (data && data.length >= 3) {
      const curve = new Curve(strategyType, data, initialParams, metricName);
      const rSquared = curve.getRSquared();
      if (curve && rSquared !== null && !isNaN(rSquared) && rSquared > 0.8) {
        return curve;
      }
    }
    return null;
  }

  /**
   * Calculates the value of a specific metric from a simulation point.
   * @param point The simulation point.
   * @param metric The name of the metric to calculate.
   * @return The calculated metric value.
   * @throws An error if an invalid metric is requested.
   */
  private calculateValue(point: SimulationPoint, metric: string): number {
    const {
      costMicros,
      biddableConversionsValue,
      clicks,
      biddableConversions,
      impressions,
    } = point;
    let value;
    switch (metric) {
      case 'cost':
        value = costMicros / 1e6;
        break;
      case 'profit':
        value = biddableConversionsValue - costMicros / 1e6;
        break;
      case 'conversionvalue':
        value = biddableConversionsValue;
        break;
      case 'roas':
        value =
          costMicros > 0 ? biddableConversionsValue / (costMicros / 1e6) : 0;
        break;
      case 'clicks':
        value = clicks;
        break;
      case 'conversions':
        value = biddableConversions;
        break;
      case 'impressions':
        value = impressions;
        break;
      default:
        throw new Error(`Invalid metric requested: ${metric}`);
    }
    return value;
  }
}
