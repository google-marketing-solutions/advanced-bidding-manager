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

import {TargetsSheet, TargetsLabelsIndex} from '../src/targets_sheet';
import {SpreadsheetService} from '../src/spreadsheet_service';
import {
  GoogleAdsClient,
  StrategyType,
  BiddingStrategyResponse,
  CampaignResponse,
  AdGroupResponse,
} from '../src/google_ads_client';

// Mock dependencies to isolate the TargetsSheet class for testing.
jest.mock('../src/spreadsheet_service');
jest.mock('../src/google_ads_client');

describe('TargetsSheet', () => {
  let spreadsheetService: jest.Mocked<SpreadsheetService>;
  let googleAdsClient: jest.Mocked<GoogleAdsClient>;
  let targetsSheet: TargetsSheet;

  beforeEach(() => {
    // Create new instances of mocks for each test to ensure isolation.
    spreadsheetService = new SpreadsheetService(
      ''
    ) as jest.Mocked<SpreadsheetService>;
    googleAdsClient = new GoogleAdsClient(
      '',
      '',
      []
    ) as jest.Mocked<GoogleAdsClient>;
    targetsSheet = new TargetsSheet(spreadsheetService);

    // Clear all mock history before each test.
    jest.clearAllMocks();
  });

  describe('initializeSheet', () => {
    it('should insert a new sheet with the correct headers', () => {
      // Act
      targetsSheet.initializeSheet();

      // Assert
      expect(spreadsheetService.insertSheet).toHaveBeenCalledWith(
        TargetsSheet.TARGETS_SHEET,
        expect.any(Array)
      );
      const calledHeaders = spreadsheetService.insertSheet.mock.calls[0][1];
      expect(calledHeaders[TargetsLabelsIndex.ID]).toEqual('ID');
      expect(calledHeaders[TargetsLabelsIndex.NEW_TARGET]).toEqual(
        'New target'
      );
      expect(calledHeaders).toContain('cost - LAST_30_DAYS');
    });
  });

  describe('load', () => {
    it('should fetch all targets and update the spreadsheet', () => {
      // Arrange
      const mockPortfolioResponse: BiddingStrategyResponse[] = [
        {
          biddingStrategy: {
            resourceName: 'customers/1/biddingStrategies/101',
            name: 'Portfolio tROAS',
            type: StrategyType.TARGET_ROAS,
            targetRoas: {targetRoas: 5},
          },
          metrics: {
            conversions: 10,
            conversionsValue: 50,
            costMicros: 10000000,
            averageCpc: 2000000,
          },
        },
      ];
      const mockCampaignResponse: CampaignResponse[] = [
        {
          campaign: {
            resourceName: 'customers/1/campaigns/201',
            name: 'Campaign tCPA',
            biddingStrategyType: StrategyType.MAXIMIZE_CONVERSIONS,
            maximizeConversions: {targetCpaMicros: 20000000},
          },
          metrics: {
            conversions: 10,
            conversionsValue: 50,
            costMicros: 10000000,
            averageCpc: 3000000,
          },
        },
      ];
      const mockAdGroupResponse: AdGroupResponse[] = [
        {
          adGroup: {
            resourceName: 'customers/1/adGroups/301',
            name: 'AdGroup tROAS',
            targetRoas: 3,
          },
          campaign: {biddingStrategyType: StrategyType.TARGET_ROAS},
          metrics: {
            conversions: 10,
            conversionsValue: 50,
            costMicros: 10000000,
            averageCpc: 4000000,
          },
        },
      ];

      (googleAdsClient.searchStream as jest.Mock)
        .mockReturnValueOnce(mockPortfolioResponse) // for getPortfolioTargets
        .mockReturnValueOnce(mockCampaignResponse) // for getCampaignTargets
        .mockReturnValueOnce(mockAdGroupResponse) // for getAdGroupTargetsByDateRange (roas)
        .mockReturnValueOnce([]); // for getAdGroupTargetsByDateRange (cpa)

      const expectedRows = [
        [
          'customers/1/biddingStrategies/101',
          'Portfolio tROAS',
          'TARGET_ROAS',
          5,
          '',
          10,
          50,
          10,
          2,
        ],
        [
          'customers/1/campaigns/201',
          'Campaign tCPA',
          'MAXIMIZE_CONVERSIONS',
          20000000,
          '',
          10,
          50,
          10,
          3,
        ],
        [
          'customers/1/adGroups/301',
          'AdGroup tROAS',
          'TARGET_ROAS',
          3,
          '',
          10,
          50,
          10,
          4,
        ],
      ];

      // Act
      targetsSheet.load(googleAdsClient);

      // Assert
      expect(googleAdsClient.searchStream).toHaveBeenCalledTimes(4);
      expect(spreadsheetService.updateRows).toHaveBeenCalledWith(
        TargetsSheet.TARGETS_SHEET,
        expectedRows,
        TargetsLabelsIndex.ID
      );
    });
  });

  describe('update', () => {
    it('should update targets based on spreadsheet data and then reload', () => {
      // Arrange
      const mockSheetData = [
        ['ID', 'Name', 'Bidding strategy type', 'Current target', 'New target'],
        [
          'customers/123/biddingStrategies/1',
          'BS tROAS',
          StrategyType.TARGET_ROAS,
          5,
          6,
        ],
        [
          'customers/123/campaigns/2',
          'Campaign tCPA',
          StrategyType.TARGET_CPA,
          10,
          12,
        ],
        [
          'customers/123/adGroups/3',
          'AdGroup tROAS',
          StrategyType.TARGET_ROAS,
          2,
          2.5,
        ],
        [
          'customers/123/campaigns/4',
          'Unchanged',
          StrategyType.TARGET_ROAS,
          3,
          3,
        ],
        [
          'customers/456/campaigns/5',
          'Other CID',
          StrategyType.TARGET_ROAS,
          7,
          8,
        ],
      ];
      const mockSheet = {
        getDataRange: () => ({getValues: () => mockSheetData}),
      };
      (spreadsheetService.getSpreadsheet as jest.Mock).mockReturnValue(
        mockSheet
      );
      (googleAdsClient.getCids as jest.Mock).mockReturnValue(['123']);
      (googleAdsClient.searchStream as jest.Mock).mockReturnValue([]); // For the final load() call

      // Act
      targetsSheet.update(googleAdsClient);

      // Assert
      expect(googleAdsClient.mutateTargets).toHaveBeenCalledTimes(1);
      expect(googleAdsClient.mutateTargets).toHaveBeenCalledWith('123', [
        expect.objectContaining({
          biddingStrategyOperation: expect.any(Object),
        }),
        expect.objectContaining({campaignOperation: expect.any(Object)}),
        expect.objectContaining({adGroupOperation: expect.any(Object)}),
      ]);

      // Verify that load() is called at the end to refresh data.
      expect(googleAdsClient.searchStream).toHaveBeenCalled();
    });

    it('should not call mutateTargets if no rows are updated', () => {
      // Arrange
      const mockSheetData = [
        ['ID', 'Name', 'Bidding strategy type', 'Current target', 'New target'],
        [
          'customers/123/biddingStrategies/1',
          'BS tROAS',
          StrategyType.TARGET_ROAS,
          5,
          5,
        ],
        [
          'customers/123/campaigns/2',
          'Campaign tCPA',
          StrategyType.TARGET_CPA,
          10,
          '',
        ],
      ];
      const mockSheet = {
        getDataRange: () => ({getValues: () => mockSheetData}),
      };
      (spreadsheetService.getSpreadsheet as jest.Mock).mockReturnValue(
        mockSheet
      );
      (googleAdsClient.getCids as jest.Mock).mockReturnValue(['123']);
      (googleAdsClient.searchStream as jest.Mock).mockReturnValue([]);

      // Act
      targetsSheet.update(googleAdsClient);

      // Assert
      expect(googleAdsClient.mutateTargets).not.toHaveBeenCalled();
      expect(googleAdsClient.searchStream).toHaveBeenCalled(); // load() is still called
    });
  });
});
