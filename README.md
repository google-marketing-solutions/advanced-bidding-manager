# Advanced Bidding Manager for Google Ads

Please note: this is not an officially supported Google product.

This Google Spreadsheet-based tool enables you to:
 * Retrieve all your current bidding targets in a single view, for portfolio and campaign targets of multiple CIDs
 * Update selected targets at bulk, by clicking a button or on schedule
 * Retrieve the data points of bidding strategies [simulations](https://support.google.com/google-ads/answer/2470105) in one view, so that you can use these data points for target calculation
 * Connect it with your own data

# Getting started

You can install and run the tool in Spreadsheet (requires API key) or in Google 
Ads (as Ads Script).
Updating bidding targets is not available in Ads Script version.

To install you need to clone this repository using the following command:
```
git clone https://professional-services.googlesource.com/solutions/ads-bidding-editor
```

Create a new spreadsheet and make a note of the Spreadsheet ID that can be found
from the Spreadsheet url ie. https://docs.google.com/spreadsheets/d/**123**/edit

## Option A. Run in Spreadsheet

### Obtain your Google Ads developer token

Follow the steps listed [here](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
to obtain your Google Ads developer token.

The tool will use this token to pull and push bidding strategies data to Google Ads.

### Deploy the Spreadsheet

Create a new spreadsheet and make a note of the Spreadsheet ID that can be found 
from the Spreadsheet url ie. https://docs.google.com/spreadsheets/d/**123**/edit

Update the **Code.gs** file with your configuration:
```
const SPREADSHEET_ID = "YOUR-SPREADSHEET-ID-HERE";
const DEV_TOKEN = "YOUR-DEV-TOKEN";
const LOGIN_CUSTOMER_ID = "YOUR-MCC-CUSTOMER-ID";
```

In a new spreadsheet open the Apps Script menu Spreadsheet > Extensions > Apps Script
and in the Editor manually copy the **Code.gs** file.

In the project settings, below the Editor menu:

1) check the box: Show **"appsscript.json"** manifest file in editor
2) Enable the Google Ads API in the default GCP project below or change the
GCP Project to another project that has enabled this API.

Lastly, manually copy the content of the **appsscript.json** in the Editor.

### Using the solution

 1. Open the Spreadsheet, go to the **Ads Bidding** menu > **Initialize Spreadsheet**.
    Note: In case you are upgrading from an earlier version, delete all sheets before running step (1).

 2. Use the **Ads Bidding** menu > **Load Customer Ids** menu item.
    It will fetch all customer ids under a given LOGIN_CUSTOMER_ID and populate the "Customers" sheet.
    This Customer Ids will be used for both Load Targets and Simulations.
    If you want to load only specific CIDs, add them in the Customer ID column of the Customers sheet.

 3. Use the **Load Targets** option to fetch all your current bidding targets in the "Targets" sheet.

 4. Update the new ROAS/CPA target column on the spreadsheet. This is the only field that can be changed.

 5. Use the **Update Targets** option to push your new bidding targets to Google Ads.

 6. Use the **Ads Bidding** menu > **Load Simulations** menu item.
    It will fetch all the bidding strategies simulations and populate the "Simulations" sheet.

## Option B. Run as Google Ads Script

### Create a new Ads Script

Update the **Code.gs** file with your customer ids and spreadsheet id:
```
const SPREADSHEET_ID = "YOUR-SPREADSHEET-ID-HERE";
const CUSTOMER_IDS = ["YOUR-CUSTOMER-ID"];
```

Create a new Ads Script in MCC level and paste the code from Code.gs file.
More instructions on how to create a new script can be found
[here](https://developers.google.com/google-ads/scripts/docs/getting-started#manager-accounts)

### Using the solution

1. Run the script. It will fetch all your current bidding targets in the 
   "Targets" sheet and all the bidding strategies simulations and populate the 
   "Simulations" sheet.

2. Open the Spreadsheet, and navigate through the sheets.

## Configurable elements

You can change the sheet names by changing the lines:
```
const TARGETS_SHEET = "Targets";
const SIM_SHEET = "Simulations";
const CID_SHEET = "Customers";
```

You can change the metrics and date ranges to include when loading bidding targets:
```
const DATE_RANGES = ["LAST_30_DAYS"];
const TARGETS_METRICS = ["conversions", "conversions_value", "cost_micros", "average_cpc"];
```

# Disclaimer

Copyright Google LLC. Supported by Google LLC and/or its affiliate(s). This solution, including any related sample code or data, is made available on an “as is,” “as available,” and “with all faults” basis, solely for illustrative purposes, and without warranty or representation of any kind. This solution is experimental, unsupported and provided solely for your convenience. Your use of it is subject to your agreements with Google, as applicable, and may constitute a beta feature as defined under those agreements.  To the extent that you make any data available to Google in connection with your use of the solution, you represent and warrant that you have all necessary and appropriate rights, consents and permissions to permit Google to use and process that data.  By using any portion of this solution, you acknowledge, assume and accept all risks, known and unknown, associated with its usage and any processing of data by Google, including with respect to your deployment of any portion of this solution in your systems, or usage in connection with your business, if at all. With respect to the entrustment of personal information to Google, you will verify that the established system is sufficient by checking Google's privacy policy and other public information, and you agree that no further information will be provided by Google.

