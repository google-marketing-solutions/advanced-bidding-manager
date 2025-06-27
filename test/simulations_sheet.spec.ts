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
import {SimulationsSheet} from '../src/simulations_sheet';
import {SpreadsheetService} from '../src/spreadsheet_service';
import {
  GoogleAdsClient,
  StrategyType,
  BiddingStrategySimulationResponse,
  CampaignSimulationResponse,
  AdGroupSimulationResponse,
} from '../src/google_ads_client';

// Mock the dependencies to isolate the SimulationsSheet class for testing
jest.mock('../src/spreadsheet_service');
jest.mock('../src/google_ads_client');

const MockSpreadsheetService = SpreadsheetService as jest.MockedClass<
  typeof SpreadsheetService
>;
const MockGoogleAdsClient = GoogleAdsClient as jest.MockedClass<
  typeof GoogleAdsClient
>;

describe('SimulationsSheet', () => {
  let mockSpreadsheetService: jest.Mocked<SpreadsheetService>;
  let mockGoogleAdsClient: jest.Mocked<GoogleAdsClient>;
  let simulationsSheet: SimulationsSheet;

  // Mock sheet and range objects to test formula appending
  const mockRange = {
    setFormula: jest.fn().mockReturnThis(),
    copyTo: jest.fn(),
  };
  const mockSheet = {
    getLastRow: jest.fn().mockReturnValue(10), // Assume some rows exist
    getRange: jest.fn().mockReturnValue(mockRange),
  };

  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods before each test
    MockSpreadsheetService.mockClear();
    MockGoogleAdsClient.mockClear();
    jest.clearAllMocks();

    mockSpreadsheetService = new MockSpreadsheetService(
      'test-id'
    ) as jest.Mocked<SpreadsheetService>;
    mockGoogleAdsClient = new MockGoogleAdsClient('token', 'mcc', [
      'cid',
    ]) as jest.Mocked<GoogleAdsClient>;

    // Provide a mock implementation for getSpreadsheet to return our mock sheet
    mockSpreadsheetService.getSpreadsheet.mockReturnValue(
      mockSheet as unknown as GoogleAppsScript.Spreadsheet.Sheet
    );

    simulationsSheet = new SimulationsSheet(mockSpreadsheetService);
  });

  describe('initializeSheet', () => {
    it('should insert a new sheet with the correct name and headers', () => {
      simulationsSheet.initializeSheet();

      expect(mockSpreadsheetService.insertSheet).toHaveBeenCalledTimes(1);

      // Verify the arguments passed to insertSheet
      const [sheetName, headers] =
        mockSpreadsheetService.insertSheet.mock.calls[0];

      expect(sheetName).toBe(SimulationsSheet.SIM_SHEET);
      expect(headers).toBeInstanceOf(Array);
      expect(headers.length).toBe(23); // 15 base columns + 8 formula columns
      expect(headers[0]).toBe('Customer name');
      expect(headers[15]).toBe('Value-cost');
    });
  });

  describe('load', () => {
    it('should clear the sheet, fetch all simulations, and populate the sheet with data and formulas', () => {
      // Arrange: Set up mock data for API responses
      const mockStrategySim: BiddingStrategySimulationResponse[] = [
        {
          biddingStrategySimulation: {
            biddingStrategyId: '123',
            type: StrategyType.TARGET_ROAS,
            startDate: '2023-01-01',
            endDate: '2023-01-31',
            targetRoasPointList: {
              points: [
                {
                  targetRoas: 0.5,
                  biddableConversions: 10,
                  biddableConversionsValue: 500,
                  clicks: 100,
                  costMicros: 1000000,
                  impressions: 10000,
                  topSlotImpressions: 1000,
                },
              ],
            },
          },
          biddingStrategy: {
            type: StrategyType.TARGET_ROAS,
            name: 'Test Strategy',
            targetRoas: {targetRoas: 0.4},
          },
          customer: {descriptiveName: 'Test Customer'},
        },
      ];

      // Mock the searchStream method to return different data based on the GAQL query
      mockGoogleAdsClient.searchStream.mockImplementation((query: string) => {
        if (query.includes('FROM bidding_strategy_simulation')) {
          return mockStrategySim;
        }
        // Return empty arrays for other simulation types to keep the test focused
        if (
          query.includes('FROM campaign_simulation') ||
          query.includes('FROM ad_group_simulation')
        ) {
          return [];
        }
        return [];
      });

      // Act: Run the method under test
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert: Verify the outcomes
      // 1. Sheet is cleared before loading new data
      expect(mockSpreadsheetService.clearSheet).toHaveBeenCalledWith(
        SimulationsSheet.SIM_SHEET
      );

      // 2. API is called for all three simulation types
      expect(mockGoogleAdsClient.searchStream).toHaveBeenCalledTimes(3);

      // 3. Rows are appended to the sheet
      expect(mockSpreadsheetService.appendRows).toHaveBeenCalledTimes(1);
      const [sheetName, appendedRows] =
        mockSpreadsheetService.appendRows.mock.calls[0];
      expect(sheetName).toBe(SimulationsSheet.SIM_SHEET);
      expect(appendedRows.length).toBe(1); // From our mockStrategySim

      const rowData = appendedRows[0];
      expect(rowData[2]).toBe('123'); // entityId
      expect(rowData[3]).toBe(StrategyType.TARGET_ROAS); // strategyType
      expect(rowData[12]).toBe(1); // cost (1000000 / 1e6)

      // 4. Formulas are appended to the sheet
      expect(mockSheet.getRange).toHaveBeenCalled();
      expect(mockRange.setFormula).toHaveBeenCalledTimes(8); // 8 formulas
      expect(mockRange.copyTo).toHaveBeenCalledTimes(8);
    });

    it('should correctly process and append campaign simulations', () => {
      // Arrange: Set up mock data for campaign simulation API responses
      const mockCampaignSim: CampaignSimulationResponse[] = [
        {
          campaignSimulation: {
            campaignId: '456',
            type: StrategyType.TARGET_ROAS,
            startDate: '2023-02-01',
            endDate: '2023-02-28',
            targetRoasPointList: {
              points: [
                {
                  targetRoas: 0.8,
                  biddableConversions: 20,
                  biddableConversionsValue: 1000,
                  clicks: 200,
                  costMicros: 2000000,
                  impressions: 20000,
                  topSlotImpressions: 2000,
                },
              ],
            },
          },
          campaign: {
            name: 'Test Campaign',
            biddingStrategyType: StrategyType.MAXIMIZE_CONVERSION_VALUE,
            maximizeConversionValue: {targetRoas: 0.7},
          },
          customer: {descriptiveName: 'Test Customer'},
        },
      ];

      // Mock the searchStream method to return campaign data
      mockGoogleAdsClient.searchStream.mockImplementation((query: string) => {
        if (query.includes('FROM campaign_simulation')) {
          return mockCampaignSim;
        }
        return []; // Return empty for other simulation types
      });

      // Act
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert
      const [, appendedRows] = mockSpreadsheetService.appendRows.mock.calls[0];
      expect(appendedRows.length).toBe(1);

      const rowData = appendedRows[0];
      expect(rowData[2]).toBe('456'); // entityId
      expect(rowData[1]).toBe('Campaign: Test Campaign'); // entityName
      expect(rowData[5]).toBe(0.7); // currentTarget
      expect(rowData[8]).toBe(0.8); // simulationTarget
      expect(rowData[12]).toBe(2); // cost (2000000 / 1e6)
    });

    it('should correctly process and append ad group simulations', () => {
      // Arrange: Set up mock data for ad group simulation API responses
      const mockAdGroupSim: AdGroupSimulationResponse[] = [
        {
          adGroupSimulation: {
            adGroupId: '789',
            type: StrategyType.TARGET_ROAS,
            startDate: '2023-03-01',
            endDate: '2023-03-31',
            targetRoasPointList: {
              points: [
                {
                  targetRoas: 1.2,
                  biddableConversions: 30,
                  biddableConversionsValue: 1500,
                  clicks: 300,
                  costMicros: 3000000,
                  impressions: 30000,
                  topSlotImpressions: 3000,
                },
              ],
            },
          },
          adGroup: {
            name: 'Test Ad Group',
            effectiveTargetRoas: 1.1,
          },
          customer: {descriptiveName: 'Test Customer'},
        },
      ];

      // Mock the searchStream method to return ad group data
      mockGoogleAdsClient.searchStream.mockImplementation((query: string) => {
        if (query.includes('FROM ad_group_simulation')) {
          return mockAdGroupSim;
        }
        return []; // Return empty for other simulation types
      });

      // Act
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert
      const [, appendedRows] = mockSpreadsheetService.appendRows.mock.calls[0];
      expect(appendedRows.length).toBe(1);

      const rowData = appendedRows[0];
      expect(rowData[2]).toBe('789'); // entityId
      expect(rowData[1]).toBe('Ad Group: Test Ad Group'); // entityName
      expect(rowData[3]).toBe(StrategyType.TARGET_ROAS); // strategyType
      expect(rowData[5]).toBe(1.1); // currentTarget
      expect(rowData[8]).toBe(1.2); // simulationTarget
      expect(rowData[12]).toBe(3); // cost (3000000 / 1e6)
    });
  });
});
