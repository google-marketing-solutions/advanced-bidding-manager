/**
 * Copyright 2025 Google LLC
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

const SPREADSHEET_ID = "YOUR-SPREADSHEET-ID-HERE";

// Apps Script configuration
const DEV_TOKEN = "YOUR-DEV-TOKEN";
const LOGIN_CUSTOMER_ID = "YOUR-MCC-CUSTOMER-ID";

// Ads Script configuration
const CUSTOMER_IDS = ["YOUR-CUSTOMER-ID"];

// Date ranges to include on the list of bidding targets
// https://developers.google.com/google-ads/api/docs/query/date-ranges#predefined_date_range
const DATE_RANGES = ["LAST_30_DAYS"];

// Metrics to include on the list of bidding targets (GAQL naming)
const TARGETS_METRICS = ["conversions", "conversions_value", "cost_micros", "average_cpc"];

const TARGETS_SHEET = "Targets";
const SIM_SHEET = "Simulations";
const CID_SHEET = "Customers";

const API_ENDPOINT = "https://googleads.googleapis.com/v20/customers/";

// Calculated formulas on top of simulation data-points to enrich
const SimulationFormulas = [
  // Subtracting cost (M) from conversion value (K)
  {
    header: "Value-cost",
    formula: "K2-M2"
  },
  // VLookup of conversion value (K) on closest target (I) to current target (F)
  {
    header: "Value target",
    formula: `VLOOKUP(F2,
      SORT(FILTER(I:M, C:C = C2), 1, TRUE),
      COLUMN(K2)-COLUMN(I2)+1,
      TRUE)`
  },
  // Subtracting current conversion value (Q) from simulated conversion value (K)
  {
    header: "Value diff",
    formula: "K2-Q2"
  },
  // VLookup of cost (M) on closest target (I) to current target (F)
  {
    header: "Cost target",
    formula: `VLOOKUP(F2,
      SORT(FILTER(I:M, C:C = C2), 1, TRUE),
      COLUMN(M2)-COLUMN(I2)+1,
      TRUE)`
  },
  // Subtracting current cost (S) from simulated cost (M)
  {
    header: "Cost diff",
    formula: "M2-S2"
  },
  // Rank simulation data points based on the value-cost (P)
  {
    header: "Rank (value-cost)",
    formula: "RANK(P2, FILTER(P:P, C:C = C2))"
  },
  // Relative change of simulated (I) to current target (F)
  {
    header: "ROAS change (%)",
    formula: "I2/F2"
  },
  // Incremental target
  {
    header: "Incremental target",
    formula: "IF(R2>=0, R2/MAX(T2,0.1), T2/R2)"
  }
];

const TargetsLabelsIndex = {
  id: 0,
  name: 1,
  strategyType: 2,
  currentTarget: 3,
  newTarget: 4,
};

const SimLabelsIndex = {
  customerName: 0,                              // Column A
  entityName: 1,                                // Column B
  entityId: 2,                                  // Column C
  strategyType: 3,                              // Column D
  simulationType: 4,                            // Column E
  currentTarget: 5,                             // Column F
  startDate: 6,                                 // Column G
  endDate: 7,                                   // Column H
  simulationTarget: 8,                          // Column I
  simulationBiddableConversions: 9,             // Column J
  simulationBiddableConversionsValue: 10,       // Column K
  simulationClicks: 11,                         // Column L
  simulationCost: 12,                           // Column M
  simulationImpressions: 13,                    // Column N
  simulationTopSlotImpressions: 14,             // Column O
  formulas: 15                                  // Column P, start of formulas
};

const CustomerLabelsIndex = {
  customerName: 0,
  customerLevel: 1,
  isManager: 2,
  customerId: 3,
  parentMccId: 4
};

const StrategyType = {
  targetRoas: 'TARGET_ROAS',
  targetCPA: 'TARGET_CPA',
  maximizeConversionValue: 'MAXIMIZE_CONVERSION_VALUE',
  maximizeConversions: 'MAXIMIZE_CONVERSIONS'
};

const TargetSource = {
  campaignStrategy: 'CAMPAIGN_BIDDING_STRATEGY'
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
  headers[TargetsLabelsIndex.strategyType] = "Bidding strategy type";
  headers[TargetsLabelsIndex.currentTarget] = "Current target";
  headers[TargetsLabelsIndex.newTarget] = "New target";

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
  headers[SimLabelsIndex.entityId] = "Simulated entity ID";
  headers[SimLabelsIndex.strategyType] = "Strategy type"
  headers[SimLabelsIndex.simulationType] = "Simulation type"
  headers[SimLabelsIndex.currentTarget] = "Current target"
  headers[SimLabelsIndex.startDate] = "Start date";
  headers[SimLabelsIndex.endDate] = "End date";
  headers[SimLabelsIndex.simulationTarget] = "Simulation target";
  headers[SimLabelsIndex.simulationBiddableConversions] = "Biddable conversions";
  headers[SimLabelsIndex.simulationBiddableConversionsValue] = "Biddable conversions value";
  headers[SimLabelsIndex.simulationClicks] = "Clicks";
  headers[SimLabelsIndex.simulationCost] = "Cost";
  headers[SimLabelsIndex.simulationImpressions] = "Impressions";
  headers[SimLabelsIndex.simulationTopSlotImpressions] = "Top slot impressions";

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
  headers[CustomerLabelsIndex.customerId] = "Customer ID";
  headers[CustomerLabelsIndex.parentMccId] = "Parent MCC ID";

  return headers;
}

/**
 * Inserts a sheet and initializes the headers
 */
