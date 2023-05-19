/**
 * Copyright 2023 Google LLC
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

// Date ranges to include on the list of bidding targets
// https://developers.google.com/google-ads/api/docs/query/date-ranges#predefined_date_range
const DATE_RANGES = ["LAST_30_DAYS"];

// Metrics to include on the list of bidding targets (GAQL naming)
const TARGETS_METRICS = ["conversions", "conversions_value", "cost_micros", "average_cpc"];

const TARGETS_SHEET = "Targets";
const SIM_SHEET = "Simulations";
const CID_SHEET = "Customers";

const API_ENDPOINT = "https://googleads.googleapis.com/v13/customers/";

// Calculated formulas on top of simulation data-points to enrich
const SimulationFormulas = [
  // Subtracting cost (K) from conversion value (I)
  {
    header: "Value-cost ($)",
    formula: "I2-K2"
  },
  // VLookup of conversion value (I) on closest ROAS target (G) to current target (C)
  {
    header: "Value target ($)",
    formula: `VLOOKUP(C2, 
      SORT(FILTER(G:K, D:D = D2), 1, TRUE), 
      COLUMN(I2)-COLUMN(G2)+1, 
      TRUE)`
  },
  // Subtracting current conversion value (O) from simulated conversion value (I)
  {
    header: "Value diff ($)",
    formula: "I2-O2"
  },
  // VLookup of cost (K) on closest ROAS target (G) to current target (C)
  {
    header: "Cost target ($)",
    formula: `VLOOKUP(C2, 
      SORT(FILTER(G:K, D:D = D2), 1, TRUE), 
      COLUMN(K2)-COLUMN(G2)+1, 
      TRUE)`
  },
  // Subtracting current cost (Q) from simulated cost (K)
  {
    header: "Cost diff ($)",
    formula: "K2-Q2"
  },
  // Rank simulation data points based on the value-cost (N)
  {
    header: "Rank",
    formula: "RANK(N2, FILTER(N:N, D:D = D2))"
  },
  // Relative change of simulated (G) to current ROAS target (C)
  {
    header: "ROAS change (%)",
    formula: "G2/C2"
  },
  // Incremental ROAS
  {
    header: "Incr ROAS",
    formula: "IF(P2>=0, P2/MAX(R2,0.1), R2/P2)"
  }
];

const TargetsLabelsIndex = {
  id: 0,
  name: 1,
  targetRoas: 2,
  targetCpa: 3,
  newTargetRoas: 4,
  newTargetCpa: 5
};

const SimLabelsIndex = {
  customerName: 0,                              // Column A
  entityName: 1,                                // Column B
  entityId: 2,                                  // Column C
  currentTRoas: 3,                              // Column D
  startDate: 4,                                 // Column E
  endDate: 5,                                   // Column F
  tRoasSimulationTargetRoas: 6,                 // Column G
  tRoasSimulationBiddableConversions: 7,        // Column H
  tRoasSimulationBiddableConversionsValue: 8,   // Column I
  tRoasSimulationClicks:9,                      // Column J
  tRoasSimulationCost: 10,                      // Column K
  tRoasSimulationImpressions: 11,               // Column L
  tRoasSimulationTopSlotImpressions: 12,        // Column M
  formulas: 13                                  // Column N, start of formulas
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
  headers[TargetsLabelsIndex.id] = "ID";
  headers[TargetsLabelsIndex.name] = "Name";
  headers[TargetsLabelsIndex.targetRoas] = "Target ROAS";
  headers[TargetsLabelsIndex.newTargetRoas] = "New target ROAS";
  headers[TargetsLabelsIndex.targetCpa] = "Target CPA (micros)";
  headers[TargetsLabelsIndex.newTargetCpa] = "New target CPA (micros)";

  // Build the metrics x date ranges columns
  for(let m of TARGETS_METRICS) {
    let metricHeader = getMetricHeader(m);
    for(let d of DATE_RANGES) {
      headers.push(`${metricHeader} - ${d}`);
    }
  }

  return headers;
}

/**
 * Returns the headers for Simulations sheet
 */
