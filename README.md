# Bidding targets manager for Google Ads

Please note: this is not an officially supported Google product.

This Google Spreadsheet-based tool enables you to:
 * Retrieve all your current bidding targets in a single view, for portfolio and campaign targets of multiple CIDs
 * Update selected targets at bulk, by clicking a button or on schedule
 * Retrieve the data points of bidding strategies [simulations](https://support.google.com/google-ads/answer/2470105) in one view, so that you can use these data points for target calculation
 * Connect it with your own data

## Deployment

### 1. Clone the code

Clone this repository using the following command:
```
git clone https://professional-services.googlesource.com/solutions/ads-bidding-editor
```

### 2. Obtain your Google Ads developer token

Follow the steps listed [here](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
to obtain your Google Ads developer token.

The tool will use this token to pull and push bidding strategies data to Google Ads.

### 3. Deploy the Spreadsheet

Update the **Code.gs** file with your token and account IDs:
```
const DEV_TOKEN = "YOUR-DEV-TOKEN";
const LOGIN_CUSTOMER_ID = "YOUR-MCC-CUSTOMER-ID";
```

You can create the spreadsheet manually or automatically using clasp in your Google Cloud Shell.

**Manually**

In a new spreadsheet open the Apps Script menu Spreadsheet > Extensions > Apps Script
and in the Editor manually copy the **Code.gs** file.

In the project settings, below the Editor menu:

1) check the box: Show **"appsscript.json"** manifest file in editor
2) Enable the Google Ads API in the default GCP project below or change the
GCP Project to another project that has enabled this API.

Lastly, manually copy the content of the **appsscript.json** in the Editor.

**Automatically**

To create the spreadsheet automatically, you need to run the following in your Google Cloud Shell:
```
npm install -g @google/clasp
clasp login --no-localhost
```

After running clasp login, you will be given a url.
Open the URL, authorize and copy the "Authorization code" of the last step. Paste the code to the terminal.

Run the following command to create a new Spreadsheet:

```
clasp create --type sheets --title "Ads bidding targets updater"
```

Run the following command to upload the Apps Script to your Spreadsheet.

```
clasp push
cd ..
```

## Using the solution

 1. Open the Spreadsheet, go to the **Ads Bidding** menu > **Initialize Spreadsheet**.

 2. Use the **Ads Bidding** menu > **Load Customer Ids** menu item.
    It will fetch all customer ids under a given LOGIN_CUSTOMER_ID and populate the "Customers" sheet.
    This data can be used for both Load Strategies and Simulations instead of the hardcoded list of Customer Ids.
    If you want to load only specific CIDs, add them in the Customer ID column of the Customers sheet.

 3. Use the **Load Strategies** option to fetch all your current portfolio bidding strategies (ROAS).
    It will fetch all the bidding targets and populate the "Targets" sheet.

 4. Update the new ROAS target column on the spreadsheet. This is the only field that can be changed.

 5. Use the **Update Strategies** option to push your new ROAS targets to Google Ads.

 6. Use the **Ads Bidding** menu > **Load Simulations** menu item.
    It will fetch all the bidding strategies simulations and populate the "Simulations" sheet.

Note: you can change the sheet names by changing the lines:
```
const TARGETS_SHEET = "Targets";
const SIM_SHEET = "Simulations";
const CID_SHEET = "Customers";
```
