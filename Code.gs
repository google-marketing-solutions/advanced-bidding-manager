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

const DEV_TOKEN = ""; // Enter your Developer token
const LOGIN_CUSTOMER_ID = ""; // Enter your MCC ID
const CUSTOMER_IDS = [""]; // Enter your Ads customer ID(s)

// https://developers.google.com/google-ads/api/docs/query/date-ranges#predefined_date_range
const DATE_RANGE = "LAST_30_DAYS";

const EDIT_SHEET = "Edit";
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

/**
 * Executed when opening the spreadsheet
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Ads Bidding Strategies')
    .addItem('Initialize spreadsheet', 'initializeSheets')
    .addSeparator()
    .addItem('Load strategies', 'loadStrategies')
    .addItem('Update strategies', 'updateStrategies')
    .addToUi();
}

/**
 * Function to intialize the spreadsheet
 */
function initializeSheets() {
  let labels = [];
  labels[LabelsIndex.id] = "ID";
  labels[LabelsIndex.name] = "Name";
  labels[LabelsIndex.targetRoas] = "Target ROAS";
  labels[LabelsIndex.conversions] = "Conversions";
  labels[LabelsIndex.conversionsValue] = "Conv. value";
  labels[LabelsIndex.cost] = "Cost (micros)";
  labels[LabelsIndex.newTargetRoas] = "New target ROAS";
  
  let sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet(EDIT_SHEET);
  sheet.getRange(1, 1, 1, labels.length).setValues([labels]).setFontWeight("bold");
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
 * Calls a Google Ads API endpoint for all configured CIDs
 */
function callApiAll(endpoint, data) {
  let aggregate = [];
  for(cid of CUSTOMER_IDS) {
    let url = API_ENDPOINT + cid + endpoint;
    let response = callApi(url, data);
    if(response.results) {
      aggregate.push(...response.results);
    }
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
function updateStrategies() {
  let editData = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(EDIT_SHEET)
    .getDataRange()
    .getValues();

  // Update only the rows that contain a changed ROAS target
  let toUpdate = editData.filter((r) => {
      if(r[LabelsIndex.newTargetRoas] != r[LabelsIndex.targetRoas]) {
          if(r[LabelsIndex.newTargetRoas] != "") {
              return true;
          }
      }
      return false;   
  });

  for(cid of CUSTOMER_IDS) {
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

  loadStrategies();
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
function loadStrategies() {
  let apiRows = getAllStrategies();
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EDIT_SHEET);

  // Get all the bidding strategies ids from the id column
  let ids = sheet.getRange(
      2, 
      LabelsIndex.id + 1, 
      Math.max(sheet.getLastRow() - 1, 2),
      LabelsIndex.id + 1
    ).getValues()

  // Convert to one dimensional array
  ids = ids.map(r => r[0]);
  
  let appendRows = [];
  for(apiRow of apiRows) {
    let index = ids.indexOf(apiRow[LabelsIndex.id]);
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
