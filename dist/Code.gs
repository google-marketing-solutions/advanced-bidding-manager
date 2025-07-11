/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

class SpreadsheetService {
    constructor(spreadsheetId) {
        this.spreadsheetId = spreadsheetId;
        this.spreadsheet = null;
    }
    getSpreadsheet(sheetName) {
        if (!this.spreadsheet) {
            this.spreadsheet = SpreadsheetApp.openById(this.spreadsheetId);
        }
        const sheet = this.spreadsheet.getSheetByName(sheetName);
        if (!sheet) {
            throw new Error(`Sheet ${sheetName} cannot be found. Please initialize first.`);
        }
        return sheet;
    }
    fetchValuesFromColumn(sheetName, columnId, excludeEmpty = true) {
        const sheet = this.getSpreadsheet(sheetName);
        const lastRow = sheet.getLastRow();
        if (lastRow < 2) {
            return [];
        }
        const range = sheet.getRange(2, columnId + 1, lastRow - 1, 1).getValues();
        return range
            .map(r => r[0])
            .filter(r => !excludeEmpty || (r !== '' && r !== null));
    }
    updateRows(sheetName, apiRows, idColumn) {
        const sheet = this.getSpreadsheet(sheetName);
        const extraRows = [];
        const ids = this.fetchValuesFromColumn(sheetName, idColumn, false);
        for (const apiRow of apiRows) {
            const id = apiRow[idColumn];
            const index = ids.indexOf(id.toString());
            if (index > -1) {
                const rowIndex = index + 2;
                sheet.getRange(rowIndex, 1, 1, apiRow.length).setValues([apiRow]);
            }
            else {
                extraRows.push(apiRow);
            }
        }
        this.appendRows(sheetName, extraRows);
    }
    appendRows(sheetName, rows) {
        if (rows.length === 0) {
            return;
        }
        const sheet = this.getSpreadsheet(sheetName);
        sheet
            .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
            .setValues(rows);
    }
    clearSheet(sheetName) {
        const sheet = this.getSpreadsheet(sheetName);
        const lastRow = sheet.getLastRow();
        const lastColumn = sheet.getLastColumn();
        if (lastRow > 1) {
            sheet.getRange(2, 1, lastRow - 1, Math.max(1, lastColumn)).clearContent();
        }
    }
    insertSheet(sheetName, headers) {
        if (!this.spreadsheet) {
            this.spreadsheet = SpreadsheetApp.openById(this.spreadsheetId);
        }
        let sheet = this.spreadsheet.getSheetByName(sheetName);
        if (!sheet) {
            sheet = this.spreadsheet.insertSheet(sheetName);
        }
        if (headers.length > 0) {
            sheet
                .getRange(1, 1, 1, headers.length)
                .setValues([headers])
                .setFontWeight('bold');
        }
    }
}

var CustomerLabelsIndex;
(function (CustomerLabelsIndex) {
    CustomerLabelsIndex[CustomerLabelsIndex["CUSTOMER_NAME"] = 0] = "CUSTOMER_NAME";
    CustomerLabelsIndex[CustomerLabelsIndex["CUSTOMER_LEVEL"] = 1] = "CUSTOMER_LEVEL";
    CustomerLabelsIndex[CustomerLabelsIndex["IS_MANAGER"] = 2] = "IS_MANAGER";
    CustomerLabelsIndex[CustomerLabelsIndex["CUSTOMER_ID"] = 3] = "CUSTOMER_ID";
    CustomerLabelsIndex[CustomerLabelsIndex["PARENT_MCC_ID"] = 4] = "PARENT_MCC_ID";
})(CustomerLabelsIndex || (CustomerLabelsIndex = {}));
class CidSheet {
    constructor(spreadsheetService) {
        this.spreadsheetService = spreadsheetService;
    }
    getCustomerHeaders() {
        const headers = [];
        headers[CustomerLabelsIndex.CUSTOMER_NAME] = 'Customer name';
        headers[CustomerLabelsIndex.CUSTOMER_LEVEL] = 'Level';
        headers[CustomerLabelsIndex.IS_MANAGER] = 'Manager';
        headers[CustomerLabelsIndex.CUSTOMER_ID] = 'Customer ID';
        headers[CustomerLabelsIndex.PARENT_MCC_ID] = 'Parent MCC ID';
        return headers;
    }
    initializeSheet() {
        this.spreadsheetService.insertSheet(CidSheet.CID_SHEET, this.getCustomerHeaders());
    }
    getCustomerIds() {
        return this.spreadsheetService.fetchValuesFromColumn(CidSheet.CID_SHEET, CustomerLabelsIndex.CUSTOMER_ID);
    }
    loadCids(googleAdsClient, loginCustomerId) {
        this.spreadsheetService.clearSheet(CidSheet.CID_SHEET);
        if (!loginCustomerId) {
            throw new Error('Please update LOGIN_CUSTOMER_ID to fetch customer ids');
        }
        const customerIdsRows = this.getAllMccChildren(googleAdsClient, loginCustomerId);
        this.spreadsheetService.appendRows(CidSheet.CID_SHEET, customerIdsRows);
    }
    getAllMccChildren(googleAdsClient, mcc) {
        const query = `
        SELECT customer_client.client_customer, customer_client.level,
          customer_client.manager, customer_client.descriptive_name,
          customer_client.id
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'`;
        const customers = googleAdsClient.searchStreamApi([mcc], query);
        return customers.map(c => this.mapCustomerToRow(c, mcc));
    }
    mapCustomerToRow(customer, mcc) {
        return [
            customer.customerClient.descriptiveName,
            customer.customerClient.level,
            customer.customerClient.manager,
            customer.customerClient.id,
            mcc,
        ];
    }
}
CidSheet.CID_SHEET = 'Customers';

