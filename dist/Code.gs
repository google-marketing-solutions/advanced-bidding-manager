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
    mutateTargets(cid, mutateOperations) {
        Logger.log(mutateOperations);
        if (typeof AdsApp !== 'undefined') {
            return this.mutateTargetsAdsApp(cid, mutateOperations);
        }
        const url = API_ENDPOINT + cid + '/googleAds:mutate';
        this.callApi(url, { mutateOperations });
    }
    mutateTargetsAdsApp(cid, operations) {
        const formattedCid = this.formatCid(cid);
        const accountIterator = AdsManagerApp.accounts()
            .withIds([formattedCid])
            .get();
        if (!accountIterator.hasNext()) {
            throw new Error(`Google Ads account with CID ${formattedCid} not found.`);
        }
        const account = accountIterator.next();
        AdsManagerApp.select(account);
        try {
            const mutateResults = AdsApp.mutateAll(operations);
            for (const mutateResult of mutateResults) {
                if (!mutateResult.isSuccessful()) {
                    Logger.log(mutateResult.getErrorMessages().join('\n'));
                }
            }
        }
        catch (e) {
            Logger.log(`Failed to execute operation for account ${cid}. Error: ${e}`);
        }
    }
    formatCid(cid) {
        if (cid.length !== 10 || !/^\d+$/.test(cid)) {
            throw new Error(`Invalid CID '${cid}'. Expected a 10-digit string.`);
        }
        return [cid.slice(0, 3), cid.slice(3, 6), cid.slice(6, 10)].join('-');
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
                if ('results' in r) {
                    streamResults.results.push(...r.results);
                }
            }
            return streamResults;
        }
        else {
            return responseContentText;
        }
    }
    fetchBiddingStrategySimulations() {
        const query = `
          SELECT
            bidding_strategy.resource_name,
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
        return this.searchStream(query);
    }
    fetchCampaignSimulations() {
        const query = `
        SELECT
          customer.descriptive_name,
          campaign.resource_name,
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
        return this.searchStream(query);
    }
    fetchAdGroupSimulations() {
        const query = `
        SELECT
          customer.descriptive_name,
          ad_group.resource_name,
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
        return this.searchStream(query);
    }
    getEntityTarget(strategyType, entity) {
        if (strategyType === StrategyType.TARGET_ROAS ||
            strategyType === StrategyType.MAXIMIZE_CONVERSION_VALUE) {
            if ('maximizeConversionValue' in entity &&
                entity.maximizeConversionValue) {
                return entity.maximizeConversionValue.targetRoas;
            }
            if ('targetRoas' in entity && entity.targetRoas) {
                return typeof entity.targetRoas === 'number'
                    ? entity.targetRoas
                    : entity.targetRoas.targetRoas;
            }
            if ('effectiveTargetRoas' in entity && entity.effectiveTargetRoas) {
                return entity.effectiveTargetRoas;
            }
        }
        else if (strategyType === StrategyType.TARGET_CPA ||
            strategyType === StrategyType.MAXIMIZE_CONVERSIONS) {
            if ('maximizeConversions' in entity && entity.maximizeConversions) {
                return entity.maximizeConversions.targetCpaMicros / 1e6;
            }
            if ('targetCpa' in entity && entity.targetCpa) {
                return entity.targetCpa.targetCpaMicros / 1e6;
            }
            if ('effectiveTargetCpaMicros' in entity &&
                entity.effectiveTargetCpaMicros) {
                return entity.effectiveTargetCpaMicros / 1e6;
            }
        }
        return undefined;
    }
    getPoints(simulation) {
        if (simulation.type === StrategyType.TARGET_ROAS) {
            return simulation.targetRoasPointList?.points;
        }
        return simulation.targetCpaPointList?.points;
    }
    getPointTarget(strategyType, point) {
        if (strategyType === StrategyType.TARGET_ROAS) {
            return point.targetRoas;
        }
        return point.targetCpaMicros / 1e6;
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
        const simulations = googleAdsClient.fetchBiddingStrategySimulations();
        const apiRows = [];
        for (const s of simulations) {
            const sim = s.biddingStrategySimulation;
            const currentTarget = googleAdsClient.getEntityTarget(sim.type, s.biddingStrategy) ?? '';
            apiRows.push(...this.createSimulationRows(sim.biddingStrategyId, `Strategy: ${s.biddingStrategy.name}`, s.biddingStrategy.type, s.customer.descriptiveName, currentTarget, sim));
        }
        return apiRows;
    }
    getCampaignSimulations(googleAdsClient) {
        const simulations = googleAdsClient.fetchCampaignSimulations();
        const apiRows = [];
        for (const s of simulations) {
            const sim = s.campaignSimulation;
            apiRows.push(...this.createSimulationRows(sim.campaignId, `Campaign: ${s.campaign.name}`, s.campaign.biddingStrategyType, s.customer.descriptiveName, googleAdsClient.getEntityTarget(sim.type, s.campaign) ?? '', sim));
        }
        return apiRows;
    }
    getAdGroupSimulations(googleAdsClient) {
        const simulations = googleAdsClient.fetchAdGroupSimulations();
        const apiRows = [];
        for (const s of simulations) {
            const sim = s.adGroupSimulation;
            const strategyType = sim.type;
            const currentTarget = googleAdsClient.getEntityTarget(strategyType, s.adGroup) ?? '';
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
    initializeSheet() {
        this.spreadsheetService.insertSheet(SimulationsSheet.SIM_SHEET, this.getSimulationsHeaders());
    }
}
SimulationsSheet.SIM_SHEET = 'Simulations';

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

class Curve {
    constructor(strategyType, data, initialParams, metricName, maxIterations = 1000, tolerance = 1e-6) {
        this.a = null;
        this.b = null;
        this.c = null;
        this.rSquared = null;
        this.strategyType = strategyType;
        this.metricName = metricName;
        this.maxIterations = maxIterations;
        this.tolerance = tolerance;
        if (data && data.length >= 3) {
            this.fit(data, initialParams);
        }
        else {
            console.error(`Data for metric '${metricName}' is empty or has fewer than 3 points. Curve cannot be fitted.`);
        }
    }
    fit(data, initialParams) {
        const n = initialParams.length;
        const simplex = this.initializeSimplex(initialParams);
        let iterations = 0;
        while (iterations < this.maxIterations) {
            simplex.sort((a, b) => this.calculateLoss(data, a) - this.calculateLoss(data, b));
            const best = simplex[0];
            const worst = simplex[n];
            const secondWorst = simplex[n - 1];
            const centroid = this.calculateCentroid(simplex, n);
            const reflected = this.reflect(centroid, worst, 1);
            const lossReflected = this.calculateLoss(data, reflected);
            const lossWorst = this.calculateLoss(data, worst);
            const lossBest = this.calculateLoss(data, best);
            const lossSecondWorst = this.calculateLoss(data, secondWorst);
            if (lossReflected < lossBest) {
                const expanded = this.reflect(centroid, worst, 2);
                const lossExpanded = this.calculateLoss(data, expanded);
                const lossReflected = this.calculateLoss(data, reflected);
                simplex[n] = lossExpanded < lossReflected ? expanded : reflected;
            }
            else if (lossReflected < lossSecondWorst) {
                simplex[n] = reflected;
            }
            else {
                const contractionFactor = 0.5;
                let contracted;
                if (lossReflected < lossWorst) {
                    contracted = this.reflect(centroid, worst, contractionFactor);
                }
                else {
                    contracted = this.reflect(centroid, worst, -contractionFactor);
                }
                const lossContracted = this.calculateLoss(data, contracted);
                if (lossContracted < lossWorst) {
                    simplex[n] = contracted;
                }
                else {
                    this.shrink(simplex, best);
                }
            }
            if (this.checkConvergence(simplex, this.tolerance, data)) {
                break;
            }
            iterations++;
        }
        [this.a, this.b, this.c] = simplex[0];
        this.rSquared = this.calculateRSquared(data);
    }
    predictValue(target) {
        if (target === undefined ||
            this.a === null ||
            this.b === null ||
            this.c === null) {
            return undefined;
        }
        if (this.strategyType === StrategyType.TARGET_ROAS) {
            return this.predictValuePower(target);
        }
        else {
            return this.predictValuePolynomial(target);
        }
    }
    calculateGradient(target) {
        if (this.a === null || this.b === null || this.c === null) {
            return null;
        }
        if (this.strategyType === StrategyType.TARGET_ROAS) {
            const predictedValue = this.predictValue(target);
            if (predictedValue === undefined) {
                return null;
            }
            return (predictedValue *
                (this.b / target + (2 * this.c * Math.log(target)) / target));
        }
        else {
            return 2 * this.a * target + this.b;
        }
    }
    predictValuePower(troas) {
        const logTroas = Math.log(troas);
        return Math.exp(this.a + this.b * logTroas + this.c * logTroas ** 2);
    }
    predictValuePolynomial(tcpa) {
        return this.a * tcpa ** 2 + this.b * tcpa + this.c;
    }
    calculateRSquared(data) {
        const yValues = data.map(item => item[1]);
        const meanY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
        let totalSumOfSquares = 0;
        let residualSumOfSquares = 0;
        for (const [x, y] of data) {
            const prediction = this.predictValue(x);
            if (prediction === undefined)
                continue;
            totalSumOfSquares += (y - meanY) ** 2;
            residualSumOfSquares += (y - prediction) ** 2;
        }
        if (totalSumOfSquares === 0) {
            return 1;
        }
        return 1 - residualSumOfSquares / totalSumOfSquares;
    }
    getRSquared() {
        return this.rSquared;
    }
    calculateLoss(data, params) {
        if (this.strategyType === StrategyType.TARGET_ROAS) {
            return this.calculateLossPower(data, params);
        }
        else {
            return this.calculateLossPolynomial(data, params);
        }
    }
    calculateLossPower(data, params) {
        const [a, b, c] = params;
        let totalErrorSquared = 0;
        for (const [x, y] of data) {
            const logX = Math.log(x);
            const prediction = Math.exp(a + b * logX + c * logX ** 2);
            totalErrorSquared += (y - prediction) ** 2;
        }
        return Math.sqrt(totalErrorSquared / data.length);
    }
    calculateLossPolynomial(data, params) {
        const [a, b, c] = params;
        let totalErrorSquared = 0;
        for (const [x, y] of data) {
            const prediction = a * x ** 2 + b * x + c;
            const error = y - prediction;
            totalErrorSquared += error ** 2;
        }
        return Math.sqrt(totalErrorSquared / data.length);
    }
    initializeSimplex(initialParams) {
        const dimensions = initialParams.length;
        const simplex = [initialParams];
        const perturbationFactor = 1.05;
        for (let i = 0; i < dimensions; i++) {
            const point = initialParams.slice();
            point[i] *= perturbationFactor;
            simplex.push(point);
        }
        return simplex;
    }
    calculateCentroid(simplex, dimensions) {
        const centroid = new Array(dimensions).fill(0);
        for (let i = 0; i < dimensions; i++) {
            for (let j = 0; j < dimensions; j++) {
                centroid[j] += simplex[i][j];
            }
        }
        return centroid.map(coordinate => coordinate / dimensions);
    }
    reflect(centroid, point, factor) {
        return centroid.map((c, i) => c + factor * (c - point[i]));
    }
    shrink(simplex, best) {
        const shrinkFactor = 0.5;
        for (let i = 1; i < simplex.length; i++) {
            simplex[i] = best.map((b, j) => b + shrinkFactor * (simplex[i][j] - b));
        }
    }
    checkConvergence(simplex, tolerance, data) {
        const bestLoss = this.calculateLoss(data, simplex[0]);
        let maxLossDifference = 0;
        for (let i = 1; i < simplex.length; i++) {
            const currentLoss = this.calculateLoss(data, simplex[i]);
            const difference = Math.abs(currentLoss - bestLoss);
            if (difference > maxLossDifference) {
                maxLossDifference = difference;
            }
        }
        return maxLossDifference < tolerance;
    }
}

class TargetAnalyzer {
    constructor(curve) {
        this.curve = curve;
    }
    predictValue(targetValue) {
        return this.curve.predictValue(targetValue);
    }
    findOptimalTargetForProfitUnconstrained(strategyType) {
        const { initialTarget, maxTarget, minTarget, maxIterations, learningRate: initialLearningRate, tolerance, } = this.getOptimizationConfig(strategyType);
        let target = initialTarget;
        let learningRate = initialLearningRate;
        let previousTarget = 0;
        for (let i = 0; i < maxIterations; i++) {
            const gradient = this.curve.calculateGradient(target);
            if (gradient === null) {
                console.error('Gradient could not be calculated. Aborting optimization.');
                return target;
            }
            const gradientMagnitude = Math.abs(gradient);
            const normalizedGradient = gradientMagnitude > 0 ? gradient / gradientMagnitude : 0;
            let newTarget = target + learningRate * normalizedGradient;
            newTarget = Math.max(minTarget, Math.min(maxTarget, newTarget));
            if (i > 0 && (newTarget - target) * (target - previousTarget) < 0) {
                learningRate *= 0.1;
            }
            if (Math.abs(newTarget - previousTarget) < tolerance) {
                return newTarget;
            }
            previousTarget = target;
            target = newTarget;
        }
        console.warn(`Optimization did not converge after ${maxIterations} iterations.`);
        return target;
    }
    suggestNewTarget(currentTarget, optimalTarget, strategyType) {
        const { maxTarget } = this.getOptimizationConfig(strategyType);
        const maxMovePercentage = 0.05;
        const profitSensitivity = 0.1;
        const profitTarget = this.predictValue(currentTarget);
        const profitOptimal = this.predictValue(optimalTarget);
        if (profitTarget === undefined || profitOptimal === undefined) {
            console.warn('Could not predict profit for target suggestion.');
            const fallbackMovePercentage = 0.05;
            return (currentTarget *
                (1 + Math.sign(optimalTarget - currentTarget) * fallbackMovePercentage));
        }
        const targetDifference = optimalTarget - currentTarget;
        const maxTargetMove = Math.abs(targetDifference) * maxMovePercentage;
        const normalizedProfitDifference = Math.abs(profitOptimal - profitTarget) /
            Math.max(Math.abs(profitTarget), Math.abs(profitOptimal), 1);
        let targetMove = maxTargetMove;
        if (normalizedProfitDifference < profitSensitivity) {
            targetMove *= normalizedProfitDifference / profitSensitivity;
        }
        const direction = targetDifference > 0 ? 1 : -1;
        const newTarget = currentTarget + direction * targetMove;
        return Math.max(0.1, Math.min(maxTarget, newTarget));
    }
    getOptimizationConfig(strategyType) {
        if (strategyType === StrategyType.TARGET_ROAS) {
            return {
                initialTarget: 4.5,
                maxTarget: 500.0,
                minTarget: 1.0,
                maxIterations: 1000,
                learningRate: 0.05,
                tolerance: 1e-5,
            };
        }
        return {
            initialTarget: 50,
            maxTarget: 2000000.0,
            minTarget: 1.0,
            maxIterations: 100000,
            learningRate: 0.05,
            tolerance: 1e-5,
        };
    }
}

var SuggestedTargetsLabelsIndex;
(function (SuggestedTargetsLabelsIndex) {
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["BIDDING_STRATEGY_ID"] = 0] = "BIDDING_STRATEGY_ID";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["BIDDING_STRATEGY_NAME"] = 1] = "BIDDING_STRATEGY_NAME";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["BIDDING_STRATEGY_TYPE"] = 2] = "BIDDING_STRATEGY_TYPE";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["CURRENT_TARGET"] = 3] = "CURRENT_TARGET";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["SUGGESTED_TARGET"] = 4] = "SUGGESTED_TARGET";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["OPTIMAL_TARGET"] = 5] = "OPTIMAL_TARGET";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["CURRENT_PROFIT"] = 6] = "CURRENT_PROFIT";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["SUGGESTED_PROFIT"] = 7] = "SUGGESTED_PROFIT";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["OPTIMAL_PROFIT"] = 8] = "OPTIMAL_PROFIT";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["CURRENT_COST"] = 9] = "CURRENT_COST";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["SUGGESTED_COST"] = 10] = "SUGGESTED_COST";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["OPTIMAL_COST"] = 11] = "OPTIMAL_COST";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["CURRENT_CONVERSION_VALUE"] = 12] = "CURRENT_CONVERSION_VALUE";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["SUGGESTED_CONVERSION_VALUE"] = 13] = "SUGGESTED_CONVERSION_VALUE";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["OPTIMAL_CONVERSION_VALUE"] = 14] = "OPTIMAL_CONVERSION_VALUE";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["CURRENT_CLICKS"] = 15] = "CURRENT_CLICKS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["SUGGESTED_CLICKS"] = 16] = "SUGGESTED_CLICKS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["OPTIMAL_CLICKS"] = 17] = "OPTIMAL_CLICKS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["CURRENT_IMPRESSIONS"] = 18] = "CURRENT_IMPRESSIONS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["SUGGESTED_IMPRESSIONS"] = 19] = "SUGGESTED_IMPRESSIONS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["OPTIMAL_IMPRESSIONS"] = 20] = "OPTIMAL_IMPRESSIONS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["CURRENT_CONVERSIONS"] = 21] = "CURRENT_CONVERSIONS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["SUGGESTED_CONVERSIONS"] = 22] = "SUGGESTED_CONVERSIONS";
    SuggestedTargetsLabelsIndex[SuggestedTargetsLabelsIndex["OPTIMAL_CONVERSIONS"] = 23] = "OPTIMAL_CONVERSIONS";
})(SuggestedTargetsLabelsIndex || (SuggestedTargetsLabelsIndex = {}));
class SuggestedTargetsSheet {
    constructor(spreadsheetService) {
        this.spreadsheetService = spreadsheetService;
    }
    initializeSheet() {
        this.spreadsheetService.insertSheet(SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET, this.getSuggestedTargetsHeaders());
    }
    getSuggestedTargetsHeaders() {
        const headers = [];
        headers[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_ID] =
            'Bidding Strategy ID';
        headers[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_NAME] =
            'Bidding Strategy Name';
        headers[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_TYPE] =
            'Bidding Strategy Type';
        headers[SuggestedTargetsLabelsIndex.CURRENT_TARGET] = 'Current Target';
        headers[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] = 'Suggested Target';
        headers[SuggestedTargetsLabelsIndex.OPTIMAL_TARGET] = 'Optimal Target';
        headers[SuggestedTargetsLabelsIndex.CURRENT_PROFIT] = 'Current Profit';
        headers[SuggestedTargetsLabelsIndex.SUGGESTED_PROFIT] = 'Suggested Profit';
        headers[SuggestedTargetsLabelsIndex.OPTIMAL_PROFIT] = 'Optimal Profit';
        headers[SuggestedTargetsLabelsIndex.CURRENT_COST] = 'Current Cost';
        headers[SuggestedTargetsLabelsIndex.SUGGESTED_COST] = 'Suggested Cost';
        headers[SuggestedTargetsLabelsIndex.OPTIMAL_COST] = 'Optimal Cost';
        headers[SuggestedTargetsLabelsIndex.CURRENT_CONVERSION_VALUE] =
            'Current Conversion Value';
        headers[SuggestedTargetsLabelsIndex.SUGGESTED_CONVERSION_VALUE] =
            'Suggested Conversion Value';
        headers[SuggestedTargetsLabelsIndex.OPTIMAL_CONVERSION_VALUE] =
            'Optimal Conversion Value';
        headers[SuggestedTargetsLabelsIndex.CURRENT_CONVERSIONS] =
            'Current Conversions';
        headers[SuggestedTargetsLabelsIndex.SUGGESTED_CONVERSIONS] =
            'Suggested Conversions';
        headers[SuggestedTargetsLabelsIndex.OPTIMAL_CONVERSIONS] =
            'Optimal Conversions';
        headers[SuggestedTargetsLabelsIndex.CURRENT_CLICKS] = 'Current Clicks';
        headers[SuggestedTargetsLabelsIndex.SUGGESTED_CLICKS] = 'Suggested Clicks';
        headers[SuggestedTargetsLabelsIndex.OPTIMAL_CLICKS] = 'Optimal Clicks';
        headers[SuggestedTargetsLabelsIndex.CURRENT_IMPRESSIONS] =
            'Current Impressions';
        headers[SuggestedTargetsLabelsIndex.SUGGESTED_IMPRESSIONS] =
            'Suggested Impressions';
        headers[SuggestedTargetsLabelsIndex.OPTIMAL_IMPRESSIONS] =
            'Optimal Impressions';
        return headers;
    }
    load(googleAdsClient) {
        this.spreadsheetService.clearSheet(SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET);
        const metricToOptimizeTowards = SuggestedTargetsSheet.METRIC_TO_OPTIMIZE_TO;
        const metrics = SuggestedTargetsSheet.METRICS;
        const portfolioSuggestions = this.getStrategySuggestions(googleAdsClient, metricToOptimizeTowards, metrics);
        this.spreadsheetService.appendRows(SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET, portfolioSuggestions);
        const campaignSuggestions = this.getCampaignSuggestions(googleAdsClient, metricToOptimizeTowards, metrics);
        this.spreadsheetService.appendRows(SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET, campaignSuggestions);
        const adGroupSuggestions = this.getAdGroupSuggestions(googleAdsClient, metricToOptimizeTowards, metrics);
        this.spreadsheetService.appendRows(SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET, adGroupSuggestions);
    }
    getStrategySuggestions(googleAdsClient, metricToOptimizeTowards, metrics) {
        const sheetRows = [];
        const simulations = googleAdsClient.fetchBiddingStrategySimulations();
        for (const s of simulations) {
            const simulation = s.biddingStrategySimulation;
            const entity = s.biddingStrategy;
            const row = this.generateSuggestionsRow(googleAdsClient, simulation, entity, metricToOptimizeTowards, metrics);
            sheetRows.push(row);
        }
        return sheetRows;
    }
    getCampaignSuggestions(googleAdsClient, metricToOptimizeTowards, metrics) {
        const sheetRows = [];
        const simulations = googleAdsClient.fetchCampaignSimulations();
        for (const s of simulations) {
            const simulation = s.campaignSimulation;
            const entity = s.campaign;
            const row = this.generateSuggestionsRow(googleAdsClient, simulation, entity, metricToOptimizeTowards, metrics);
            sheetRows.push(row);
        }
        return sheetRows;
    }
    getAdGroupSuggestions(googleAdsClient, metricToOptimizeTowards, metrics) {
        const sheetRows = [];
        const simulations = googleAdsClient.fetchAdGroupSimulations();
        for (const s of simulations) {
            const simulation = s.adGroupSimulation;
            const entity = s.adGroup;
            const row = this.generateSuggestionsRow(googleAdsClient, simulation, entity, metricToOptimizeTowards, metrics);
            sheetRows.push(row);
        }
        return sheetRows;
    }
    generateSuggestionsRow(googleAdsClient, simulation, entity, metricToOptimizeTowards, metrics) {
        const row = [];
        row[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_ID] = entity.resourceName;
        row[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_NAME] = entity.name;
        const simType = simulation.type;
        row[SuggestedTargetsLabelsIndex.BIDDING_STRATEGY_TYPE] = simType;
        const currentTarget = googleAdsClient.getEntityTarget(simType, entity) ?? 0;
        row[SuggestedTargetsLabelsIndex.CURRENT_TARGET] = currentTarget ?? '';
        const currentFilledInCellsCount = 5;
        const remainingCellsCount = this.getSuggestedTargetsHeaders().length - currentFilledInCellsCount;
        const points = googleAdsClient.getPoints(simulation);
        if (!points) {
            row[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] =
                'ERROR: No points found';
            const emptyRow = new Array(remainingCellsCount).fill('No data points');
            row.push(...emptyRow);
            return row;
        }
        let initialParams = [-2, 2, -0.5];
        if (simType === StrategyType.TARGET_CPA) {
            initialParams = [0.1, 1, 25];
        }
        const curves = this.createCurvesForAllMetrics(googleAdsClient, simType, currentTarget, points, metrics, initialParams);
        const [, dataMetric] = this.calculateValuePerMetric(googleAdsClient, simType, points, currentTarget, metricToOptimizeTowards);
        if (dataMetric && metricToOptimizeTowards in curves) {
            const [optimalTarget, suggestedTarget] = this.getTargetSuggestions(currentTarget, dataMetric, curves, metricToOptimizeTowards);
            row[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] = suggestedTarget ?? '';
            row[SuggestedTargetsLabelsIndex.OPTIMAL_TARGET] = optimalTarget ?? '';
            metrics.forEach(metric => {
                if (metric in curves) {
                    const { curve, offset } = curves[metric];
                    const getOriginalValue = (target) => {
                        const predictedValue = curve.predictValue(target);
                        if (predictedValue === undefined || predictedValue === null) {
                            return 'N/A';
                        }
                        return predictedValue - offset;
                    };
                    const currentActualValue = getOriginalValue(currentTarget) ?? 'N/A';
                    const suggestedActualValue = getOriginalValue(suggestedTarget) ?? 'N/A';
                    const optimalActualValue = getOriginalValue(optimalTarget) ?? 'N/A';
                    row.push(...[currentActualValue, suggestedActualValue, optimalActualValue]);
                }
                else {
                    row.push(...['N/A', 'N/A', 'N/A']);
                }
            });
            return row;
        }
        else {
            row[SuggestedTargetsLabelsIndex.SUGGESTED_TARGET] =
                'ERROR: No data found for optimization metric';
            const emptyRow = new Array(remainingCellsCount).fill('No data points');
            row.push(...emptyRow);
            return row;
        }
    }
    getTargetSuggestions(currentTarget, dataMetric, curves, metricToOptimizeTowards = SuggestedTargetsSheet.METRIC_TO_OPTIMIZE_TO) {
        if (dataMetric && dataMetric.length > 0) {
            const { curve } = curves[metricToOptimizeTowards];
            if (curve) {
                const analyzer = new TargetAnalyzer(curve);
                const optimalTarget = analyzer.findOptimalTargetForProfitUnconstrained(curve.strategyType);
                const suggestedTarget = analyzer.suggestNewTarget(currentTarget, optimalTarget, curve.strategyType);
                return [optimalTarget, suggestedTarget];
            }
            else {
                return [undefined, undefined];
            }
        }
        else {
            return [undefined, undefined];
        }
    }
    createCurvesForAllMetrics(googleAdsClient, strategyType, currentTarget, points, metrics, initialParams) {
        const curves = {};
        metrics.forEach(metric => {
            const [, dataMetric, valueToAdd] = this.calculateValuePerMetric(googleAdsClient, strategyType, points, currentTarget, metric);
            const curve = this.createAndValidateCurve(strategyType, dataMetric, metric, initialParams);
            if (curve) {
                curves[metric] = { curve, offset: valueToAdd };
            }
        });
        return curves;
    }
    calculateValuePerMetric(googleAdsClient, strategyType, points, currentTarget, metric) {
        const targetValues = [];
        let values = [];
        if (points) {
            let valueToAdd = 0;
            points.forEach(point => {
                const pTarget = googleAdsClient.getPointTarget(strategyType, point);
                targetValues.push(pTarget);
                try {
                    values.push(this.calculateValue(point, metric));
                }
                catch (e) {
                    console.error(`Skipping point due to error in metric calculation: ${e instanceof Error ? e.message : e}`);
                }
            });
            const lowestValue = Math.min(...values);
            if (lowestValue < 0) {
                valueToAdd = -lowestValue + 1;
                values = values.map(num => num + valueToAdd);
            }
            const result = targetValues.map((target, i) => [target, values[i]]);
            return [currentTarget, result, valueToAdd];
        }
        return [currentTarget, [], 0];
    }
    createAndValidateCurve(strategyType, data, metricName, initialParams) {
        if (data && data.length >= 3) {
            const curve = new Curve(strategyType, data, initialParams, metricName);
            const rSquared = curve.getRSquared();
            if (curve && rSquared !== null && !isNaN(rSquared) && rSquared > 0.8) {
                return curve;
            }
        }
        return null;
    }
    calculateValue(point, metric) {
        const { costMicros, biddableConversionsValue, clicks, biddableConversions, impressions, } = point;
        let value;
        switch (metric) {
            case 'cost':
                value = costMicros / 1e6;
                break;
            case 'profit':
                value = biddableConversionsValue - costMicros / 1e6;
                break;
            case 'conversionvalue':
                value = biddableConversionsValue;
                break;
            case 'roas':
                value =
                    costMicros > 0 ? biddableConversionsValue / (costMicros / 1e6) : 0;
                break;
            case 'clicks':
                value = clicks;
                break;
            case 'conversions':
                value = biddableConversions;
                break;
            case 'impressions':
                value = impressions;
                break;
            default:
                throw new Error(`Invalid metric requested: ${metric}`);
        }
        return value;
    }
}
SuggestedTargetsSheet.SUGGESTED_TARGETS_SHEET = 'Suggestions';
SuggestedTargetsSheet.METRIC_TO_OPTIMIZE_TO = 'profit';
SuggestedTargetsSheet.METRICS = [
    'profit',
    'cost',
    'conversionvalue',
    'clicks',
    'impressions',
    'conversions',
];

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
                return (r[TargetsLabelsIndex.NEW_TARGET] !== '' &&
                    Number(r[TargetsLabelsIndex.NEW_TARGET]) > 0);
            }
            return false;
        });
        const cids = googleAdsClient.getCids();
        for (const cid of cids) {
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
            const mutateOperations = [
                ...biddingStrategyOperations,
                ...campaignOperations,
                ...adGroupOperations,
            ];
            if (mutateOperations.length > 0) {
                googleAdsClient.mutateTargets(cid, mutateOperations);
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
        const portfolioTargets = this.getPortfolioTargets(googleAdsClient);
        const campaignTargets = this.getCampaignTargets(googleAdsClient);
        const adGroupTargets = this.getAdGroupTargets(googleAdsClient);
        return [...portfolioTargets, ...campaignTargets, ...adGroupTargets];
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
    const suggestedTargetsSheet = new SuggestedTargetsSheet(spreadsheetService);
    targetsSheet.initializeSheet();
    simulationsSheet.initializeSheet();
    cidSheet.initializeSheet();
    suggestedTargetsSheet.initializeSheet();
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
function loadSuggestions() {
    const suggestionsSheet = new SuggestedTargetsSheet(spreadsheetService);
    suggestionsSheet.load(googleAdsClient());
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
        .addItem('Load Suggestions', 'loadSuggestions')
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
    loadSuggestions();
}
