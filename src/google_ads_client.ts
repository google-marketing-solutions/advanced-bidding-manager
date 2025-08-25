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

/**
 * The Google Ads API endpoint.
 */
export const API_ENDPOINT = 'https://googleads.googleapis.com/v20/customers/';

/**
 * The bidding strategy type.
 */
export enum StrategyType {
  TARGET_ROAS = 'TARGET_ROAS',
  TARGET_CPA = 'TARGET_CPA',
  MAXIMIZE_CONVERSION_VALUE = 'MAXIMIZE_CONVERSION_VALUE',
  MAXIMIZE_CONVERSIONS = 'MAXIMIZE_CONVERSIONS',
}

/**
 * An interface for the Ad Group response from the Google Ads API.
 */
export interface AdGroupResponse {
  adGroup: {
    resourceName: string;
    name: string;
    targetRoas?: number;
    targetCpaMicros?: number;
    effectiveTargetRoas?: number;
    effectiveTargetCpaMicros?: number;
  };
  campaign: {
    biddingStrategyType: StrategyType;
  };
  metrics: {
    conversions?: number;
    conversionsValue?: number;
    costMicros?: number;
    averageCpc?: number;
  };
}

/**
 * An interface for the Campaign response from the Google Ads API.
 */
export interface CampaignResponse {
  campaign: {
    resourceName: string;
    name: string;
    biddingStrategyType: StrategyType;
    targetRoas?: {
      targetRoas: number;
    };
    targetCpa?: {
      targetCpaMicros: number;
    };
    maximizeConversionValue?: {
      targetRoas: number;
    };
    maximizeConversions?: {
      targetCpaMicros: number;
    };
  };
  metrics: {
    conversions?: number;
    conversionsValue?: number;
    costMicros?: number;
    averageCpc?: number;
  };
}

/**
 * An interface for the Bidding Strategy response from the Google Ads API.
 */
export interface BiddingStrategyResponse {
  biddingStrategy: {
    resourceName: string;
    name: string;
    type: StrategyType;
    targetRoas?: {
      targetRoas: number;
    };
    targetCpa?: {
      targetCpaMicros: number;
    };
    maximizeConversionValue?: {
      targetRoas: number;
    };
    maximizeConversions?: {
      targetCpaMicros: number;
    };
  };
  metrics: {
    conversions?: number;
    conversionsValue?: number;
    costMicros?: number;
    averageCpc?: number;
  };
}

/**
 * An interface for the Customer Client response from the Google Ads API.
 */
export interface CustomerClientResponse {
  customerClient: {
    clientCustomer: string;
    level: number;
    manager: boolean;
    descriptiveName: string;
    id: string;
  };
}

/**
 * The common metrics for a single point in a simulation.
 */
export interface SimulationPointMetrics {
  biddableConversions: number;
  biddableConversionsValue: number;
  clicks: number;
  costMicros: number;
  impressions: number;
  topSlotImpressions: number;
}

/**
 * A simulation point for a Target ROAS campaign.
 */
export interface TargetRoasPoint extends SimulationPointMetrics {
  targetRoas: number;
}

/**
 * A simulation point for a Target CPA campaign.
 */
export interface TargetCpaPoint extends SimulationPointMetrics {
  targetCpaMicros: number;
}

/**
 * A type representing any possible simulation point.
 */
export type SimulationPoint = TargetRoasPoint | TargetCpaPoint;

/**
 * The common properties for a simulation object.
 */
export interface BaseSimulation {
  type: StrategyType;
  startDate: string;
  endDate: string;
  targetRoasPointList?: {
    points: TargetRoasPoint[];
  };
  targetCpaPointList?: {
    points: TargetCpaPoint[];
  };
}

/**
 * A base interface for simulation responses.
 */
export interface BaseSimulationResponse {
  customer: {
    descriptiveName: string;
  };
}

/**
 * An interface for the Campaign Simulation response from the Google Ads API.
 */
export interface CampaignSimulationResponse extends BaseSimulationResponse {
  campaignSimulation: BaseSimulation & {
    campaignId: string;
  };
  campaign: {
    name: string;
    biddingStrategyType: StrategyType;
    maximizeConversionValue?: {
      targetRoas: number;
    };
    maximizeConversions?: {
      targetCpaMicros: number;
    };
    targetCpa?: {
      targetCpaMicros: number;
    };
    targetRoas?: {
      targetRoas: number;
    };
  };
}

/**
 * An interface for the Ad Group Simulation response from the Google Ads API.
 */
export interface AdGroupSimulationResponse extends BaseSimulationResponse {
  adGroupSimulation: BaseSimulation & {
    adGroupId: string;
  };
  adGroup: {
    name: string;
    effectiveTargetCpaMicros?: number;
    effectiveTargetRoas?: number;
  };
}

/**
 * An interface for the Bidding Strategy Simulation response from the Google Ads API.
 */
export interface BiddingStrategySimulationResponse
  extends BaseSimulationResponse {
  biddingStrategySimulation: BaseSimulation & {
    biddingStrategyId: string;
  };
  biddingStrategy: {
    type: StrategyType;
    name: string;
    targetRoas?: {
      targetRoas: number;
    };
    targetCpa?: {
      targetCpaMicros: number;
    };
  };
}

/**
 * A client for interacting with the Google Ads API.
 */