const API_ENDPOINT = 'https://googleads.googleapis.com/v20/customers/';
var StrategyType;
(function (StrategyType) {
    StrategyType["TARGET_ROAS"] = "TARGET_ROAS";
    StrategyType["TARGET_CPA"] = "TARGET_CPA";
    StrategyType["MAXIMIZE_CONVERSION_VALUE"] = "MAXIMIZE_CONVERSION_VALUE";
    StrategyType["MAXIMIZE_CONVERSIONS"] = "MAXIMIZE_CONVERSIONS";
})(StrategyType || (StrategyType = {}));
class GoogleAdsClient {
    constructor(devToken, loginCustomerId, cids) {
        this.devToken = devToken;
        this.loginCustomerId = loginCustomerId;
        this.cids = cids;
    }
    getCids() {
        return this.cids;
    }
    searchStream(query) {
        if (typeof AdsApp !== 'undefined') {
            return this.searchStreamAdsApp(this.cids, query);
        }
        return this.searchStreamApi(this.cids, query);
    }
    searchStreamApi(cids, query) {
        const aggregate = [];
        for (const cid of cids) {
            const url = `${API_ENDPOINT}${cid}/googleAds:searchStream`;
            const response = this.callApi(url, { query });
            aggregate.push(...response.results);
        }
        return aggregate;
    }
    searchStreamAdsApp(cids, query) {
        const results = [];
        const childAccounts = AdsManagerApp.accounts().withIds(cids).get();
        while (childAccounts.hasNext()) {
            const childAccount = childAccounts.next();
            AdsManagerApp.select(childAccount);
            const rows = AdsApp.search(query);
            while (rows.hasNext()) {
                results.push(rows.next());
            }
        }
        return results;
    }
    callApi(url, data) {
        const headers = {};
        const token = ScriptApp.getOAuthToken();
        headers['Authorization'] = 'Bearer ' + token;
        headers['developer-token'] = this.devToken;
        if (this.loginCustomerId) {
            headers['login-customer-id'] = this.loginCustomerId;
        }
        const options = {
            method: 'post',
            contentType: 'application/json',
            headers,
            muteHttpExceptions: true,
        };
        if (data) {
            options['payload'] = JSON.stringify(data);
        }
        const response = UrlFetchApp.fetch(url, options);
        if (response.getResponseCode() >= 400) {
            const errorContent = JSON.parse(response.getContentText());
            Logger.log(errorContent);
            throw new Error(`API error: ${errorContent.error.message}`);
        }
        const responseContentText = JSON.parse(response.getContentText());
        if (url.includes('searchStream')) {
            const streamResults = {
                results: [],
            };
            for (const r of responseContentText) {
                streamResults.results.push(...r.results);
            }
            return streamResults;
        }
        else {
            return responseContentText;
        }
    }
}