function getSimulationsHeaders() {
  let headers = [];
  headers[SimLabelsIndex.customerName] = "Customer name";
  headers[SimLabelsIndex.entityName] = "Simulated entity name";
  headers[SimLabelsIndex.entityId] = "Simulated entity Id";
  headers[SimLabelsIndex.currentTRoas] = "Current target Roas"
  headers[SimLabelsIndex.startDate] = "Start date";
  headers[SimLabelsIndex.endDate] = "End date";
  headers[SimLabelsIndex.tRoasSimulationTargetRoas] = "Target ROAS";
  headers[SimLabelsIndex.tRoasSimulationBiddableConversions] = "Biddable Conversions";
  headers[SimLabelsIndex.tRoasSimulationBiddableConversionsValue] = "Biddable Conversions Value";
  headers[SimLabelsIndex.tRoasSimulationClicks] = "Clicks";
  headers[SimLabelsIndex.tRoasSimulationCost] = "Cost";
  headers[SimLabelsIndex.tRoasSimulationImpressions] = "Impressions";
  headers[SimLabelsIndex.tRoasSimulationTopSlotImpressions] = "Top Slot Impressions";

  // Add formulas headers
  for(let formula of SimulationFormulas) {
    headers.push(formula.header);
  };

  return headers;
}

/**
 * Returns the headers for Customer Ids sheet
 */
