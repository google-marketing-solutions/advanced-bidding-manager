/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// REMINDER - change Default cloud project in Settings
const DEV_TOKEN = "YOUR-DEV-TOKEM"; // Enter your Developer token
const LOGIN_CUSTOMER_ID = "MCCCUSTOMERID"; // Enter your MCC ID, without dashes
const CUSTOMER_IDS = ["CUSTOMERID"]; // Enter your Ads customer ID(s)

// https://developers.google.com/google-ads/api/docs/query/date-ranges#predefined_date_range
const DATE_RANGE = "LAST_30_DAYS";
const EDIT_SHEET = "Sheet1";
const API_ENDPOINT = "https://googleads.googleapis.com/v12/customers/";
const LabelsIndex = {
  customerName: 0,
  bidStrategyName: 1,
  bidStrategyCurrentTRoas: 2,
  bidStrategyId: 3,
  startDate: 4,
  endDate: 5,
  tRoasSimulationTargetRoas: 6,
  tRoasSimulationBiddableConversions: 7,
  tRoasSimulationBiddableConversionsValue: 8,
  tRoasSimulationClicks:9,
  tRoasSimulationCostMicros: 10,
  tRoasSimulationImpressions: 11,
  tRoasSimulationTopSlotImpressions: 12
};
/**
 * Executed when opening the spreadsheet
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Ads Bidding Strategies Simulations')
    .addItem('Load Simulations', 'loadSimulations')
    .addToUi();
}
/**
 * Calls Ads API (POST)
 */
function callApi(url, data) {
  let headers = {};
  let token = ScriptApp.getOAuthToken();
  headers['Authorization'] = 'Bearer ' + token;
  headers['developer-token'] = DEV_TOKEN;
  if(LOGIN_CUSTOMER_ID) {
    headers['login-customer-id'] = LOGIN_CUSTOMER_ID;
  }
  let options = {
    'method' : 'post',
    'contentType': 'application/json',
    'payload' : JSON.stringify(data),
    'headers': headers,
    'muteHttpExceptions': true
  };
  let response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}
/**
 * Calls a Google Ads API endpoint for all configured CIDs
 */
function callApiAll(endpoint, data) {
  let aggregate = [];
  for(cid of CUSTOMER_IDS) {
    let url = API_ENDPOINT + cid + endpoint;
    let response = callApi(url, data);
    console.log(response);
    console.log(response.results);
    aggregate.push(...response.results);
  }
  return aggregate;
}


/**
 * Retrieve ROAS bidding strategies simulations
 */
function getAllSimulations() {
  let data = {
    "query": `
        SELECT
          bidding_strategy_simulation.bidding_strategy_id,
          bidding_strategy_simulation.start_date,
          bidding_strategy_simulation.end_date,
          bidding_strategy_simulation.target_roas_point_list.points,
          bidding_strategy.name,
          bidding_strategy.target_roas.target_roas,
          customer.descriptive_name
        FROM bidding_strategy_simulation`
  };
  let simulations = callApiAll("/googleAds:search", data);
  let apiRows = [];
  for(s of simulations) {
    let points = s.biddingStrategySimulation.targetRoasPointList.points;
    for (p of points){
      let row = [];
      row[LabelsIndex.bidStrategyId] = s.biddingStrategySimulation.biddingStrategyId;
      row[LabelsIndex.bidStrategyName] = s.biddingStrategy.name;
      row[LabelsIndex.startDate] = s.biddingStrategySimulation.startDate;
      row[LabelsIndex.endDate] = s.biddingStrategySimulation.endDate;
      row[LabelsIndex.customerName] = s.customer.descriptiveName;
      row[LabelsIndex.bidStrategyCurrentTRoas] = s.biddingStrategy.targetRoas.targetRoas;
      row[LabelsIndex.tRoasSimulationTargetRoas] = p.targetRoas;
      row[LabelsIndex.tRoasSimulationBiddableConversions] = p.biddableConversions;
      row[LabelsIndex.tRoasSimulationBiddableConversionsValue] = p.biddableConversionsValue;
      row[LabelsIndex.tRoasSimulationClicks] = p.clicks;
      row[LabelsIndex.tRoasSimulationCostMicros] = p.costMicros;
      row[LabelsIndex.tRoasSimulationImpressions] = p.impressions;
      row[LabelsIndex.tRoasSimulationTopSlotImpressions] = p.topSlotImpressions;
      apiRows.push(row);
    }
  }
  return apiRows;
}
/**
 * Loads bidding strategies simulations from API to spreadsheet
 */
function loadSimulations() {
  cleanSheets();
  let apiRows = getAllSimulations();
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDIT_SHEET);
  // Get all the bidding strategies ids from the id column
  let ids = sheet.getRange(
      2,
      LabelsIndex.bidStrategyId + 1,
      Math.max(sheet.getLastRow() - 1, 2),
      LabelsIndex.bidStrategyId + 1
    ).getValues()
  // Convert to one dimensional array
  ids = ids.map(r => r[0]);

  let appendRows = [];
  for(apiRow of apiRows) {
    let index = ids.indexOf(apiRow[LabelsIndex.bidStrategyId]);
    if(index > -1) {
      let rowIndex = index + 2;
      sheet.getRange(rowIndex, 1, 1, apiRow.length).setValues([apiRow]);
    } else {
      appendRows.push(apiRow);
    }
  }
  if(appendRows.length > 0) {
    sheet.getRange(
        sheet.getLastRow() + 1,
        1,
        appendRows.length,
        appendRows[0].length
    ).setValues(appendRows);
  }
}
/**
 * Function to clear and intialize a spreadsheet's Sheet
 */
function cleanSheets(){
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDIT_SHEET);
    sheet.clear();
  initializeSheets();
}
/**
 * Function to intialize the spreadsheet
 */
function initializeSheets() {
  let labels = [];
  labels[LabelsIndex.customerName] = "Customer Name";
  labels[LabelsIndex.bidStrategyName] = "Bidding Strategy Name";
  labels[LabelsIndex.bidStrategyCurrentTRoas] = "Bidding Strategy Current Target Roas"
  labels[LabelsIndex.bidStrategyId] = "Bidding Strategy Id";
  labels[LabelsIndex.startDate] = "Start Date";
  labels[LabelsIndex.endDate] = "End Date";
  labels[LabelsIndex.tRoasSimulationTargetRoas] = "TARGET ROAS";
  labels[LabelsIndex.tRoasSimulationBiddableConversions] = "Biddable Conversions";
  labels[LabelsIndex.tRoasSimulationBiddableConversionsValue] = "Biddable Conversions Value";
  labels[LabelsIndex.tRoasSimulationClicks] = "Clicks";
  labels[LabelsIndex.tRoasSimulationCostMicros] = "Cost Micros";
  labels[LabelsIndex.tRoasSimulationImpressions] = "Impressions";
  labels[LabelsIndex.tRoasSimulationTopSlotImpressions] = "Top Slot Impressions";

  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDIT_SHEET);
  sheet.getRange(1, 1, 1, labels.length).setValues([labels]);
}