var SimLabelsIndex;
(function (SimLabelsIndex) {
    SimLabelsIndex[SimLabelsIndex["CUSTOMER_NAME"] = 0] = "CUSTOMER_NAME";
    SimLabelsIndex[SimLabelsIndex["ENTITY_NAME"] = 1] = "ENTITY_NAME";
    SimLabelsIndex[SimLabelsIndex["ENTITY_ID"] = 2] = "ENTITY_ID";
    SimLabelsIndex[SimLabelsIndex["STRATEGY_TYPE"] = 3] = "STRATEGY_TYPE";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_TYPE"] = 4] = "SIMULATION_TYPE";
    SimLabelsIndex[SimLabelsIndex["CURRENT_TARGET"] = 5] = "CURRENT_TARGET";
    SimLabelsIndex[SimLabelsIndex["START_DATE"] = 6] = "START_DATE";
    SimLabelsIndex[SimLabelsIndex["END_DATE"] = 7] = "END_DATE";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_TARGET"] = 8] = "SIMULATION_TARGET";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_BIDDABLE_CONVERSIONS"] = 9] = "SIMULATION_BIDDABLE_CONVERSIONS";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_BIDDABLE_CONVERSIONS_VALUE"] = 10] = "SIMULATION_BIDDABLE_CONVERSIONS_VALUE";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_CLICKS"] = 11] = "SIMULATION_CLICKS";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_COST"] = 12] = "SIMULATION_COST";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_IMPRESSIONS"] = 13] = "SIMULATION_IMPRESSIONS";
    SimLabelsIndex[SimLabelsIndex["SIMULATION_TOP_SLOT_IMPRESSIONS"] = 14] = "SIMULATION_TOP_SLOT_IMPRESSIONS";
    SimLabelsIndex[SimLabelsIndex["FORMULAS"] = 15] = "FORMULAS";
})(SimLabelsIndex || (SimLabelsIndex = {}));
const SimulationFormulas = [
    {
        header: 'Value-cost',
        formula: 'K2-M2',
    },
    {
        header: 'Value target',
        formula: `VLOOKUP(F2,
      SORT(FILTER(I:M, C:C = C2), 1, TRUE),
      COLUMN(K2)-COLUMN(I2)+1,
      TRUE)`,
    },
    {
        header: 'Value diff',
        formula: 'K2-Q2',
    },
    {
        header: 'Cost target',
        formula: `VLOOKUP(F2,
      SORT(FILTER(I:M, C:C = C2), 1, TRUE),
      COLUMN(M2)-COLUMN(I2)+1,
      TRUE)`,
    },
    {
        header: 'Cost diff',
        formula: 'M2-S2',
    },
    {
        header: 'Rank (value-cost)',
        formula: 'RANK(P2, FILTER(P:P, C:C = C2))',
    },
    {
        header: 'ROAS change (%)',
        formula: 'I2/F2',
    },
    {
        header: 'Incremental target',
        formula: 'IF(R2>=0, R2/MAX(T2,0.1), T2/R2)',
    },
];
class SimulationsSheet {
    constructor(spreadsheetService) {
        this.spreadsheetService = spreadsheetService;
    }
    load(googleAdsClient) {
        this.spreadsheetService.clearSheet(SimulationsSheet.SIM_SHEET);
        const sheet = this.spreadsheetService.getSpreadsheet(SimulationsSheet.SIM_SHEET);
        const allSimulations = [
            ...this.getStrategySimulations(googleAdsClient),
            ...this.getCampaignSimulations(googleAdsClient),
            ...this.getAdGroupSimulations(googleAdsClient),
        ];
        this.spreadsheetService.appendRows(SimulationsSheet.SIM_SHEET, allSimulations);
        this.appendFormulas(sheet);
    }
    getSimulationsHeaders() {
        const headers = [];
        headers[SimLabelsIndex.CUSTOMER_NAME] = 'Customer name';
        headers[SimLabelsIndex.ENTITY_NAME] = 'Simulated entity name';
        headers[SimLabelsIndex.ENTITY_ID] = 'Simulated entity ID';
        headers[SimLabelsIndex.STRATEGY_TYPE] = 'Strategy type';
        headers[SimLabelsIndex.SIMULATION_TYPE] = 'Simulation type';
        headers[SimLabelsIndex.CURRENT_TARGET] = 'Current target';
        headers[SimLabelsIndex.START_DATE] = 'Start date';
        headers[SimLabelsIndex.END_DATE] = 'End date';
        headers[SimLabelsIndex.SIMULATION_TARGET] = 'Simulation target';
        headers[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS] =
            'Biddable conversions';
        headers[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS_VALUE] =
            'Biddable conversions value';
        headers[SimLabelsIndex.SIMULATION_CLICKS] = 'Clicks';
        headers[SimLabelsIndex.SIMULATION_COST] = 'Cost';
        headers[SimLabelsIndex.SIMULATION_IMPRESSIONS] = 'Impressions';
        headers[SimLabelsIndex.SIMULATION_TOP_SLOT_IMPRESSIONS] =
            'Top slot impressions';
        for (const formula of SimulationFormulas) {
            headers.push(formula.header);
        }
        return headers;
    }
    getStrategySimulations(googleAdsClient) {
        const query = `
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
          WHERE bidding_strategy_simulation.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
            AND bidding_strategy.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')`;
        const simulations = googleAdsClient.searchStream(query);
        const apiRows = [];
        for (const s of simulations) {
            const sim = s.biddingStrategySimulation;
            let currentTarget = '';
            if (sim.type === StrategyType.TARGET_ROAS &&
                s.biddingStrategy.targetRoas) {
                currentTarget = s.biddingStrategy.targetRoas.targetRoas;
            }
            else if (sim.type === StrategyType.TARGET_CPA &&
                s.biddingStrategy.targetCpa) {
                currentTarget = s.biddingStrategy.targetCpa.targetCpaMicros / 1e6;
            }
            apiRows.push(...this.createSimulationRows(sim.biddingStrategyId, `Strategy: ${s.biddingStrategy.name}`, s.biddingStrategy.type, s.customer.descriptiveName, currentTarget, sim));
        }
        return apiRows;
    }
    getCampaignSimulations(googleAdsClient) {
        const query = `
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
        WHERE campaign_simulation.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
          AND campaign_simulation.modification_method != "SCALING"
          AND campaign.bidding_strategy_type IN ('${StrategyType.MAXIMIZE_CONVERSION_VALUE}', '${StrategyType.MAXIMIZE_CONVERSIONS}',
          '${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
          AND campaign.bidding_strategy IS NULL
      `;
        const simulations = googleAdsClient.searchStream(query);
        const apiRows = [];
        try {
            for (const s of simulations) {
                const sim = s.campaignSimulation;
                apiRows.push(...this.createSimulationRows(sim.campaignId, `Campaign: ${s.campaign.name}`, s.campaign.biddingStrategyType, s.customer.descriptiveName, this.getCampaignTarget(sim.type, s), sim));
            }
        }
        catch (error) {
            console.log(error);
        }
        return apiRows;
    }
    getAdGroupSimulations(googleAdsClient) {
        const query = `
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
        WHERE ad_group_simulation.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}')
      `;
        const simulations = googleAdsClient.searchStream(query);
        const apiRows = [];
        for (const s of simulations) {
            const sim = s.adGroupSimulation;
            const strategyType = s.adGroup.effectiveTargetRoas > 0
                ? 'TARGET_ROAS'
                : s.adGroup.effectiveTargetCpaMicros > 0
                    ? 'TARGET_CPA'
                    : 'Other';
            let currentTarget = '';
            if (s.adGroup.effectiveTargetRoas) {
                currentTarget = s.adGroup.effectiveTargetRoas;
            }
            else if (s.adGroup.effectiveTargetCpaMicros) {
                currentTarget = s.adGroup.effectiveTargetCpaMicros / 1e6;
            }
            apiRows.push(...this.createSimulationRows(sim.adGroupId, `Ad Group: ${s.adGroup.name}`, strategyType, s.customer.descriptiveName, currentTarget, sim));
        }
        return apiRows;
    }
    createSimulationRows(id, name, strategyType, customerName, currentTarget, simulation) {
        const points = simulation.type === StrategyType.TARGET_ROAS
            ? simulation.targetRoasPointList?.points
            : simulation.targetCpaPointList?.points;
        if (!points) {
            return [];
        }
        return points.map(point => {
            const simulationTarget = simulation.type === StrategyType.TARGET_ROAS
                ? point.targetRoas
                : point.targetCpaMicros / 1e6;
            const row = new Array();
            row[SimLabelsIndex.CUSTOMER_NAME] = customerName;
            row[SimLabelsIndex.ENTITY_NAME] = name;
            row[SimLabelsIndex.ENTITY_ID] = id;
            row[SimLabelsIndex.STRATEGY_TYPE] = strategyType;
            row[SimLabelsIndex.SIMULATION_TYPE] = simulation.type;
            row[SimLabelsIndex.CURRENT_TARGET] = currentTarget;
            row[SimLabelsIndex.START_DATE] = simulation.startDate;
            row[SimLabelsIndex.END_DATE] = simulation.endDate;
            row[SimLabelsIndex.SIMULATION_TARGET] = simulationTarget;
            row[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS] =
                point.biddableConversions;
            row[SimLabelsIndex.SIMULATION_BIDDABLE_CONVERSIONS_VALUE] =
                point.biddableConversionsValue;
            row[SimLabelsIndex.SIMULATION_CLICKS] = point.clicks;
            row[SimLabelsIndex.SIMULATION_COST] = point.costMicros / 1e6;
            row[SimLabelsIndex.SIMULATION_IMPRESSIONS] = point.impressions;
            row[SimLabelsIndex.SIMULATION_TOP_SLOT_IMPRESSIONS] =
                point.topSlotImpressions;
            return row;
        });
    }
    appendFormulas(sheet) {
        const lastRow = sheet.getLastRow();
        if (lastRow <= 2)
            return;
        SimulationFormulas.forEach((value, index) => {
            const column = SimLabelsIndex.FORMULAS + index + 1;
            sheet
                .getRange(2, column)
                .setFormula(value.formula)
                .copyTo(sheet.getRange(3, column, lastRow - 2));
        });
    }
    getCampaignTarget(strategyType, simulation) {
        if (strategyType === StrategyType.TARGET_ROAS) {
            if (simulation.campaign.maximizeConversionValue) {
                return simulation.campaign.maximizeConversionValue.targetRoas;
            }
            if (simulation.campaign.targetRoas) {
                return simulation.campaign.targetRoas.targetRoas;
            }
        }
        else if (strategyType === StrategyType.TARGET_CPA) {
            if (simulation.campaign.maximizeConversions) {
                return simulation.campaign.maximizeConversions.targetCpaMicros / 1e6;
            }
            if (simulation.campaign.targetCpa) {
                return simulation.campaign.targetCpa.targetCpaMicros / 1e6;
            }
        }
        throw new Error('Unable to find the campaign target');
    }
    initializeSheet() {
        this.spreadsheetService.insertSheet(SimulationsSheet.SIM_SHEET, this.getSimulationsHeaders());
    }
}
SimulationsSheet.SIM_SHEET = 'Simulations';