export class GoogleAdsClient {
  /**
   * @param devToken The developer token.
   * @param loginCustomerId The login customer ID.
   * @param cids The customer IDs to run against.
   */
  constructor(
    private devToken: string,
    private loginCustomerId: string,
    private cids: string[]
  ) {}

  /**
   * Returns the configured customer IDs.
   * @return The customer IDs.
   */
  getCids(): string[] {
    return this.cids;
  }

  /**
   * Calls searchStream for all configured CIDs.
   *
   * It will use AdsApp if run in the Google Ads Scripts environment, otherwise
   * it will use the Google Ads API.
   * @param query The GAQL query.
   * @return The aggregated results.
   */
  searchStream<T>(query: string): T[] {
    if (typeof AdsApp !== 'undefined') {
      return this.searchStreamAdsApp<T>(this.cids, query);
    }

    return this.searchStreamApi<T>(this.cids, query);
  }

  /**
   * Calls searchStream via Google Ads API.
   * @param cids The customer IDs.
   * @param query The GAQL query.
   * @return The aggregated results.
   */
  searchStreamApi<T>(cids: string[], query: string): T[] {
    const aggregate: T[] = [];

    for (const cid of cids) {
      const url = `${API_ENDPOINT}${cid}/googleAds:searchStream`;
      const response = this.callApi<T>(url, {query});
      aggregate.push(...response.results);
    }
    return aggregate;
  }

  /**
   * Calls searchStream via AdsApp.
   * @param cids The customer IDs.
   * @param query The GAQL query.
   * @return The aggregated results.
   */
  searchStreamAdsApp<T>(cids: string[], query: string): T[] {
    const results: T[] = [];
    const childAccounts = AdsManagerApp.accounts().withIds(cids).get();

    while (childAccounts.hasNext()) {
      const childAccount = childAccounts.next();
      AdsManagerApp.select(childAccount);
      const rows = AdsApp.search(query);
      while (rows.hasNext()) {
        results.push(rows.next() as T);
      }
    }

    return results;
  }

  mutateTargets(
    cid: string,
    mutateOperations: GoogleAds.MutateOperation[]
  ): void {
    if (typeof AdsApp !== 'undefined') {
      return this.mutateTargetsAdsApp(cid, mutateOperations);
    }

    const url = API_ENDPOINT + cid + '/googleAds:mutate';
    this.callApi(url, {mutateOperations});
  }

  mutateTargetsAdsApp(
    cid: string,
    operations: GoogleAds.MutateOperation[]
  ): void {
    const formattedCid = this.formatCid(cid);
    const accountIterator = AdsManagerApp.accounts()
      .withIds([formattedCid])
      .get();
    if (!accountIterator.hasNext()) {
      throw new Error(`Google Ads account with CID ${formattedCid} not found.`);
    }

    const account = accountIterator.next();
    AdsManagerApp.select(account);

    try {
      const mutateResults: GoogleAds.MutateResult[] =
        AdsApp.mutateAll(operations);
      for (const mutateResult of mutateResults) {
        if (!mutateResult.isSuccessful()) {
          Logger.log(mutateResult.getErrorMessages().join('\n'));
        }
      }
    } catch (e: unknown) {
      Logger.log(`Failed to execute operation for account ${cid}. Error: ${e}`);
    }
  }

  /**
   * Formats a 10-digit customer ID into XXX-XXX-XXXX format.
   * @param cid The customer ID to format.
   * @return The formatted customer ID.
   * @throws An error if the CID is not 10 digits long or contains non-digits.
   */
  private formatCid(cid: string): string {
    if (cid.length !== 10 || !/^\d+$/.test(cid)) {
      throw new Error(`Invalid CID '${cid}'. Expected a 10-digit string.`);
    }
    return [cid.slice(0, 3), cid.slice(3, 6), cid.slice(6, 10)].join('-');
  }

  /**
   * Calls Ads API (POST).
   * @param url The API endpoint URL.
   * @param data The payload to send.
   * @return The API response.
   * @throws An error if the API call fails.
   */
  callApi<T>(url: string, data?: object): ApiResponse<T> {
    const headers: GoogleAppsScript.URL_Fetch.HttpHeaders = {};
    const token = ScriptApp.getOAuthToken();
    headers['Authorization'] = 'Bearer ' + token;
    headers['developer-token'] = this.devToken;
    if (this.loginCustomerId) {
      headers['login-customer-id'] = this.loginCustomerId;
    }

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'post',
      contentType: 'application/json',
      headers,
      muteHttpExceptions: true,
    };

    if (data) {
      options['payload'] = JSON.stringify(data);
    }

    const response = UrlFetchApp.fetch(url, options);

    if (response.getResponseCode() >= 400) {
      const errorContent = JSON.parse(response.getContentText());
      Logger.log(errorContent);
      throw new Error(`API error: ${errorContent.error.message}`);
    }

    const responseContentText = JSON.parse(response.getContentText());

    // searchStream returns the response wrapped in a JSON array
    if (url.includes('searchStream')) {
      const streamResults: ApiResponse<T> = {
        results: [],
      };
      for (const r of responseContentText) {
        if ("results" in r) {
          streamResults.results.push(...r.results);
        }
      }

      return streamResults;
    } else {
      return responseContentText as ApiResponse<T>;
    }
  }
}

interface ApiResponse<T> {
  error?: {
    message: string;
  };
  results: T[];
}
