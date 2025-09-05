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
  AdGroupResponse,
  AdGroupSimulationResponse,
  BiddingStrategyResponse,
  BiddingStrategySimulationResponse,
  CampaignResponse,
  CampaignSimulationResponse,
  GoogleAdsClient,
  StrategyType,
} from '../src/google_ads_client';

describe('GoogleAdsClient', () => {
  let googleAdsClient: GoogleAdsClient;

  beforeEach(() => {
    // Initialize a new client for each test to ensure isolation
    googleAdsClient = new GoogleAdsClient('dev-token', 'mcc-id', ['cid']);
  });

  describe('getEntityTarget', () => {
    describe('for Bidding Strategies', () => {
      it('should return target ROAS for TARGET_ROAS strategy type', () => {
        const biddingStrategy: BiddingStrategyResponse['biddingStrategy'] = {
          resourceName: 'customers/1/biddingStrategies/1',
          name: 'Test tROAS Strategy',
          type: StrategyType.TARGET_ROAS,
          targetRoas: {targetRoas: 0.5},
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.TARGET_ROAS,
          biddingStrategy
        );
        expect(target).toBe(0.5);
      });

      it('should return target CPA for TARGET_CPA strategy type', () => {
        const biddingStrategy: BiddingStrategyResponse['biddingStrategy'] = {
          resourceName: 'customers/1/biddingStrategies/2',
          name: 'Test tCPA Strategy',
          type: StrategyType.TARGET_CPA,
          targetCpa: {targetCpaMicros: 5000000},
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.TARGET_CPA,
          biddingStrategy
        );
        expect(target).toBe(5);
      });
    });

    describe('for Campaigns', () => {
      it('should return target ROAS for MAXIMIZE_CONVERSION_VALUE strategy type', () => {
        const campaign: CampaignResponse['campaign'] = {
          resourceName: 'customers/1/campaigns/1',
          name: 'Test Max Conversion Value Campaign',
          biddingStrategyType: StrategyType.MAXIMIZE_CONVERSION_VALUE,
          maximizeConversionValue: {targetRoas: 0.8},
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.MAXIMIZE_CONVERSION_VALUE,
          campaign
        );
        expect(target).toBe(0.8);
      });

      it('should return target CPA for MAXIMIZE_CONVERSIONS strategy type', () => {
        const campaign: CampaignResponse['campaign'] = {
          resourceName: 'customers/1/campaigns/2',
          name: 'Test Max Conversions Campaign',
          biddingStrategyType: StrategyType.MAXIMIZE_CONVERSIONS,
          maximizeConversions: {targetCpaMicros: 10000000},
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.MAXIMIZE_CONVERSIONS,
          campaign
        );
        expect(target).toBe(10);
      });

      it('should return target ROAS for TARGET_ROAS strategy type', () => {
        const campaign: CampaignResponse['campaign'] = {
          resourceName: 'customers/1/campaigns/3',
          name: 'Test tROAS Campaign',
          biddingStrategyType: StrategyType.TARGET_ROAS,
          targetRoas: {targetRoas: 0.6},
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.TARGET_ROAS,
          campaign
        );
        expect(target).toBe(0.6);
      });
    });

    describe('for Ad Groups', () => {
      it('should return effective target ROAS for TARGET_ROAS strategy type', () => {
        const adGroup: AdGroupResponse['adGroup'] = {
          resourceName: 'customers/1/adGroups/1',
          name: 'Test tROAS Ad Group',
          effectiveTargetRoas: 1.2,
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.TARGET_ROAS,
          adGroup
        );
        expect(target).toBe(1.2);
      });

      it('should return effective target CPA for TARGET_CPA strategy type', () => {
        const adGroup: AdGroupResponse['adGroup'] = {
          resourceName: 'customers/1/adGroups/2',
          name: 'Test tCPA Ad Group',
          effectiveTargetCpaMicros: 15000000,
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.TARGET_CPA,
          adGroup
        );
        expect(target).toBe(15);
      });

      it('should return undefined if no relevant target is present', () => {
        const adGroup: AdGroupResponse['adGroup'] = {
          resourceName: 'customers/1/adGroups/3',
          name: 'Ad Group with no target',
        };
        const target = googleAdsClient.getEntityTarget(
          StrategyType.TARGET_ROAS,
          adGroup
        );
        expect(target).toBeUndefined();
      });
    });
  });

  describe('fetchBiddingStrategySimulations', () => {
    it('should call searchStream with the correct query for bidding strategy simulations', () => {
      // Arrange
      const mockResponse: BiddingStrategySimulationResponse[] = [];
      const searchStreamSpy = jest
        .spyOn(googleAdsClient, 'searchStream')
        .mockReturnValue(mockResponse);

      const expectedQuery = `
          SELECT
            bidding_strategy.resource_name,
            bidding_strategy_simulation.bidding_strategy_id,
            bidding_strategy_simulation.type,
            bidding_strategy.type,
            bidding_strategy_simulation.start_date,
            bidding_strategy_simulation.end_date,
            bidding_strategy_simulation.target_roas_point_list.points,
            bidding_strategy_simulation.target_cpa_point_list.points,
            bidding_strategy.name,
            bidding_strategy.target_roas.target_roas,
            bidding_strategy.target_cpa.target_cpa_micros,
            customer.descriptive_name
          FROM bidding_strategy_simulation
          WHERE bidding_strategy_simulation.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
            AND bidding_strategy.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')`;

      // Act
      const result = googleAdsClient.fetchBiddingStrategySimulations();

      // Assert
      expect(searchStreamSpy).toHaveBeenCalledTimes(1);
      expect(searchStreamSpy).toHaveBeenCalledWith(expectedQuery);
      expect(result).toBe(mockResponse);
    });
  });

  describe('fetchCampaignSimulations', () => {
    it('should call searchStream with the correct query for campaign simulations', () => {
      // Arrange
      const mockResponse: CampaignSimulationResponse[] = [];
      const searchStreamSpy = jest
        .spyOn(googleAdsClient, 'searchStream')
        .mockReturnValue(mockResponse);

      const expectedQuery = `
        SELECT
          customer.descriptive_name,
          campaign.resource_name,
          campaign.name,
          campaign_simulation.type,
          campaign.bidding_strategy_type,
          campaign.maximize_conversion_value.target_roas,
          campaign.maximize_conversions.target_cpa_micros,
          campaign.target_cpa.target_cpa_micros,
          campaign.target_roas.target_roas,
          campaign_simulation.campaign_id,
          campaign_simulation.start_date,
          campaign_simulation.end_date,
          campaign_simulation.target_roas_point_list.points,
          campaign_simulation.target_cpa_point_list.points
        FROM campaign_simulation
        WHERE campaign_simulation.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
          AND campaign_simulation.modification_method != "SCALING"
          AND campaign.bidding_strategy_type IN ('${StrategyType.MAXIMIZE_CONVERSION_VALUE}', '${StrategyType.MAXIMIZE_CONVERSIONS}',
          '${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
          AND campaign.bidding_strategy IS NULL
      `;

      // Act
      const result = googleAdsClient.fetchCampaignSimulations();

      // Assert
      expect(searchStreamSpy).toHaveBeenCalledTimes(1);
      expect(searchStreamSpy).toHaveBeenCalledWith(expectedQuery);
      expect(result).toBe(mockResponse);
    });
  });

  describe('fetchAdGroupSimulations', () => {
    it('should call searchStream with the correct query for ad group simulations', () => {
      // Arrange
      const mockResponse: AdGroupSimulationResponse[] = [];
      const searchStreamSpy = jest
        .spyOn(googleAdsClient, 'searchStream')
        .mockReturnValue(mockResponse);

      const expectedQuery = `
        SELECT
          customer.descriptive_name,
          ad_group.resource_name,
          ad_group.name,
          ad_group_simulation.type,
          ad_group.effective_target_cpa_micros,
          ad_group.effective_target_roas,
          ad_group_simulation.ad_group_id,
          ad_group_simulation.start_date,
          ad_group_simulation.end_date,
          ad_group_simulation.target_roas_point_list.points,
          ad_group_simulation.target_cpa_point_list.points
        FROM ad_group_simulation
        WHERE ad_group_simulation.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
      `;

      // Act
      const result = googleAdsClient.fetchAdGroupSimulations();

      // Assert
      expect(searchStreamSpy).toHaveBeenCalledTimes(1);
      expect(searchStreamSpy).toHaveBeenCalledWith(expectedQuery);
      expect(result).toBe(mockResponse);
    });
  });
});