const DATE_RANGES = ['LAST_30_DAYS'];
const TARGETS_METRICS = [
    'conversions',
    'conversions_value',
    'cost_micros',
    'average_cpc',
];
var TargetsLabelsIndex;
(function (TargetsLabelsIndex) {
    TargetsLabelsIndex[TargetsLabelsIndex["ID"] = 0] = "ID";
    TargetsLabelsIndex[TargetsLabelsIndex["NAME"] = 1] = "NAME";
    TargetsLabelsIndex[TargetsLabelsIndex["STRATEGY_TYPE"] = 2] = "STRATEGY_TYPE";
    TargetsLabelsIndex[TargetsLabelsIndex["CURRENT_TARGET"] = 3] = "CURRENT_TARGET";
    TargetsLabelsIndex[TargetsLabelsIndex["NEW_TARGET"] = 4] = "NEW_TARGET";
})(TargetsLabelsIndex || (TargetsLabelsIndex = {}));
class TargetsSheet {
    constructor(spreadsheetService) {
        this.spreadsheetService = spreadsheetService;
    }
    initializeSheet() {
        this.spreadsheetService.insertSheet(TargetsSheet.TARGETS_SHEET, this.getTargetsHeaders());
    }
    load(googleAdsClient) {
        const apiRows = this.getAllTargets(googleAdsClient);
        this.spreadsheetService.updateRows(TargetsSheet.TARGETS_SHEET, apiRows, TargetsLabelsIndex.ID);
    }
    update(googleAdsClient) {
        const editData = this.spreadsheetService
            .getSpreadsheet(TargetsSheet.TARGETS_SHEET)
            .getDataRange()
            .getValues();
        const toUpdate = editData.filter(r => {
            if (r[TargetsLabelsIndex.NEW_TARGET] !==
                r[TargetsLabelsIndex.CURRENT_TARGET]) {
                return r[TargetsLabelsIndex.NEW_TARGET] !== '';
            }
            return false;
        });
        const cids = googleAdsClient.getCids();
        for (const cid of cids) {
            const url = API_ENDPOINT + cid + '/googleAds:mutate';
            const biddingStrategyOperations = toUpdate
                .filter(r => {
                return (r[TargetsLabelsIndex.ID].indexOf(cid + '/biddingStrategies') > -1);
            })
                .map(r => this.createBiddingStrategyOperation(r));
            const campaignOperations = toUpdate
                .filter(r => {
                return r[TargetsLabelsIndex.ID].indexOf(cid + '/campaigns') > -1;
            })
                .map(r => this.createCampaignOperation(r));
            const adGroupOperations = toUpdate
                .filter(r => {
                return r[TargetsLabelsIndex.ID].indexOf(cid + '/adGroups') > -1;
            })
                .map(r => this.createAdGroupOperation(r));
            const data = {
                mutateOperations: [
                    ...biddingStrategyOperations,
                    ...campaignOperations,
                    ...adGroupOperations,
                ],
            };
            if (data.mutateOperations.length > 0) {
                googleAdsClient.callApi(url, data);
            }
        }
        this.load(googleAdsClient);
    }
    getTargetsHeaders() {
        const headers = [];
        headers[TargetsLabelsIndex.ID] = 'ID';
        headers[TargetsLabelsIndex.NAME] = 'Name';
        headers[TargetsLabelsIndex.STRATEGY_TYPE] = 'Bidding strategy type';
        headers[TargetsLabelsIndex.CURRENT_TARGET] = 'Current target';
        headers[TargetsLabelsIndex.NEW_TARGET] = 'New target';
        for (const m of TARGETS_METRICS) {
            const metricHeader = this.getMetricHeader(m);
            for (const d of DATE_RANGES) {
                headers.push(`${metricHeader} - ${d}`);
            }
        }
        return headers;
    }
    getMetricHeader(metricName) {
        if (metricName === 'cost_micros') {
            return 'cost';
        }
        return metricName.replace(/_/g, ' ');
    }
    getAllTargets(googleAdsClient) {
        const allTargets = this.getPortfolioTargets(googleAdsClient);
        const campaignTargets = this.getCampaignTargets(googleAdsClient);
        const adGroupTargets = this.getAdGroupTargets(googleAdsClient);
        return [...allTargets, ...campaignTargets, ...adGroupTargets];
    }
    getPortfolioTargetsByDateRange(googleAdsClient) {
        const columns = [
            'bidding_strategy.name',
            'bidding_strategy.type',
            'bidding_strategy.target_roas.target_roas',
            'bidding_strategy.target_cpa.target_cpa_micros',
            'bidding_strategy.maximize_conversion_value.target_roas',
            'bidding_strategy.maximize_conversions.target_cpa_micros',
        ];
        const selectGaql = this.buildGaqlColumns(columns);
        const portfolioStrategies = {};
        for (const d of DATE_RANGES) {
            const query = `
                 SELECT ${selectGaql}
                 FROM bidding_strategy
                 WHERE
                   bidding_strategy.status = 'ENABLED'
                   AND bidding_strategy.type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}',
                                                  '${StrategyType.MAXIMIZE_CONVERSIONS}', '${StrategyType.MAXIMIZE_CONVERSION_VALUE}')
                   AND segments.date DURING ${d}`;
            portfolioStrategies[d] =
                googleAdsClient.searchStream(query);
        }
        return portfolioStrategies;
    }
    getPortfolioTargets(googleAdsClient) {
        const portfolioStrategies = this.getPortfolioTargetsByDateRange(googleAdsClient);
        const rows = portfolioStrategies[DATE_RANGES[0]]
            .filter(r => {
            return r.biddingStrategy.targetRoas || r.biddingStrategy.targetCpa;
        })
            .map(r => {
            const row = [];
            row[TargetsLabelsIndex.ID] = r.biddingStrategy.resourceName;
            row[TargetsLabelsIndex.NAME] = r.biddingStrategy.name;
            row[TargetsLabelsIndex.STRATEGY_TYPE] = r.biddingStrategy.type;
            row[TargetsLabelsIndex.CURRENT_TARGET] = this.getTargetFromType(r.biddingStrategy.type, r.biddingStrategy);
            row[TargetsLabelsIndex.NEW_TARGET] = '';
            for (const m of TARGETS_METRICS) {
                for (const d of DATE_RANGES) {
                    const entry = portfolioStrategies[d].find(group => group.biddingStrategy.resourceName ===
                        r.biddingStrategy.resourceName);
                    row.push(this.readMetric(entry, m));
                }
            }
            return row;
        });
        return rows;
    }
    getCampaignTargetsByDateRange(googleAdsClient) {
        const columns = [
            'campaign.name',
            'campaign.bidding_strategy_type',
            'campaign.target_roas.target_roas',
            'campaign.target_cpa.target_cpa_micros',
            'campaign.maximize_conversion_value.target_roas',
            'campaign.maximize_conversions.target_cpa_micros',
        ];
        const selectGaql = this.buildGaqlColumns(columns);
        const campaigns = {};
        for (const d of DATE_RANGES) {
            const query = `
                 SELECT ${selectGaql}
                 FROM campaign
                 WHERE
                   campaign.status != 'REMOVED'
                   AND segments.date DURING ${d}
                   AND campaign.bidding_strategy IS NULL
                   AND campaign.bidding_strategy_type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}',
                                                          '${StrategyType.MAXIMIZE_CONVERSIONS}', '${StrategyType.MAXIMIZE_CONVERSION_VALUE}')`;
            campaigns[d] = googleAdsClient.searchStream(query);
        }
        return campaigns;
    }
    getCampaignTargets(googleAdsClient) {
        const campaigns = this.getCampaignTargetsByDateRange(googleAdsClient);
        const rows = campaigns[DATE_RANGES[0]]
            .filter(r => {
            return (r.campaign.maximizeConversionValue ||
                r.campaign.maximizeConversions ||
                r.campaign.targetRoas);
        })
            .map(r => {
            const row = [];
            row[TargetsLabelsIndex.ID] = r.campaign.resourceName;
            row[TargetsLabelsIndex.NAME] = r.campaign.name;
            row[TargetsLabelsIndex.STRATEGY_TYPE] = r.campaign.biddingStrategyType;
            row[TargetsLabelsIndex.CURRENT_TARGET] = this.getTargetFromType(r.campaign.biddingStrategyType, r.campaign);
            row[TargetsLabelsIndex.NEW_TARGET] = '';
            for (const m of TARGETS_METRICS) {
                for (const d of DATE_RANGES) {
                    const entry = campaigns[d].find(group => group.campaign.resourceName === r.campaign.resourceName);
                    row.push(this.readMetric(entry, m));
                }
            }
            return row;
        });
        return rows;
    }
    getAdGroupTargetsByDateRange(googleAdsClient, targetField = 'ad_group.target_roas') {
        const columns = [
            'ad_group.name',
            'campaign.bidding_strategy_type',
            targetField,
        ];
        const selectGaql = this.buildGaqlColumns(columns);
        const ad_groups = {};
        for (const d of DATE_RANGES) {
            const query = `
                 SELECT ${selectGaql}
                 FROM ad_group
                 WHERE
                   ad_group.status != 'REMOVED'
                   AND ${targetField} > 0
                   AND segments.date DURING ${d}
                   AND campaign.bidding_strategy_type IN ('${StrategyType.TARGET_ROAS}', '${StrategyType.TARGET_CPA}',
                                                          '${StrategyType.MAXIMIZE_CONVERSIONS}', '${StrategyType.MAXIMIZE_CONVERSION_VALUE}')`;
            ad_groups[d] = googleAdsClient.searchStream(query);
        }
        return ad_groups;
    }
    getAdGroupTargets(googleAdsClient) {
        const ad_groups_roas = this.getAdGroupTargetsByDateRange(googleAdsClient, 'ad_group.target_roas');
        const ad_groups_cpa = this.getAdGroupTargetsByDateRange(googleAdsClient, 'ad_group.target_cpa_micros');
        const ad_groups = {};
        for (const d of DATE_RANGES) {
            ad_groups[d] = [...ad_groups_roas[d], ...ad_groups_cpa[d]];
        }
        const rows = ad_groups[DATE_RANGES[0]].map(r => {
            const row = [];
            row[TargetsLabelsIndex.ID] = r.adGroup.resourceName;
            row[TargetsLabelsIndex.NAME] = r.adGroup.name;
            row[TargetsLabelsIndex.STRATEGY_TYPE] = r.campaign.biddingStrategyType;
            if ([
                StrategyType.TARGET_ROAS,
                StrategyType.MAXIMIZE_CONVERSION_VALUE,
            ].includes(r.campaign.biddingStrategyType) &&
                r.adGroup.targetRoas) {
                row[TargetsLabelsIndex.CURRENT_TARGET] = r.adGroup.targetRoas;
            }
            else if ([StrategyType.TARGET_CPA, StrategyType.MAXIMIZE_CONVERSIONS].includes(r.campaign.biddingStrategyType) &&
                r.adGroup.targetCpaMicros) {
                row[TargetsLabelsIndex.CURRENT_TARGET] = r.adGroup.targetCpaMicros;
            }
            row[TargetsLabelsIndex.NEW_TARGET] = '';
            for (const m of TARGETS_METRICS) {
                for (const d of DATE_RANGES) {
                    const entry = ad_groups[d].find(group => group.adGroup.resourceName === r.adGroup.resourceName);
                    row.push(this.readMetric(entry, m));
                }
            }
            return row;
        });
        return rows;
    }
    getTargetFromType(type, entity) {
        if (type === StrategyType.TARGET_ROAS && entity.targetRoas) {
            return entity.targetRoas?.targetRoas;
        }
        else if (type === StrategyType.TARGET_CPA && entity.targetCpa) {
            return entity.targetCpa?.targetCpaMicros;
        }
        else if (type === StrategyType.MAXIMIZE_CONVERSION_VALUE &&
            entity.maximizeConversionValue) {
            return entity.maximizeConversionValue?.targetRoas;
        }
        else if (type === StrategyType.MAXIMIZE_CONVERSIONS &&
            entity.maximizeConversions) {
            return entity.maximizeConversions?.targetCpaMicros;
        }
        throw new Error(`Cannot read target for entity with type ${type}`);
    }
    buildGaqlColumns(columns) {
        const metricsFq = TARGETS_METRICS.map(m => 'metrics.' + m);
        columns.push(...metricsFq);
        return columns.join(', ');
    }
    readMetric(entry, metricName) {
        if (!entry || !entry.metrics) {
            return '';
        }
        const metric = this.getMetricApiNotation(metricName);
        const metrics = entry.metrics;
        const value = metrics[metric];
        if (['cost_micros', 'average_cpc'].indexOf(metricName) > -1) {
            return (value || 0) / 1e6;
        }
        return value ?? '';
    }
    getMetricApiNotation(metricName) {
        return metricName.replace(/(_.)/g, (_m, chr) => chr[1].toUpperCase());
    }
    createBiddingStrategyOperation(row) {
        return { biddingStrategyOperation: this.createBiddingOperation(row) };
    }
    createCampaignOperation(row) {
        return { campaignOperation: this.createBiddingOperation(row) };
    }
    createBiddingOperation(row) {
        if (row[TargetsLabelsIndex.STRATEGY_TYPE] ===
            StrategyType.MAXIMIZE_CONVERSION_VALUE) {
            return {
                updateMask: 'maximizeConversionValue.targetRoas',
                update: {
                    resourceName: row[TargetsLabelsIndex.ID],
                    maximizeConversionValue: {
                        targetRoas: row[TargetsLabelsIndex.NEW_TARGET],
                    },
                },
            };
        }
        else if (row[TargetsLabelsIndex.STRATEGY_TYPE] ===
            StrategyType.MAXIMIZE_CONVERSIONS) {
            return {
                updateMask: 'maximizeConversions.targetCpaMicros',
                update: {
                    resourceName: row[TargetsLabelsIndex.ID],
                    maximizeConversions: {
                        targetCpaMicros: row[TargetsLabelsIndex.NEW_TARGET],
                    },
                },
            };
        }
        else if (row[TargetsLabelsIndex.STRATEGY_TYPE] === StrategyType.TARGET_ROAS) {
            return {
                updateMask: 'targetRoas.targetRoas',
                update: {
                    resourceName: row[TargetsLabelsIndex.ID],
                    targetRoas: {
                        targetRoas: row[TargetsLabelsIndex.NEW_TARGET],
                    },
                },
            };
        }
        else if (row[TargetsLabelsIndex.STRATEGY_TYPE] === StrategyType.TARGET_CPA) {
            return {
                updateMask: 'targetCpa.targetCpaMicros',
                update: {
                    resourceName: row[TargetsLabelsIndex.ID],
                    targetCpa: {
                        targetCpaMicros: row[TargetsLabelsIndex.NEW_TARGET],
                    },
                },
            };
        }
        throw new Error(`Invalid strategy type: ${row[TargetsLabelsIndex.STRATEGY_TYPE]}`);
    }
    createAdGroupOperation(row) {
        if ([
            StrategyType.TARGET_ROAS,
            StrategyType.MAXIMIZE_CONVERSION_VALUE,
        ].includes(row[TargetsLabelsIndex.STRATEGY_TYPE])) {
            return {
                adGroupOperation: {
                    updateMask: 'targetRoas',
                    update: {
                        resourceName: row[TargetsLabelsIndex.ID],
                        targetRoas: row[TargetsLabelsIndex.NEW_TARGET],
                    },
                },
            };
        }
        else if ([StrategyType.TARGET_CPA, StrategyType.MAXIMIZE_CONVERSIONS].includes(row[TargetsLabelsIndex.STRATEGY_TYPE])) {
            return {
                adGroupOperation: {
                    updateMask: 'targetCpaMicros',
                    update: {
                        resourceName: row[TargetsLabelsIndex.ID],
                        targetCpaMicros: row[TargetsLabelsIndex.NEW_TARGET],
                    },
                },
            };
        }
        throw new Error(`Invalid ad group operation for strategy type: ${row[TargetsLabelsIndex.STRATEGY_TYPE]}`);
    }
}
TargetsSheet.TARGETS_SHEET = 'Targets';