function getCustomerHeaders(){
  let headers = [];
  headers[CustomerLabelsIndex.customerName] = "Customer name";
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
    throw new Error(`Sheet ${sheetName} cannot be found. Please initialize first.`);
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
    throw new Error(`API error: ${response.error.message}`);
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
 * Creates a bidding strategy mutate operation
 */
function createBiddingStrategyOperation(row) {
  if(row[TargetsLabelsIndex.newTargetRoas]) {
    return {
      "biddingStrategyOperation": {
        "updateMask": "targetRoas.targetRoas",
        "update": {
          "resourceName": row[TargetsLabelsIndex.id],
          "targetRoas": {
            "targetRoas": row[TargetsLabelsIndex.newTargetRoas]
          }
        }
      }
    };
  }

  if(row[TargetsLabelsIndex.newTargetCpa]) {
    return {
      "biddingStrategyOperation": {
        "updateMask": "targetCpa.targetCpaMicros",
        "update": {
          "resourceName": row[TargetsLabelsIndex.id],
          "targetCpa": {
            "targetCpaMicros": row[TargetsLabelsIndex.newTargetCpa]
          }
        }
      }
    };
  }

  throw new Error(`Invalid bidding strategy operation: ${row}`);
}

/**
 * Creates a campaign mutate operation
 * https://developers.google.com/google-ads/api/rest/reference/rest/v12/Campaign
 */
function createCampaignOperation(row) {
  if(row[TargetsLabelsIndex.newTargetRoas]) {
    return {
      "campaignOperation": {
        "updateMask": "maximizeConversionValue.targetRoas",
        "update": {
          "resourceName": row[TargetsLabelsIndex.id],
          "maximizeConversionValue": {
            "targetRoas": row[TargetsLabelsIndex.newTargetRoas]
          }
        }
      }
    };
  }
  if(row[TargetsLabelsIndex.newTargetCpa]) {
    return {
      "campaignOperation": {
        "updateMask": "maximizeConversions.targetCpaMicros",
        "update": {
          "resourceName": row[TargetsLabelsIndex.id],
          "maximizeConversions": {
            "targetCpaMicros": row[TargetsLabelsIndex.newTargetCpa]
          }
        }
      }
    };
  }

  throw new Error(`Invalid campaign operation: ${row}`);
}

/**
 * Updates bidding strategy targets via Google Ads API
 */
function updateTargets() {
  let editData = getSpreadsheet(TARGETS_SHEET).getDataRange().getValues();

  // Update only the rows that contain a changed ROAS or CPA target
  let toUpdate = editData.filter((r) => {
      if(r[TargetsLabelsIndex.newTargetRoas] != r[TargetsLabelsIndex.targetRoas]) {
          if(r[TargetsLabelsIndex.newTargetRoas] != "") {
              return true;
          }
      }
      if(r[TargetsLabelsIndex.newTargetCpa] != r[TargetsLabelsIndex.targetCpa]) {
        return r[TargetsLabelsIndex.newTargetCpa] != "";
      }
      return false;
  });

  let cids = fetchValuesFromColumn(CID_SHEET, CustomerLabelsIndex.customerId);
  for(cid of cids) {
    let url = API_ENDPOINT + cid + "/googleAds:mutate";

    // Populate update operations by first filtering on the CID
    let biddingStrategyOperations = toUpdate.filter((r) => {
          return r[TargetsLabelsIndex.id].indexOf(cid + "/biddingStrategies") > -1;
        }).map(r => createBiddingStrategyOperation(r));

    let campaignOperations = toUpdate.filter((r) => {
          return r[TargetsLabelsIndex.id].indexOf(cid + "/campaigns") > -1;
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
 * Retrieve all bidding targets
 */
function getAllTargets() {
  let allTargets = getPortfolioTargets();
  let campaignTargets = getCampaignTargets();

  return allTargets.concat(campaignTargets);
}

/**
 * Returns array containing portfolio bidding targets segmented by date range
 */
function getPortfolioTargetsByDateRange() {
  let columns = [
    "bidding_strategy.name",
    "bidding_strategy.target_roas.target_roas",
    "bidding_strategy.target_cpa.target_cpa_micros"
  ];
  let selectGaql = buildGaqlColumns(columns);

  let portfolioStrategies = [];
  for(d of DATE_RANGES) {
    let data = {
      "query": `
          SELECT ${selectGaql}
          FROM bidding_strategy
          WHERE
            bidding_strategy.status = 'ENABLED'
            AND segments.date DURING ${d}`
    };
    portfolioStrategies[d] = callApiAll("/googleAds:search", data);
  }

  return portfolioStrategies;
}

/**
 * Retrieve portfolio bidding strategies targets
 */
function getPortfolioTargets() {
  let portfolioStrategies = getPortfolioTargetsByDateRange();

  // Keep only CPA and ROAS strategies
  let rows = portfolioStrategies[DATE_RANGES[0]].filter((r) => {
    return (r.biddingStrategy.targetRoas || r.biddingStrategy.targetCpa);
  }).map((r) => {
    let row = [];
    row[TargetsLabelsIndex.id] = r.biddingStrategy.resourceName;
    row[TargetsLabelsIndex.name] = r.biddingStrategy.name;
    row[TargetsLabelsIndex.targetRoas] = r.biddingStrategy.targetRoas
        && r.biddingStrategy.targetRoas.targetRoas;
    row[TargetsLabelsIndex.targetCpa] = r.biddingStrategy.targetCpa
        && r.biddingStrategy.targetCpa.targetCpaMicros;
    row[TargetsLabelsIndex.newTargetRoas] = "";
    row[TargetsLabelsIndex.newTargetCpa] = "";

    for(let m of TARGETS_METRICS) {
      for(let d of DATE_RANGES) {
        let entry = portfolioStrategies[d].find(
          group => group.biddingStrategy.resourceName == r.biddingStrategy.resourceName
        );
        row.push(readMetric(entry, m));
      }
    }

    return row;
  });

  return rows;
}

/**
 * Returns array containing campaign bidding targets segmented by date range
 */
function getCampaignTargetsByDateRange() {
  let columns = [
    "campaign.name",
    "campaign.maximize_conversion_value.target_roas",
    "campaign.maximize_conversions.target_cpa_micros"
  ];
  let selectGaql = buildGaqlColumns(columns);

  let campaigns = [];
  for(d of DATE_RANGES) {
    let data = {
      "query": `
          SELECT ${selectGaql}
          FROM campaign
          WHERE
            campaign.status != 'REMOVED'
            AND segments.date DURING ${d}`
    };
    campaigns[d] = callApiAll("/googleAds:search", data);
  }

  return campaigns;
}

/**
 * Retrieve campaign targets
 * https://developers.google.com/google-ads/api/fields/v12/campaign_query_builder
 */
function getCampaignTargets() {
  let campaigns = getCampaignTargetsByDateRange();

  // Keep only CPA and ROAS strategies
  let rows = campaigns[DATE_RANGES[0]].filter((r) => {
    return (r.campaign.maximizeConversionValue || r.campaign.maximizeConversions);
  }).map((r) => {
    let row = [];
    row[TargetsLabelsIndex.id] = r.campaign.resourceName;
    row[TargetsLabelsIndex.name] = r.campaign.name;
    row[TargetsLabelsIndex.targetRoas] = r.campaign.maximizeConversionValue
        && r.campaign.maximizeConversionValue.targetRoas;
    row[TargetsLabelsIndex.targetCpa] = r.campaign.maximizeConversions
        && r.campaign.maximizeConversions.targetCpaMicros;
    row[TargetsLabelsIndex.newTargetRoas] = "";
    row[TargetsLabelsIndex.newTargetCpa] = "";

    for(let m of TARGETS_METRICS) {
      for(let d of DATE_RANGES) {
        let entry = campaigns[d].find(
          group => group.campaign.resourceName == r.campaign.resourceName
        );
        row.push(readMetric(entry, m));
      }
    }

    return row;
  });

  return rows;
}

/**
 * Loads bidding targets from API to spreadsheet
 */
function loadTargets() {
  let apiRows = getAllTargets();
  updateRows(TARGETS_SHEET, apiRows, TargetsLabelsIndex.id);
}

/**
 * Build GAQL select statement including given columns and configured metrics
 */
function buildGaqlColumns(columns) {
  // Add metrics. prefix for GAQL
  let metricsFq = TARGETS_METRICS.map((m) => "metrics." + m);
  columns.push(...metricsFq);
  return columns.join(", ");
}

/**
 * Read metric from API
 * For cost metrics, convert from micros to main units
 * @param entry API response of campaign/bidding strategy, incl metrics
 * @param metricName Name of the metric to be read
 */
function readMetric(entry, metricName) {
  if(!entry) {
    return "";
  }
  let metric = getMetricApiNotation(metricName);
  if(["cost_micros", "average_cpc"].indexOf(metricName) > -1) {
    return (entry['metrics'][metric] || 0) / 1e+6;
  }
  return entry['metrics'][metric];
}

/**
 * Returns the API notation for the metric name by converting to camel case
 */
function getMetricApiNotation(metricName) {
  // Replace underscore followed by letter with just uppercase letter
  return metricName.replace(/(_.)/g, (m, chr) => chr[1].toUpperCase());
}

/**
 * Returns the header name for a metric
 */
function getMetricHeader(metricName) {
  if(metricName == "cost_micros") {
    return "cost";
  }
  // Replace underscore with space
  return metricName.replace(/_/g, ' ');
}

/**
 * Retrieve tROAS bidding strategies simulations
 */
function getStrategySimulations() {
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
        row[SimLabelsIndex.entityId] = s.biddingStrategySimulation.biddingStrategyId;
        row[SimLabelsIndex.entityName] = `Strategy: ${s.biddingStrategy.name}`;
        row[SimLabelsIndex.startDate] = s.biddingStrategySimulation.startDate;
        row[SimLabelsIndex.endDate] = s.biddingStrategySimulation.endDate;
        row[SimLabelsIndex.customerName] = s.customer.descriptiveName;
        row[SimLabelsIndex.currentTRoas] = s.biddingStrategy.targetRoas.targetRoas;
        row[SimLabelsIndex.tRoasSimulationTargetRoas] = p.targetRoas;
        row[SimLabelsIndex.tRoasSimulationBiddableConversions] = p.biddableConversions;
        row[SimLabelsIndex.tRoasSimulationBiddableConversionsValue] = p.biddableConversionsValue;
        row[SimLabelsIndex.tRoasSimulationClicks] = p.clicks;
        row[SimLabelsIndex.tRoasSimulationCost] = p.costMicros / 1e6;
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
 * Retrieve tROAS campaign simulations
 */
function getCampaignSimulations() {
  let data = {
    "query": `
      SELECT
        customer.descriptive_name,
        campaign.name,
        campaign.maximize_conversion_value.target_roas,
        campaign.target_roas.target_roas,
        campaign_simulation.campaign_id,
        campaign_simulation.start_date,
        campaign_simulation.end_date,
        campaign_simulation.target_roas_point_list.points
      FROM campaign_simulation
      WHERE
        campaign_simulation.type = 'TARGET_ROAS'
        AND campaign.bidding_strategy_type = 'TARGET_ROAS'
    `
  };

  let simulations = callApiAll("/googleAds:search", data);
  let apiRows = [];
  try {
    for(s of simulations) {
      let points = s.campaignSimulation.targetRoasPointList.points;
      for (p of points){
        let row = [];
        row[SimLabelsIndex.entityId] = s.campaignSimulation.campaignId;
        row[SimLabelsIndex.entityName] = `Campaign: ${s.campaign.name}`;
        row[SimLabelsIndex.startDate] = s.campaignSimulation.startDate;
        row[SimLabelsIndex.endDate] = s.campaignSimulation.endDate;
        row[SimLabelsIndex.customerName] = s.customer.descriptiveName;
        row[SimLabelsIndex.currentTRoas] = s.campaign.maximizeConversionValue.targetRoas
         || s.campaign.targetRoas.targetRoas;
        row[SimLabelsIndex.tRoasSimulationTargetRoas] = p.targetRoas;
        row[SimLabelsIndex.tRoasSimulationBiddableConversions] = p.biddableConversions;
        row[SimLabelsIndex.tRoasSimulationBiddableConversionsValue] = p.biddableConversionsValue;
        row[SimLabelsIndex.tRoasSimulationClicks] = p.clicks;
        row[SimLabelsIndex.tRoasSimulationCost] = p.costMicros / 1e6;
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

  let allSimulations = getStrategySimulations();
  let campaignSimulations = getCampaignSimulations();
  allSimulations.concat(campaignSimulations);

  appendRows(SIM_SHEET, allSimulations);
  appendFormulas();
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
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'`
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
 * Function that returns a list of values from a given sheet and column id
 * @param excludeEmpty filters out the empty values, true by default
 */
function fetchValuesFromColumn(sheetName, columnId, excludeEmpty=true){
  let values = [];
  let sheet = getSpreadsheet(sheetName);
  let range = sheet.getRange(
    2,
    columnId + 1,
    Math.max(sheet.getLastRow() - 1, 2),
    columnId + 1
    ).getValues();

  // Convert to one dimensional array
  values = range.map(r => r[0]).filter(r => !excludeEmpty || (r != ""));
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

/**
 * Appends formulas columns to all rows
 */
function appendFormulas() {
  let sheet = getSpreadsheet(SIM_SHEET);
  let lastRow = sheet.getLastRow();
  if(lastRow <= 2) return;
  SimulationFormulas.forEach((value, index) => {
    // R1C1 column position is offset by 1 
    let column = SimLabelsIndex.formulas + index + 1;
    sheet.getRange(2, column)
      .setFormula(value.formula)
      // Copy to rest rows
      .copyTo(sheet.getRange(3, column, lastRow - 2));
  });
}
