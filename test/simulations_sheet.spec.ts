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
          resourceName: 'customers/1/biddingStrategies/123',
          type: StrategyType.TARGET_ROAS,
          name: 'Test Strategy',
          targetRoas: {targetRoas: 0.4},
        },
        customer: {descriptiveName: 'Test Customer'},
      },
    ];
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
          resourceName: 'customers/1/campaigns/456',
          name: 'Test Campaign',
          biddingStrategyType: StrategyType.MAXIMIZE_CONVERSION_VALUE,
          maximizeConversionValue: {targetRoas: 0.7},
        },
        customer: {descriptiveName: 'Test Customer'},
      },
    ];
    const mockAdGroupSim: AdGroupSimulationResponse[] = [
      {
        adGroupSimulation: {
          adGroupId: '789',
          type: StrategyType.TARGET_CPA,
          startDate: '2023-03-01',
          endDate: '2023-03-31',
          targetCpaPointList: {
            points: [
              {
                targetCpaMicros: 15000000,
                biddableConversions: 50,
                biddableConversionsValue: 2000,
                clicks: 500,
                costMicros: 5000000,
                impressions: 50000,
                topSlotImpressions: 5000,
              },
            ],
          },
        },
        adGroup: {
          resourceName: 'customers/1/adGroups/789',
          name: 'Test Ad Group',
          effectiveTargetCpaMicros: 12000000,
        },
        customer: {descriptiveName: 'Test Customer'},
      },
    ];

    it('should correctly process and append bidding strategy simulations', () => {
      // Arrange
      mockGoogleAdsClient.fetchBiddingStrategySimulations.mockReturnValue(
        mockStrategySim
      );
      mockGoogleAdsClient.fetchCampaignSimulations.mockReturnValue([]);
      mockGoogleAdsClient.fetchAdGroupSimulations.mockReturnValue([]);
      mockGoogleAdsClient.getEntityTarget.mockReturnValue(0.4);

      // Act
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert
      expect(mockSpreadsheetService.clearSheet).toHaveBeenCalledWith(
        SimulationsSheet.SIM_SHEET
      );
      const [sheetName, appendedRows] =
        mockSpreadsheetService.appendRows.mock.calls[0];
      expect(sheetName).toBe(SimulationsSheet.SIM_SHEET);
      expect(appendedRows.length).toBe(1);

      const strategyRow = appendedRows[0];
      expect(strategyRow[2]).toBe('123'); // entityId
      expect(strategyRow[3]).toBe(StrategyType.TARGET_ROAS); // strategyType
      expect(strategyRow[5]).toBe(0.4); // currentTarget
      expect(strategyRow[12]).toBe(1); // cost (1000000 / 1e6)
    });

    it('should correctly process and append campaign simulations', () => {
      // Arrange
      mockGoogleAdsClient.fetchBiddingStrategySimulations.mockReturnValue([]);
      mockGoogleAdsClient.fetchCampaignSimulations.mockReturnValue(
        mockCampaignSim
      );
      mockGoogleAdsClient.fetchAdGroupSimulations.mockReturnValue([]);

      mockGoogleAdsClient.getEntityTarget.mockReturnValue(0.7);

      // Act
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert
      const [, appendedRows] = mockSpreadsheetService.appendRows.mock.calls[0];
      expect(appendedRows.length).toBe(1);

      const campaignRow = appendedRows[0];
      expect(campaignRow[2]).toBe('456'); // entityId
      expect(campaignRow[1]).toBe('Campaign: Test Campaign'); // entityName
      expect(campaignRow[5]).toBe(0.7); // currentTarget
      expect(campaignRow[8]).toBe(0.8); // simulationTarget
    });

    it('should correctly process and append ad group simulations', () => {
      // Arrange
      mockGoogleAdsClient.fetchBiddingStrategySimulations.mockReturnValue([]);
      mockGoogleAdsClient.fetchCampaignSimulations.mockReturnValue([]);
      mockGoogleAdsClient.fetchAdGroupSimulations.mockReturnValue(
        mockAdGroupSim
      );

      mockGoogleAdsClient.getEntityTarget.mockReturnValue(12);

      // Act
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert
      const [, appendedRows] = mockSpreadsheetService.appendRows.mock.calls[0];
      expect(appendedRows.length).toBe(1);

      const adGroupRow = appendedRows[0];
      expect(adGroupRow[2]).toBe('789'); // entityId
      expect(adGroupRow[1]).toBe('Ad Group: Test Ad Group'); // entityName
      expect(adGroupRow[3]).toBe(StrategyType.TARGET_CPA); // strategyType
      expect(adGroupRow[5]).toBe(12); // currentTarget
      expect(adGroupRow[8]).toBe(15); // simulationTarget
    });

    it('should append formulas after loading data', () => {
      // Arrange
      mockGoogleAdsClient.fetchBiddingStrategySimulations.mockReturnValue(
        mockStrategySim
      );
      mockGoogleAdsClient.fetchCampaignSimulations.mockReturnValue([]);
      mockGoogleAdsClient.fetchAdGroupSimulations.mockReturnValue([]);
      mockGoogleAdsClient.getEntityTarget.mockReturnValue(0.4);

      // Act
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert
      expect(mockSheet.getRange).toHaveBeenCalled();
      expect(mockRange.setFormula).toHaveBeenCalledTimes(8); // 8 formulas
      expect(mockRange.copyTo).toHaveBeenCalledTimes(8);
    });

    it('should handle cases where no simulations are returned', () => {
      // Arrange
      mockGoogleAdsClient.fetchBiddingStrategySimulations.mockReturnValue([]);
      mockGoogleAdsClient.fetchCampaignSimulations.mockReturnValue([]);
      mockGoogleAdsClient.fetchAdGroupSimulations.mockReturnValue([]);

      // Act
      simulationsSheet.load(mockGoogleAdsClient);

      // Assert
      expect(mockSpreadsheetService.appendRows).toHaveBeenCalledWith(
        SimulationsSheet.SIM_SHEET,
        []
      );
      // Ensure formulas are still appended (to headers) even with no data
      expect(mockSheet.getRange).toHaveBeenCalled();
    });
  });
});
