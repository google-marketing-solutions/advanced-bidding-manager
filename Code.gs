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

const DEV_TOKEN = "YOUR-DEV-TOKEN";
const LOGIN_CUSTOMER_ID = "YOUR-MCC-CUSTOMER-ID";

// https://developers.google.com/google-ads/api/docs/query/date-ranges#predefined_date_range
const DATE_RANGE = "LAST_30_DAYS";

const TARGETS_SHEET = "Targets";
const SIM_SHEET = "Simulations";
const CID_SHEET = "Customers";

const API_ENDPOINT = "https://googleads.googleapis.com/v12/customers/";

const LabelsIndex = {
  id: 0,
  name: 1,
  targetRoas: 2,
  conversions: 3,
  conversionsValue: 4,
  cost: 5,
  newTargetRoas: 6
};

const SimLabelsIndex = {
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

const CustomerLabelsIndex = {
  customerName: 0,
  customerLevel: 1,
  isManager: 2,
  customerId: 3,
  parentMccId: 4
};

/**
 * Executed when opening the spreadsheet
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Ads Bidding')
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
 * Returns the headers for Targets sheet
 */
function getTargetsHeaders() {
  let headers = [];
  headers[LabelsIndex.id] = "ID";
  headers[LabelsIndex.name] = "Name";
  headers[LabelsIndex.targetRoas] = "Target ROAS";
  headers[LabelsIndex.conversions] = "Conversions";
  headers[LabelsIndex.conversionsValue] = "Conv. value";
  headers[LabelsIndex.cost] = "Cost (micros)";
  headers[LabelsIndex.newTargetRoas] = "New target ROAS";

  return headers;
}

/**
 * Returns the headers for Simulations sheet
 */
function getSimulationsHeaders() {
  let headers = [];
  headers[SimLabelsIndex.customerName] = "Customer Name";
  headers[SimLabelsIndex.bidStrategyName] = "Bidding Strategy Name";
  headers[SimLabelsIndex.bidStrategyCurrentTRoas] = "Bidding Strategy Current Target Roas"
  headers[SimLabelsIndex.bidStrategyId] = "Bidding Strategy Id";
  headers[SimLabelsIndex.startDate] = "Start Date";
  headers[SimLabelsIndex.endDate] = "End Date";
  headers[SimLabelsIndex.tRoasSimulationTargetRoas] = "TARGET ROAS";
  headers[SimLabelsIndex.tRoasSimulationBiddableConversions] = "Biddable Conversions";
  headers[SimLabelsIndex.tRoasSimulationBiddableConversionsValue] = "Biddable Conversions Value";
  headers[SimLabelsIndex.tRoasSimulationClicks] = "Clicks";
  headers[SimLabelsIndex.tRoasSimulationCostMicros] = "Cost Micros";
  headers[SimLabelsIndex.tRoasSimulationImpressions] = "Impressions";
  headers[SimLabelsIndex.tRoasSimulationTopSlotImpressions] = "Top Slot Impressions";

  return headers;
}

/**
 * Returns the headers for Customer Ids sheet
 */
function getCustomerHeaders(){
  let headers = [];
  headers[CustomerLabelsIndex.customerName] = "Customer Descriptive Name";
  headers[CustomerLabelsIndex.customerLevel] = "Level";
  headers[CustomerLabelsIndex.isManager] = "Manager"
  headers[CustomerLabelsIndex.customerId] = "Customer Id";
  headers[CustomerLabelsIndex.parentMccId] = "Parent MCC ID";

  return headers;
}

/**
 * Inserts a sheet and initializes the headers
 */
function insertSheet(sheetName, headers) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if(!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(sheetName);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold");
}

/**
 * Function to intialize the spreadsheet
 */
function initializeSheets() {
  insertSheet(TARGETS_SHEET, getTargetsHeaders());
  insertSheet(SIM_SHEET, getSimulationsHeaders());
  insertSheet(CID_SHEET, getCustomerHeaders());
}

/**
 * Gets a spreadsheet by name
 * @throws exception if sheet is not found
 */
function getSpreadsheet(sheetName) {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if(!sheet) {
    throw `Sheet ${sheetName} cannot be found. Please initialize first.`
  }
  return sheet;
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
    'headers': headers,
    'muteHttpExceptions': true
  };

  if(data) {
    options['payload'] = JSON.stringify(data);
  }

  let response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

/**
 * Calls a Google Ads API endpoint for one configured CID/MCC
 */
function callApiId(endpoint, data, id) {
  let url = API_ENDPOINT + id + endpoint;
  let response = callApi(url, data);
  if(response.results){
    return response.results;
  }
  if(response.error){
    console.log(response.error);
  }
  return [];
}

/**
 * Calls a Google Ads API endpoint for all configured CIDs
 */
function callApiAll(endpoint, data) {
  let aggregate = [];
  let cids = fetchValuesFromColumn(CID_SHEET, CustomerLabelsIndex.customerId);
  for(cid of cids) {
    let results =  callApiId(endpoint, data, cid);
    aggregate.push(...results);
  }
  return aggregate;
}

/**
 * Creates a bidding strategy mutate operation for targetRoas
 */
function createBiddingStrategyOperation(row) {
  return {
    "biddingStrategyOperation": {
		  "updateMask": "targetRoas.targetRoas",
		  "update": {
			  "resourceName": row[LabelsIndex.id],
			  "targetRoas": {
          "targetRoas": row[LabelsIndex.newTargetRoas]
        }
      }
    }
  };
}

/**
 * Creates a campaign mutate operation for targetRoas
 */
function createCampaignOperation(row) {
  return {
    "campaignOperation": {
		  "updateMask": "maximizeConversionValue.targetRoas",
		  "update": {
			  "resourceName": row[LabelsIndex.id],
        "maximizeConversionValue": {
          "targetRoas": row[LabelsIndex.newTargetRoas]
        }
      }
    }
  };
}

/**
 * Updates bidding strategy targets via Google Ads API
 */
function updateTargets() {
  let editData = getSpreadsheet(TARGETS_SHEET).getDataRange().getValues();

  // Update only the rows that contain a changed ROAS target
  let toUpdate = editData.filter((r) => {
      if(r[LabelsIndex.newTargetRoas] != r[LabelsIndex.targetRoas]) {
          if(r[LabelsIndex.newTargetRoas] != "") {
              return true;
          }
      }
      return false;
  });

  let cids = fetchValuesFromColumn(CID_SHEET, CustomerLabelsIndex.customerId);
  for(cid of cids) {
    let url = API_ENDPOINT + cid + "/googleAds:mutate";

    // Populate update operations by first filtering on the CID
    let biddingStrategyOperations = toUpdate.filter((r) => {
          return r[LabelsIndex.id].indexOf(cid + "/biddingStrategies") > -1;
        }).map(r => createBiddingStrategyOperation(r));

    let campaignOperations = toUpdate.filter((r) => {
          return r[LabelsIndex.id].indexOf(cid + "/campaigns") > -1;
        }).map(r => createCampaignOperation(r));

    let data = {
      "mutateOperations": biddingStrategyOperations.concat(campaignOperations)
    };

    if(data.mutateOperations.length > 0) {
      callApi(url, data);
    }
  }

  loadTargets();
}

/**
 * Retrieve all ROAS bidding strategies
 */
function getAllStrategies() {
  let portfolioStrategies = getPortfolioStrategies();
  let campaignStrategies = getCampaignStrategies();

  return portfolioStrategies.concat(campaignStrategies);
}

/**
 * Retrieve ROAS portfolio bidding strategies
 */
function getPortfolioStrategies() {
  let data = {
    "query": `
        SELECT
          bidding_strategy.name,
          bidding_strategy.target_roas.target_roas,
          metrics.conversions,
          metrics.conversions_value,
          metrics.cost_micros
        FROM bidding_strategy
        WHERE
          bidding_strategy.status = 'ENABLED'
          AND bidding_strategy.target_roas.target_roas IS NOT NULL
          AND segments.date DURING ` + DATE_RANGE
  };

  let portfolioStrategies = callApiAll("/googleAds:search", data);
  let apiRows = [];

  for(s of portfolioStrategies) {
    let row = [];
    row[LabelsIndex.id] = s.biddingStrategy.resourceName;
    row[LabelsIndex.name] = s.biddingStrategy.name;
    row[LabelsIndex.targetRoas] = s.biddingStrategy.targetRoas
        && s.biddingStrategy.targetRoas.targetRoas;
    row[LabelsIndex.conversions] = s.metrics.conversions;
    row[LabelsIndex.conversionsValue] = s.metrics.conversionsValue;
    row[LabelsIndex.cost] = s.metrics.costMicros;
    apiRows.push(row);
  }

  return apiRows;
}

/**
 * Retrieve ROAS campaign strategies
 */
function getCampaignStrategies() {
  let data = {
    "query": `
        SELECT
          campaign.name,
          campaign.maximize_conversion_value.target_roas,
          metrics.conversions,
          metrics.conversions_value,
          metrics.cost_micros
        FROM campaign
        WHERE
          campaign.maximize_conversion_value.target_roas IS NOT NULL
          AND segments.date DURING ` + DATE_RANGE
  };

  let campaignStrategies = callApiAll("/googleAds:search", data);
  let apiRows = [];

  for(s of campaignStrategies) {
    let row = [];
    row[LabelsIndex.id] = s.campaign.resourceName;
    row[LabelsIndex.name] = s.campaign.name;
    row[LabelsIndex.targetRoas] = s.campaign.maximizeConversionValue
        && s.campaign.maximizeConversionValue.targetRoas;
    row[LabelsIndex.conversions] = s.metrics.conversions;
    row[LabelsIndex.conversionsValue] = s.metrics.conversionsValue;
    row[LabelsIndex.cost] = s.metrics.costMicros;
    apiRows.push(row);
  }

  return apiRows;
}

/**
 * Loads bidding strategies from API to spreadsheet
 */
function loadTargets() {
  let apiRows = getAllStrategies();
  updateRows(TARGETS_SHEET, apiRows, LabelsIndex.id);
}

/**
 * Retrieve tROAS bidding strategies simulations
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
        FROM bidding_strategy_simulation
        WHERE
          bidding_strategy_simulation.type = 'TARGET_ROAS'
          AND bidding_strategy.type = 'TARGET_ROAS'`
  };
  let simulations = callApiAll("/googleAds:search", data);
  let apiRows = [];
  try {
    for(s of simulations) {
      let points = s.biddingStrategySimulation.targetRoasPointList.points;
      for (p of points){
        let row = [];
        row[SimLabelsIndex.bidStrategyId] = s.biddingStrategySimulation.biddingStrategyId;
        row[SimLabelsIndex.bidStrategyName] = s.biddingStrategy.name;
        row[SimLabelsIndex.startDate] = s.biddingStrategySimulation.startDate;
        row[SimLabelsIndex.endDate] = s.biddingStrategySimulation.endDate;
        row[SimLabelsIndex.customerName] = s.customer.descriptiveName;
        row[SimLabelsIndex.bidStrategyCurrentTRoas] = s.biddingStrategy.targetRoas.targetRoas;
        row[SimLabelsIndex.tRoasSimulationTargetRoas] = p.targetRoas;
        row[SimLabelsIndex.tRoasSimulationBiddableConversions] = p.biddableConversions;
        row[SimLabelsIndex.tRoasSimulationBiddableConversionsValue] = p.biddableConversionsValue;
        row[SimLabelsIndex.tRoasSimulationClicks] = p.clicks;
        row[SimLabelsIndex.tRoasSimulationCostMicros] = p.costMicros;
        row[SimLabelsIndex.tRoasSimulationImpressions] = p.impressions;
        row[SimLabelsIndex.tRoasSimulationTopSlotImpressions] = p.topSlotImpressions;
        apiRows.push(row);
      }
    }
  }
  catch (error) {
    console.log(error);
  }
  
  return apiRows;
}

/**
 * Loads bidding strategies simulations from API to spreadsheet
 */
function loadSimulations() {
  clearSheet(SIM_SHEET);
  let apiRows = getAllSimulations();
  appendRows(SIM_SHEET, apiRows);
}

/**
 * Loads all cids under LOGIN_CUSTOMER_ID from API to spreadsheet
 */
function loadCids(){
  clearSheet(CID_SHEET);
  if(LOGIN_CUSTOMER_ID) {
    let customerIdsRows = getAllMccChildren(LOGIN_CUSTOMER_ID);
    appendRows(CID_SHEET, customerIdsRows);
  }
  else {
    console.log("Please update LOGIN_CUSTOMER_ID to fetch customer ids");
  }
}

/**
 * Retrieves all CIDs under an MCC
 */
function getAllMccChildren(mcc){
  let customerIdsRows = [];
  let data = {
    "query": `
        SELECT
          customer_client.client_customer,
          customer_client.level,
          customer_client.manager,
          customer_client.descriptive_name,
          customer_client.id
        FROM customer_client`
  };

  let customers = callApiId("/googleAds:search", data, mcc);
  for(c of customers) {
    let row = [];
    row[CustomerLabelsIndex.customerLevel] = c.customerClient.level;
    row[CustomerLabelsIndex.isManager] = c.customerClient.manager;
    row[CustomerLabelsIndex.customerName] = c.customerClient.descriptiveName;
    row[CustomerLabelsIndex.customerId] = c.customerClient.id;
    row[CustomerLabelsIndex.parentMccId] = mcc;
    customerIdsRows.push(row); // both mcc and cids
  }
  return customerIdsRows;
}

/**
 * Function that returns a list of Customer Ids from a given sheet and column id
 */
function fetchValuesFromColumn(sheetName, columnId){
  let values = [];
  let sheet = getSpreadsheet(sheetName);
  let range = sheet.getRange(
    2,
    columnId + 1,
    Math.max(sheet.getLastRow() - 1, 2),
    columnId + 1
    ).getValues();

  // Convert to one dimensional array
  values = range.map(r => r[0]);
  return values;
}

/**
 * Update rows in a spreadsheet using a column index as id.
 * Rows with matching ids will be updated.
 * Rows with new ids will be appended.
 */
function updateRows(sheetName, apiRows, idColumn) {
  let sheet = getSpreadsheet(sheetName);
  let extraRows = [];
  ids = fetchValuesFromColumn(sheetName, idColumn);

  for(apiRow of apiRows) {
    let index = ids.indexOf(apiRow[idColumn]);
    if(index > -1) {
      // Spreadsheet row index is offset by 1 + 1 for the header row
      let rowIndex = index + 2;
      sheet.getRange(rowIndex, 1, 1, apiRow.length).setValues([apiRow]);
    } else {
      extraRows.push(apiRow);
    }
  }

  appendRows(sheetName, extraRows);
}

/**
 * Appends the given rows after the last existing row of the sheet
 */
function appendRows(sheetName, rows) {
  let sheet = getSpreadsheet(sheetName);

  if(rows.length > 0) {
    sheet.getRange(
        sheet.getLastRow() + 1,
        1,
        rows.length,
        rows[0].length
    ).setValues(rows);
  }
}

/**
 * Clears the sheet except first row
 */
function clearSheet(sheetName) {
  let sheet = getSpreadsheet(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();

  if(lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  }
}
