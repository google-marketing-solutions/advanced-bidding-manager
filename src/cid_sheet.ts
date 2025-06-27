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

import {SpreadsheetService} from './spreadsheet_service';
import {CustomerClientResponse, GoogleAdsClient} from './google_ads_client';

/**
 * Enum of Customers sheet columns
 */
export enum CustomerLabelsIndex {
  CUSTOMER_NAME = 0,
  CUSTOMER_LEVEL = 1,
  IS_MANAGER = 2,
  CUSTOMER_ID = 3,
  PARENT_MCC_ID = 4,
}

/**
 * A service for handling operations related to the "Customers" sheet.
 */
export class CidSheet {
  static readonly CID_SHEET = 'Customers';

  constructor(private spreadsheetService: SpreadsheetService) {}

  /**
   * Returns the headers for Customer Ids sheet.
   */
  getCustomerHeaders(): string[] {
    const headers: string[] = [];
    headers[CustomerLabelsIndex.CUSTOMER_NAME] = 'Customer name';
    headers[CustomerLabelsIndex.CUSTOMER_LEVEL] = 'Level';
    headers[CustomerLabelsIndex.IS_MANAGER] = 'Manager';
    headers[CustomerLabelsIndex.CUSTOMER_ID] = 'Customer ID';
    headers[CustomerLabelsIndex.PARENT_MCC_ID] = 'Parent MCC ID';

    return headers;
  }

  /**
   * Initializes the Customers sheet with its headers.
   */
  initializeSheet(): void {
    this.spreadsheetService.insertSheet(
      CidSheet.CID_SHEET,
      this.getCustomerHeaders()
    );
  }

  /**
   * Fetches customer IDs from the Customers sheet.
   * @return An array of customer IDs.
   */
  getCustomerIds(): string[] {
    return this.spreadsheetService.fetchValuesFromColumn<string>(
      CidSheet.CID_SHEET,
      CustomerLabelsIndex.CUSTOMER_ID
    );
  }

  /**
   * Loads all CIDs under the login customer ID from the API to the spreadsheet.
   * @param googleAdsClient instance of GoogleAdsClient
   * @param loginCustomerId the MCC
   */
  loadCids(googleAdsClient: GoogleAdsClient, loginCustomerId: string): void {
    this.spreadsheetService.clearSheet(CidSheet.CID_SHEET);
    if (!loginCustomerId) {
      throw new Error('Please update LOGIN_CUSTOMER_ID to fetch customer ids');
    }

    const customerIdsRows = this.getAllMccChildren(
      googleAdsClient,
      loginCustomerId
    );
    this.spreadsheetService.appendRows(CidSheet.CID_SHEET, customerIdsRows);
  }

  private getAllMccChildren(
    googleAdsClient: GoogleAdsClient,
    mcc: string
  ): Array<Array<string | number | boolean>> {
    const query = `
        SELECT customer_client.client_customer, customer_client.level,
          customer_client.manager, customer_client.descriptive_name,
          customer_client.id
        FROM customer_client
        WHERE customer_client.status = 'ENABLED'`;

    const customers = googleAdsClient.searchStreamApi<CustomerClientResponse>(
      [mcc],
      query
    );
    return customers.map(c => this.mapCustomerToRow(c, mcc));
  }

  private mapCustomerToRow(
    customer: CustomerClientResponse,
    mcc: string
  ): Array<(string | number | boolean)> {
    return [
      customer.customerClient.descriptiveName, // CUSTOMER_NAME
      customer.customerClient.level, // CUSTOMER_LEVEL
      customer.customerClient.manager, // IS_MANAGER
      customer.customerClient.id, // CUSTOMER_ID
      mcc, // PARENT_MCC_ID
    ];
  }
}