const SPREADSHEET_ID = 'YOUR-SPREADSHEET-ID-HERE';
const DEV_TOKEN = 'YOUR-DEV-TOKEN';
const LOGIN_CUSTOMER_ID = 'YOUR-MCC-CUSTOMER-ID';
const CUSTOMER_IDS = ['YOUR-CUSTOMER-ID'];
const spreadsheetService = new SpreadsheetService(SPREADSHEET_ID);
function googleAdsClient() {
    const cidSheet = new CidSheet(spreadsheetService);
    const cids = cidSheet.getCustomerIds();
    return new GoogleAdsClient(DEV_TOKEN, LOGIN_CUSTOMER_ID, cids);
}
function initializeSheets() {
    const simulationsSheet = new SimulationsSheet(spreadsheetService);
    const targetsSheet = new TargetsSheet(spreadsheetService);
    const cidSheet = new CidSheet(spreadsheetService);
    targetsSheet.initializeSheet();
    simulationsSheet.initializeSheet();
    cidSheet.initializeSheet();
}
function updateTargets() {
    const targetsSheet = new TargetsSheet(spreadsheetService);
    targetsSheet.update(googleAdsClient());
}
function loadTargets() {
    const targetsSheet = new TargetsSheet(spreadsheetService);
    targetsSheet.load(googleAdsClient());
}
function loadSimulations() {
    const simulationsSheet = new SimulationsSheet(spreadsheetService);
    simulationsSheet.load(googleAdsClient());
}
function loadCids() {
    const cidSheet = new CidSheet(spreadsheetService);
    cidSheet.loadCids(new GoogleAdsClient(DEV_TOKEN, LOGIN_CUSTOMER_ID, []), LOGIN_CUSTOMER_ID);
}
function onOpen() {
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
function main() {
    initializeSheets();
    spreadsheetService.clearSheet(CidSheet.CID_SHEET);
    spreadsheetService.appendRows(CidSheet.CID_SHEET, CUSTOMER_IDS.map(cid => {
        const row = new Array(CustomerLabelsIndex.CUSTOMER_ID + 1);
        row[CustomerLabelsIndex.CUSTOMER_ID] = cid;
        return row;
    }));
    loadTargets();
    loadSimulations();
}
