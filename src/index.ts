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

const SPREADSHEET_ID = 'YOUR-SPREADSHEET-ID-HERE';

// Apps Script configuration
const DEV_TOKEN = 'YOUR-DEV-TOKEN';
const LOGIN_CUSTOMER_ID = 'YOUR-MCC-CUSTOMER-ID';

// Ads Script configuration
const CUSTOMER_IDS = ['YOUR-CUSTOMER-ID'];

import {SpreadsheetService} from './spreadsheet_service';
import {CidSheet, CustomerLabelsIndex} from './cid_sheet';
import {SimulationsSheet} from './simulations_sheet';
import {TargetsSheet} from './targets_sheet';
import {GoogleAdsClient} from './google_ads_client';

const spreadsheetService = new SpreadsheetService(SPREADSHEET_ID);

function googleAdsClient(): GoogleAdsClient {
  const cidSheet = new CidSheet(spreadsheetService);
  const cids = cidSheet.getCustomerIds();
  return new GoogleAdsClient(DEV_TOKEN, LOGIN_CUSTOMER_ID, cids);
}

/**
 * Function to initialize the spreadsheet
 */
export function initializeSheets(): void {
  const simulationsSheet = new SimulationsSheet(spreadsheetService);
  const targetsSheet = new TargetsSheet(spreadsheetService);
  const cidSheet = new CidSheet(spreadsheetService);

  targetsSheet.initializeSheet();
  simulationsSheet.initializeSheet();
  cidSheet.initializeSheet();
}

/**
 * Updates bidding strategy targets via Google Ads API
 */
export function updateTargets(): void {
  const targetsSheet = new TargetsSheet(spreadsheetService);
  targetsSheet.update(googleAdsClient());
}

/**
 * Loads bidding targets from API to spreadsheet
 */
export function loadTargets(): void {
  const targetsSheet = new TargetsSheet(spreadsheetService);
  targetsSheet.load(googleAdsClient());
}

/**
 * Loads bidding strategies simulations from API to spreadsheet
 */
export function loadSimulations(): void {
  const simulationsSheet = new SimulationsSheet(spreadsheetService);
  simulationsSheet.load(googleAdsClient());
}

/**
 * Loads all cids under LOGIN_CUSTOMER_ID from API to spreadsheet
 */
export function loadCids(): void {
  const cidSheet = new CidSheet(spreadsheetService);
  cidSheet.loadCids(
    new GoogleAdsClient(DEV_TOKEN, LOGIN_CUSTOMER_ID, []),
    LOGIN_CUSTOMER_ID
  );
}

/**
 * Executed when opening the spreadsheet
 */
export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('Ads Bidding')
    .addItem('Initialize spreadsheet', 'initializeSheets')
    .addItem('Load Customer Ids', 'loadCids')
    .addSeparator()
    .addItem('Load targets', 'loadTargets')
    .addItem('Update targets', 'updateTargets')
    .addSeparator()
    .addItem('Load Simulations', 'loadSimulations')
    .addToUi();
}

/**
 * Ads Script main function, loads targets & simulations of CUSTOMER_IDS
 */
export function main(): void {
  initializeSheets();
  spreadsheetService.clearSheet(CidSheet.CID_SHEET);
  spreadsheetService.appendRows(
    CidSheet.CID_SHEET,
    CUSTOMER_IDS.map(cid => {
      const row = new Array(CustomerLabelsIndex.CUSTOMER_ID + 1);
      row[CustomerLabelsIndex.CUSTOMER_ID] = cid;
      return row;
    })
  );
  loadTargets();
  loadSimulations();
}
