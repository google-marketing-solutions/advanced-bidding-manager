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

/**
 * A service for interacting with Google Sheets.
 */
export class SpreadsheetService {
  private spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;

  constructor(private spreadsheetId: string) {}

  /**
   * Gets a sheet by name from the spreadsheet.
   * @param sheetName The name of the sheet.
   * @return The sheet object.
   * @throws An error if the sheet is not found.
   */
  getSpreadsheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
    if (!this.spreadsheet) {
      this.spreadsheet = SpreadsheetApp.openById(this.spreadsheetId);
    }

    const sheet = this.spreadsheet.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(
        `Sheet ${sheetName} cannot be found. Please initialize first.`
      );
    }
    return sheet;
  }

  /**
   * Fetches all values from a specific column in a sheet, starting from the second row.
   * @param sheetName The name of the sheet.
   * @param columnId The 0-based index of the column.
   * @param excludeEmpty Whether to filter out empty values. Defaults to true.
   * @return An array of values from the column.
   */
  fetchValuesFromColumn<T>(
    sheetName: string,
    columnId: number,
    excludeEmpty = true
  ): T[] {
    const sheet = this.getSpreadsheet(sheetName);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return [];
    }
    const range = sheet.getRange(2, columnId + 1, lastRow - 1, 1).getValues();

    // Convert to a one-dimensional array and filter.
    return range
      .map(r => r[0])
      .filter(r => !excludeEmpty || (r !== '' && r !== null)) as T[];
  }

  /**
   * Updates rows in a sheet. Rows with matching IDs in the specified column are updated.
   * New rows are appended.
   * @param sheetName The name of the sheet.
   * @param apiRows The rows of data to update.
   * @param idColumn The 0-based index of the column to use as an ID.
   */
  updateRows(
    sheetName: string,
    apiRows: Array<Array<string | number | boolean>>,
    idColumn: number
  ): void {
    const sheet = this.getSpreadsheet(sheetName);
    const extraRows: Array<Array<string | number | boolean>> = [];
    const ids = this.fetchValuesFromColumn<string>(sheetName, idColumn, false);

    for (const apiRow of apiRows) {
      const id = apiRow[idColumn];
      const index = ids.indexOf(id.toString());
      if (index > -1) {
        // Spreadsheet row index is offset by 2 (1 for 1-based index, 1 for header).
        const rowIndex = index + 2;
        sheet.getRange(rowIndex, 1, 1, apiRow.length).setValues([apiRow]);
      } else {
        extraRows.push(apiRow);
      }
    }

    this.appendRows(sheetName, extraRows);
  }

  /**
   * Appends rows to the end of a sheet.
   * @param sheetName The name of the sheet.
   * @param rows The rows of data to append.
   */
  appendRows(
    sheetName: string,
    rows: Array<Array<string | number | boolean>>
  ): void {
    if (rows.length === 0) {
      return;
    }
    const sheet = this.getSpreadsheet(sheetName);
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
      .setValues(rows);
  }

  /**
   * Clears all content from a sheet, except for the header row.
   * @param sheetName The name of the sheet.
   */
  clearSheet(sheetName: string): void {
    const sheet = this.getSpreadsheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();

    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, Math.max(1, lastColumn)).clearContent();
    }
  }

  /**
   * Inserts a new sheet if it doesn't exist and sets its headers.
   * @param sheetName The name of the sheet.
   * @param headers The headers to set for the sheet.
   */
  insertSheet(sheetName: string, headers: string[]): void {
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
