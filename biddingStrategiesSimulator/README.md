# Bidding Strategies Simulator - data extractor
Please note: this is not an officially supported Google product.

This Google Spreadsheet-based tool enables you to fetch bidding strategies
simulator data of multiple accounts at once, on demand or on schedule.

## Deployment

### 1. Clone the code

Clone this repository using the following command:
```
git clone git clone https://professional-services.googlesource.com/solutions/ads-bidding-editor
```

### 2. Obtain your Google Ads developer token


If you don't have a Google Ads Developer token already, follow the steps listed
[here](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
to obtain your Google Ads developer token.

The tool will use this token to pull bidding strategies data from Google Ads API.

### 3. Deploy the Spreadsheet

Update the **Code.gs** file with your token and account IDs:
```
const DEV_TOKEN = "YOUR-DEV-TOKEN"; // Enter your Developer token
const LOGIN_CUSTOMER_ID = "MCCCUSTOMERID"; // Enter your MCC ID, without dashes
const CUSTOMER_IDS = ["CUSTOMERID"]; // Enter your Ads customer ID(s)
```

In a new spreadsheet open the Apps Script menu ```Spreadsheet > Extensions > Apps Script```
and in the Editor manually copy the **Code.gs** file.

In the project settings, below the Editor menu:

1) check the box: Show "appsscript.json" manifest file in editor
2) Enable the Google Ads API in the default GCP project below or change the
GCP Project to another project that has enabled this API.

Lastly, manually copy the content of the **appsscript.json** in the Editor.

## Using the solution

 1. Use the **Ads Bidding Strategies Simulations** menu > **Load Simulations** menu item
   * It will fetch all the bidding strategies simulations and populate the
   existing sheet called "Sheet1"

Note: if there's no "Sheet1" or it's called differently, please change line:
``` const EDIT_SHEET = "Sheet1"; ```