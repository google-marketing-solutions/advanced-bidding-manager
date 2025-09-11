# Advanced Bidding Manager for Google Ads

Please note: this is not an officially supported Google product.

This tool enables you to:
 * **Load Bidding Targets**: Retrieve all your current bidding targets in a single view, for portfolio and
 campaign targets of multiple customer ids
 * **Update Bidding Targets**: Update selected targets at bulk via Google Spreadsheets, by clicking a button
 or on schedule
 * **Load Bidding Simulations** Retrieve the data points of bidding [simulations](https://support.google.com/google-ads/answer/2470105)
 in one Spreadsheet view, so that you can use these data points for target
 calculation
 * **Load Bidding Targets Suggestions** Retrieve the data points of bidding [simulations](https://support.google.com/google-ads/answer/2470105)
 and use these data points for optimal and suggested target calculation

# Getting started

This tool comes in two versions:

  1) Spreadsheet version as an Apps Script
     * Requirements:
       * Google Ads API token
       * Google Cloud Project (GCP) with [Google Ads API enabled](https://console.cloud.google.com/apis/library/googleads.googleapis.com).
     * Functionalities:
       * Load Bidding Targets
       * Update Bidding Targets
       * Load Bidding Simulations
       * Load Bidding Targets Suggestions
  2) Google Ads version as an Ads Script
     * No Ads API token nor GCP requirements
     * Functionalities:
       * Load Bidding Targets
       * Update Bidding Targets
       * Load Bidding Simulations
       * Load Bidding Targets Suggestions

**Step1:** For both version start by [creating a new spreadsheet](https://docs.google.com/spreadsheets/create)
and make a note of the Spreadsheet ID that can be found from the Spreadsheet url
ie. https://docs.google.com/spreadsheets/d/**123**/edit

## Option A. Run in a Spreadsheet

### Obtain your Google Ads developer token

Follow the steps listed [here](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
to obtain your Google Ads developer token.

The tool will use this token to pull and push bidding strategies data to Google Ads.

### Deploy the Spreadsheet

**Step2**: In the newly created spreadsheet open the Apps Script menu Spreadsheet > Extensions > Apps Script
and in the Editor manually copy the **[dist/Code.gs](https://github.com/google-marketing-solutions/advanced-bidding-manager/blob/main/dist/Code.gs)** file.

**Step3**: Update the **dist/Code.gs** file with your configuration:

```
const SPREADSHEET_ID = "YOUR-SPREADSHEET-ID-HERE";
const DEV_TOKEN = "YOUR-DEV-TOKEN";
const LOGIN_CUSTOMER_ID = "YOUR-MCC-CUSTOMER-ID";
```

**Step4**: In the project settings, below the Editor menu:

1) Check the box: Show **"appsscript.json"** manifest file in editor
2) Change the GCP Project to your project that has enabled Ads API by entering the [GCP Project Number](https://cloud.google.com/resource-manager/docs/creating-managing-projects#identifying_projects).

Note: If there's no OAuth Consent Screen configured in the Google Cloud Project yet,
you’ll be asked to [configure consent screen first](https://developers.google.com/workspace/guides/configure-oauth-consent):

* Consent screen: Fill in: "App name" and "User support email".
* Consent screen: As User Type - Select Internal.
* Consent screen: Add contact information
* Consent screen: Finally, press “Save and Create”.

**Step5**: Manually copy the content of the **[appsscript.json](https://github.com/google-marketing-solutions/advanced-bidding-manager/blob/main/appsscript.json)** in the Apps Script Editor.

### Using the solution

 1. Open the Spreadsheet, go to the **Ads Bidding** menu > **Initialize Spreadsheet**.

Note: In case you are upgrading from an earlier version, delete all sheets before running step (1).

 2. Use the **Ads Bidding** menu > **Load Customer Ids** menu item.

It will fetch all customer ids under a given LOGIN_CUSTOMER_ID and populate the "Customers" sheet.
This Customer Ids will be used for Load Targets, Simulations and Suggestions.

If you want to load only specific CIDs, add them in the Customer ID column of the Customers sheet.

Note: If this list contains Manager accounts (Column C - Manager equals TRUE in the Customers sheet)
you need to remove the TARGETS_METRICS by changing the Code.gs code from:
```
const TARGETS_METRICS = [
    'conversions',
    'conversions_value',
    'cost_micros',
    'average_cpc',
];
```

to:

```
const TARGETS_METRICS = [];
```

 3. Use the **Load Targets** option to fetch all your current bidding targets in the "Targets" sheet.

 4. Update the **New target** column on the spreadsheet. This is the only field that can be changed.

 5. Use the **Update Targets** option to push your new bidding targets to Google Ads.

 6. Use the **Ads Bidding** menu > **Load Simulations** menu item.
    It will fetch all the bidding strategies simulations and populate the "Simulations" sheet.

 7. Use the **Ads Bidding** menu > **Load Suggestions** menu item.
    It will fetch all the bidding strategies simulations and off those calculate and bidding targets suggestions and populate the "Suggestions" sheet.

## Option B. Run as Google Ads Script

### Create a new Ads Script

**Step2:** Create a new Ads Script in MCC level and paste the code from [dist/Code.gs](https://github.com/google-marketing-solutions/advanced-bidding-manager/blob/main/dist/Code.gs) file.

More instructions on how to create a new script can be found
[here](https://developers.google.com/google-ads/scripts/docs/getting-started#manager-accounts)

**Step3:** Update the **dist/Code.gs** file with your customer ids and spreadsheet id:

```
const SPREADSHEET_ID = "YOUR-SPREADSHEET-ID-HERE";
const CUSTOMER_IDS = ["YOUR-CUSTOMER-ID"];
```

### Using the solution to Load Bidding Targets and Simulations

By default the script will load Bidding Targets and Simulations with each run.

1. Run the script. It will fetch all your current bidding targets in the
   "Targets" sheet, all the bidding strategies simulations and populate the
   "Simulations" sheet and calculate suggested targets and populate the "Suggestions" sheet.

2. Open the Spreadsheet, and navigate through the sheets.

### Using the solution to Upload New Bidding Targets

1. Change the bidding targets by setting new values in the Spreadsheet column 'New target'.

2. Create a new Google Ads Script (re-do step2 and step3 from above).

3. At the bottom of the script, replace the main function with the following code:

```
function main() {
    updateTargets();
}
```

4. Run the script. It will push your new bidding targets to Google Ads.

## Configurable elements

You can change the sheet names by changing the lines:
```
const TARGETS_SHEET = "Targets";
const SIM_SHEET = "Simulations";
const SUGGESTED_TARGETS_SHEET = 'Suggestions';
const CID_SHEET = "Customers";
```

You can change the metrics and date ranges to include when loading bidding targets:
```
const DATE_RANGES = ["LAST_30_DAYS"];
const TARGETS_METRICS = ["conversions", "conversions_value", "cost_micros", "average_cpc"];
```

You can change the metric towards which you want to optimize your bidding strategies to (by default is profit):
```
const METRIC_TO_OPTIMIZE_TO = 'profit';
const METRICS = [
    'profit',
    'cost',
    'conversionvalue',
    'clicks',
    'impressions',
    'conversions',
];
```

# Disclaimer

Copyright Google LLC. Supported by Google LLC and/or its affiliate(s). This solution, including any related sample code or data, is made available on an “as is,” “as available,” and “with all faults” basis, solely for illustrative purposes, and without warranty or representation of any kind. This solution is experimental, unsupported and provided solely for your convenience. Your use of it is subject to your agreements with Google, as applicable, and may constitute a beta feature as defined under those agreements.  To the extent that you make any data available to Google in connection with your use of the solution, you represent and warrant that you have all necessary and appropriate rights, consents and permissions to permit Google to use and process that data.  By using any portion of this solution, you acknowledge, assume and accept all risks, known and unknown, associated with its usage and any processing of data by Google, including with respect to your deployment of any portion of this solution in your systems, or usage in connection with your business, if at all. With respect to the entrustment of personal information to Google, you will verify that the established system is sufficient by checking Google's privacy policy and other public information, and you agree that no further information will be provided by Google.