function insertSheet(sheetName, headers) {
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if(!sheet) {
    sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet(sheetName);
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
  let sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
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

  if(response.error){
    Logger.log(response.error);
    throw new Error(`API error: ${response.error.message}`);
  }

  let responseContentText = JSON.parse(response.getContentText());

  // searchStream returns the response wrapped in a JSON array
  if (url.includes('searchStream')) {
    let streamResults = {
      results: []
    };
    for(let r of responseContentText) {
      streamResults.results.push(...r.results);
    }

    return streamResults;
  } else {
    return responseContentText;
  }
}

/**
 * Calls searchStream via Google Ads API
 */
function searchStreamApi(cids, data) {
  let aggregate = [];

  for(cid of cids) {
    let url = `${API_ENDPOINT}${cid}/googleAds:searchStream`;
    let response = callApi(url, data);
    aggregate.push(...response.results);
  }
  return aggregate;
}

/**
 * Calls searchStream for all configured CIDs
 */
function searchStream(data) {
  let cids = fetchValuesFromColumn(CID_SHEET, CustomerLabelsIndex.customerId);

  if(typeof AdsApp !== 'undefined') {
    return searchStreamAdsApp(cids, data);
  }

  return searchStreamApi(cids, data);
}

/**
 * Calls searchStream via AdsApp
 */
function searchStreamAdsApp(cids, data) {
  let results = [];
  let childAccounts = AdsManagerApp.accounts().withIds(cids).get();

  while (childAccounts.hasNext()) {
    let childAccount = childAccounts.next();
    AdsManagerApp.select(childAccount);
    let rows = AdsApp.search(data.query);
    while (rows.hasNext()) {
      results.push(rows.next());
    }
  }

  return results;
}

/**
 * Creates a bidding strategy mutate operation
 */
function createBiddingStrategyOperation(row) {
  return {"biddingStrategyOperation": createBiddingOperation(row)};
}

/**
 * Creates a campaign mutate operation
 * https://developers.google.com/google-ads/api/rest/reference/rest/v12/Campaign
 */
function createCampaignOperation(row) {
  return {"campaignOperation": createBiddingOperation(row)};
}

/**
 * Creates the payload for bidding mutations for campaigns and bidding strategies.
 */
function createBiddingOperation(row) {
  if(row[TargetsLabelsIndex.strategyType] == StrategyType.maximizeConversionValue) {
    return {
      "updateMask": "maximizeConversionValue.targetRoas",
      "update": {
        "resourceName": row[TargetsLabelsIndex.id],
        "maximizeConversionValue": {
          "targetRoas": row[TargetsLabelsIndex.newTarget]
        }
      }
    };
  } else if(row[TargetsLabelsIndex.strategyType] == StrategyType.maximizeConversions) {
    return {
      "updateMask": "maximizeConversions.targetCpaMicros",
      "update": {
        "resourceName": row[TargetsLabelsIndex.id],
        "maximizeConversions": {
          "targetCpaMicros": row[TargetsLabelsIndex.newTarget]
        }
      }
    };
  } else if(row[TargetsLabelsIndex.strategyType] == StrategyType.targetRoas) {
    return {
      "updateMask": "targetRoas.targetRoas",
      "update": {
        "resourceName": row[TargetsLabelsIndex.id],
        "targetRoas": {
          "targetRoas": row[TargetsLabelsIndex.newTarget]
        }
      }
    };
  } else if(row[TargetsLabelsIndex.strategyType] == StrategyType.targetCPA) {
    return {
      "updateMask": "targetCpa.targetCpaMicros",
      "update": {
        "resourceName": row[TargetsLabelsIndex.id],
        "targetCpa": {
          "targetCpaMicros": row[TargetsLabelsIndex.newTarget]
        }
      }
    };
  }

  throw new Error(`Invalid strategy type: ${row}`);
}

/**
 * Creates an ad group mutate operation
 * https://developers.google.com/google-ads/api/rest/reference/rest/v13/customers.adGroups/mutate
 */
function createAdGroupOperation(row) {
  if ([StrategyType.targetRoas, StrategyType.maximizeConversionValue].includes(
    row[TargetsLabelsIndex.strategyType])) {
    return {
      "adGroupOperation": {
        "updateMask": "targetRoas",
        "update": {
          "resourceName": row[TargetsLabelsIndex.id],
          "targetRoas": row[TargetsLabelsIndex.newTarget]
        }
      }
    };
  } else if ([StrategyType.targetCPA, StrategyType.maximizeConversions].includes(
    row[TargetsLabelsIndex.strategyType])) {
    return {
      "adGroupOperation": {
        "updateMask": "targetCpaMicros",
        "update": {
          "resourceName": row[TargetsLabelsIndex.id],
          "targetCpaMicros": row[TargetsLabelsIndex.newTarget]
        }
      }
    };
  }

  throw new Error(`Invalid ad group operation: ${row}`);
}

/**
 * Updates bidding strategy targets via Google Ads API
 */
function updateTargets() {
  let editData = getSpreadsheet(TARGETS_SHEET).getDataRange().getValues();

  // Update only the rows that contain a changed ROAS or CPA target
  let toUpdate = editData.filter((r) => {
      if(r[TargetsLabelsIndex.newTarget] != r[TargetsLabelsIndex.currentTarget]) {
        return r[TargetsLabelsIndex.newTarget] != "";
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

    let adGroupOperations = toUpdate.filter((r) => {
          return r[TargetsLabelsIndex.id].indexOf(cid + "/adGroups") > -1;
        }).map(r => createAdGroupOperation(r));

    let data = {
      "mutateOperations": biddingStrategyOperations.concat(campaignOperations).concat(adGroupOperations)
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
  let adGroupTargets = getAdGroupTargets();

  return allTargets.concat(campaignTargets).concat(adGroupTargets);
}

/**
 * Returns array containing portfolio bidding targets segmented by date range
 */
function getPortfolioTargetsByDateRange() {
  let columns = [
    "bidding_strategy.name",
    "bidding_strategy.type",
    "bidding_strategy.target_roas.target_roas",
    "bidding_strategy.target_cpa.target_cpa_micros",
    "bidding_strategy.maximize_conversion_value.target_roas",
    "bidding_strategy.maximize_conversions.target_cpa_micros",
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
            AND bidding_strategy.type IN (${StrategyType.targetRoas}, ${StrategyType.targetCPA},
                                        ${StrategyType.maximizeConversions}, ${StrategyType.maximizeConversionValue})
            AND segments.date DURING ${d}`
    };
    portfolioStrategies[d] = searchStream(data);
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
    row[TargetsLabelsIndex.strategyType] = r.biddingStrategy.type;
    row[TargetsLabelsIndex.currentTarget] = getTargetFromType(r.biddingStrategy.type, r.biddingStrategy);
    row[TargetsLabelsIndex.newTarget] = "";

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
    "campaign.bidding_strategy_type",
    "campaign.target_roas.target_roas",
    "campaign.target_cpa.target_cpa_micros",
    "campaign.maximize_conversion_value.target_roas",
    "campaign.maximize_conversions.target_cpa_micros",
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
            AND segments.date DURING ${d}
            AND campaign.bidding_strategy IS NULL
            AND campaign.bidding_strategy_type IN (${StrategyType.targetRoas}, ${StrategyType.targetCPA},
                                                   ${StrategyType.maximizeConversions}, ${StrategyType.maximizeConversionValue})`
    };
    campaigns[d] = searchStream(data);
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
    return (r.campaign.maximizeConversionValue || r.campaign.maximizeConversions || r.campaign.targetRoas);
  }).map((r) => {
    let row = [];
    row[TargetsLabelsIndex.id] = r.campaign.resourceName;
    row[TargetsLabelsIndex.name] = r.campaign.name;
    row[TargetsLabelsIndex.strategyType] = r.campaign.biddingStrategyType;
    row[TargetsLabelsIndex.currentTarget] = getTargetFromType(r.campaign.biddingStrategyType, r.campaign);
    row[TargetsLabelsIndex.newTarget] = "";

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
 * Gets the bidding target (roas/cpa) from a campaign or bidding strategy object.
 * @param type Bidding strategy type
 * @param entity Campaign or bidding strategy object
 */
function getTargetFromType(type, entity) {
  if(type == StrategyType.targetRoas) {
    return entity.targetRoas.targetRoas;
  } else if(type == StrategyType.targetCPA) {
    return entity.targetCpa.targetCpaMicros;
  } else if(type == StrategyType.maximizeConversionValue) {
    return entity.maximizeConversionValue.targetRoas;
  } else if(type == StrategyType.maximizeConversions) {
    return entity.maximizeConversions.targetCpaMicros;
  }

  throw new Error(`Cannot read ${entity.name} with ${type}`);
}

/**
 * Returns array containing ad group bidding targets segmented by date range
 * @param targetField Field containing the target (ad_group.target_roas or ad_group.target_cpa_micros)
 */
function getAdGroupTargetsByDateRange(targetField="ad_group.target_roas") {
  let columns = [
    "ad_group.name",
    "campaign.bidding_strategy_type",
    targetField
  ];
  let selectGaql = buildGaqlColumns(columns);
  let ad_groups = [];
  for (d of DATE_RANGES) {
    let data = {
      "query": `
          SELECT ${selectGaql}
          FROM ad_group
          WHERE
            ad_group.status != 'REMOVED'
            AND ${targetField} > 0
            AND segments.date DURING ${d}
            AND campaign.bidding_strategy_type IN (${StrategyType.targetRoas}, ${StrategyType.targetCPA},
                                                   ${StrategyType.maximizeConversions}, ${StrategyType.maximizeConversionValue})`
    };
    ad_groups[d] = searchStream(data);
  }
  return ad_groups;
}

/**
 * Retrieve ad group targets
 * https://developers.google.com/google-ads/api/fields/v12/ad_group_query_builder
 */
function getAdGroupTargets() {
  let ad_groups_roas = getAdGroupTargetsByDateRange("ad_group.target_roas");
  let ad_groups_cpa = getAdGroupTargetsByDateRange("ad_group.target_cpa_micros");
  let ad_groups = [];

  for(let d of DATE_RANGES) {
    ad_groups[d] = ad_groups_roas[d].concat(ad_groups_cpa[d]);
  }

  // Keep only ad group level CPA and ROAS strategies
  let rows = ad_groups[DATE_RANGES[0]].map((r) => {
    let row = [];
    row[TargetsLabelsIndex.id] = r.adGroup.resourceName;
    row[TargetsLabelsIndex.name] = r.adGroup.name;
    row[TargetsLabelsIndex.strategyType] = r.campaign.biddingStrategyType;
    if([StrategyType.targetRoas, StrategyType.maximizeConversionValue].includes(r.campaign.biddingStrategyType)) {
      row[TargetsLabelsIndex.currentTarget] = r.adGroup.targetRoas;
    } else if([StrategyType.targetCPA, StrategyType.maximizeConversions].includes(r.campaign.biddingStrategyType)) {
      row[TargetsLabelsIndex.currentTarget] = r.adGroup.targetCpaMicros;
    }
    row[TargetsLabelsIndex.newTarget] = "";

    for(let m of TARGETS_METRICS) {
      for(let d of DATE_RANGES) {
        let entry = ad_groups[d].find(
          group => group.adGroup.resourceName == r.adGroup.resourceName
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
        WHERE
          bidding_strategy_simulation.type IN ('${StrategyType.targetRoas}', '${StrategyType.targetCPA}')
          AND bidding_strategy.type IN ('${StrategyType.targetRoas}', '${StrategyType.targetCPA}')`
  };
  let simulations = searchStream(data);
  let apiRows = [];
  try {
    for(s of simulations) {
      let points = s.biddingStrategySimulation.type == StrategyType.targetRoas ? s.biddingStrategySimulation.targetRoasPointList.points : s.biddingStrategySimulation.targetCpaPointList.points;
      for (p of points){
        let row = [];
        row[SimLabelsIndex.entityId] = s.biddingStrategySimulation.biddingStrategyId;
        row[SimLabelsIndex.simulationType] = s.biddingStrategySimulation.type;
        row[SimLabelsIndex.strategyType] = s.biddingStrategy.type;
        row[SimLabelsIndex.entityName] = `Strategy: ${s.biddingStrategy.name}`;
        row[SimLabelsIndex.startDate] = s.biddingStrategySimulation.startDate;
        row[SimLabelsIndex.endDate] = s.biddingStrategySimulation.endDate;
        row[SimLabelsIndex.customerName] = s.customer.descriptiveName;
        row[SimLabelsIndex.currentTarget] = s.biddingStrategySimulation.type == StrategyType.targetRoas ? s.biddingStrategy.targetRoas.targetRoas : s.biddingStrategy.targetCpa.targetCpaMicros / 1e6;
        row[SimLabelsIndex.simulationTarget] = s.biddingStrategySimulation.type == StrategyType.targetRoas ? p.targetRoas : p.targetCpaMicros / 1e6;
        row[SimLabelsIndex.simulationBiddableConversions] = p.biddableConversions;
        row[SimLabelsIndex.simulationBiddableConversionsValue] = p.biddableConversionsValue;
        row[SimLabelsIndex.simulationClicks] = p.clicks;
        row[SimLabelsIndex.simulationCost] = p.costMicros / 1e6;
        row[SimLabelsIndex.simulationImpressions] = p.impressions;
        row[SimLabelsIndex.simulationTopSlotImpressions] = p.topSlotImpressions;
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
      WHERE
        campaign_simulation.type IN ('${StrategyType.targetRoas}', '${StrategyType.targetCPA}')
        AND campaign.bidding_strategy_type IN ('${StrategyType.maximizeConversionValue}', '${StrategyType.maximizeConversions}',
        '${StrategyType.targetRoas}', '${StrategyType.targetCPA}')
        AND campaign.bidding_strategy IS NULL
    `
  };

  let simulations = searchStream(data);
  let apiRows = [];
  try {
    for(s of simulations) {
      let points = s.campaignSimulation.type == StrategyType.targetRoas ? s.campaignSimulation.targetRoasPointList.points : s.campaignSimulation.targetCpaPointList.points;
      for (p of points){
        let row = [];
        row[SimLabelsIndex.entityId] = s.campaignSimulation.campaignId;
        row[SimLabelsIndex.entityName] = `Campaign: ${s.campaign.name}`;
        row[SimLabelsIndex.simulationType] = s.campaignSimulation.type;
        row[SimLabelsIndex.strategyType] = s.campaign.biddingStrategyType;
        row[SimLabelsIndex.startDate] = s.campaignSimulation.startDate;
        row[SimLabelsIndex.endDate] = s.campaignSimulation.endDate;
        row[SimLabelsIndex.customerName] = s.customer.descriptiveName;
        row[SimLabelsIndex.currentTarget] = getCampaignTarget(s.campaignSimulation.type, s);
        row[SimLabelsIndex.simulationTarget] = s.campaignSimulation.type == StrategyType.targetRoas ? p.targetRoas : p.targetCpaMicros / 1e6;
        row[SimLabelsIndex.simulationBiddableConversions] = p.biddableConversions;
        row[SimLabelsIndex.simulationBiddableConversionsValue] = p.biddableConversionsValue;
        row[SimLabelsIndex.simulationClicks] = p.clicks;
        row[SimLabelsIndex.simulationCost] = p.costMicros / 1e6;
        row[SimLabelsIndex.simulationImpressions] = p.impressions;
        row[SimLabelsIndex.simulationTopSlotImpressions] = p.topSlotImpressions;
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
 * Retrieve ad group simulations
 */
function getAdGroupSimulations() {
  let data = {
    "query": `
      SELECT
        customer.descriptive_name,
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
      WHERE
        ad_group_simulation.type IN ('${StrategyType.targetRoas}', '${StrategyType.targetCPA}')
    `
  };

  let simulations = searchStream(data);
  let apiRows = [];
  try {
    for(s of simulations) {
      let points = s.adGroupSimulation.type == StrategyType.targetRoas ? s.adGroupSimulation.targetRoasPointList.points : s.adGroupSimulation.targetCpaPointList.points;
      for (p of points){
        let row = [];
        row[SimLabelsIndex.entityId] = s.adGroupSimulation.adGroupId;
        row[SimLabelsIndex.entityName] = `Ad Group: ${s.adGroup.name}`;
        row[SimLabelsIndex.simulationType] = s.adGroupSimulation.type;
        row[SimLabelsIndex.strategyType] = s.adGroup.effectiveTargetRoas > 0 ? 'TARGET_ROAS' : s.adGroup.effectiveTargetCpaMicros > 0 ? 'TARGET_CPA' : 'Other';
        row[SimLabelsIndex.startDate] = s.adGroupSimulation.startDate;
        row[SimLabelsIndex.endDate] = s.adGroupSimulation.endDate;
        row[SimLabelsIndex.customerName] = s.customer.descriptiveName;
        row[SimLabelsIndex.currentTarget] = s.adGroup.effectiveTargetRoas > 0 ? s.adGroup.effectiveTargetRoas : s.adGroup.effectiveTargetCpaMicros / 1e6;
        row[SimLabelsIndex.simulationTarget] = s.adGroupSimulation.type == StrategyType.targetRoas ? p.targetRoas : p.targetCpaMicros / 1e6;
        row[SimLabelsIndex.simulationBiddableConversions] = p.biddableConversions;
        row[SimLabelsIndex.simulationBiddableConversionsValue] = p.biddableConversionsValue;
        row[SimLabelsIndex.simulationClicks] = p.clicks;
        row[SimLabelsIndex.simulationCost] = p.costMicros / 1e6;
        row[SimLabelsIndex.simulationImpressions] = p.impressions;
        row[SimLabelsIndex.simulationTopSlotImpressions] = p.topSlotImpressions;
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
 * Retrieves the currentTarget value for the campaign bidding simulation
 */
function getCampaignTarget(strategyType, simulation) {
  if (strategyType == StrategyType.targetRoas) {
    if (simulation.campaign.maximizeConversionValue) {
      return simulation.campaign.maximizeConversionValue.targetRoas;
    }
    if (simulation.campaign.targetRoas) {
      return simulation.campaign.targetRoas.targetRoas;
    }
  } else if (strategyType == StrategyType.targetCPA) {
    if (simulation.campaign.maximizeConversions) {
      return simulation.campaign.maximizeConversions.targetCpaMicros / 1e6;
    }
    if (simulation.campaign.targetCpa) {
      return simulation.campaign.targetCpa.targetCpaMicros / 1e6;
    }
  }

  throw new Error(`Unable to find the campaign target`);
}

/**
 * Loads bidding strategies simulations from API to spreadsheet
 */
function loadSimulations() {
  clearSheet(SIM_SHEET);

  let allSimulations = getStrategySimulations();
  let campaignSimulations = getCampaignSimulations();
  allSimulations = allSimulations.concat(campaignSimulations);
  let adGroupSimulations = getAdGroupSimulations();
  allSimulations = allSimulations.concat(adGroupSimulations);
  appendRows(SIM_SHEET, allSimulations);
  appendFormulas();
}

/**
 * Loads all cids under LOGIN_CUSTOMER_ID from API to spreadsheet
 */
function loadCids() {
  clearSheet(CID_SHEET);
  if(!LOGIN_CUSTOMER_ID) {
    throw new Error("Please update LOGIN_CUSTOMER_ID to fetch customer ids");
  }

  let customerIdsRows = getAllMccChildren(LOGIN_CUSTOMER_ID);
  appendRows(CID_SHEET, customerIdsRows);
}

/**
 * Retrieves all CIDs under an MCC
 */
function getAllMccChildren(mcc) {
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

  let customers = searchStreamApi([mcc], data);
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

/**
 * Ads Script main function, loads targets and simulations of configured CUSTOMER_IDS
 */
function main() {
  initializeSheets();
  clearSheet(CID_SHEET);
  appendRows(CID_SHEET, CUSTOMER_IDS.map(cid => {
    return new Array(CustomerLabelsIndex.customerId + 1)
      .with(CustomerLabelsIndex.customerId, cid)
  }));
  loadTargets();
  loadSimulations();
}
