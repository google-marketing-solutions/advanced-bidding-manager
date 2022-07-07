# Bidding targets updater for Google Ads portfolio strategies

Please note: this is not an officially supported Google product.

This Google Spreadsheet-based tool enables you to update bidding targets of multiple accounts at once, 
on demand or on schedule.

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
const DEV_TOKEN = ""; // Enter your Developer token
const LOGIN_CUSTOMER_ID = ""; // Enter your MCC ID
const CUSTOMER_IDS = [""]; // Enter your Ads customer ID(s)
```

You can create the input spreadsheet manually by copying the **appsscript.json** and **Code.gs** files 
of this repository to your Spreadsheet > Extensions > Apps Script, 
or automatically using clasp in your Google Cloud Shell:
```
npm install -g @google/clasp
clasp login --no-localhost
```

After running clasp login, you will be given a url. Open the URL, authorize and copy the "Authorization code" of the last step. Paste the code to the terminal.

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
 
 1. Open the Spreadsheet, go to the **Ads Bidding Strategies** menu > Initialize Spreadsheet.

 2. Use the **Load Strategies** option to fetch all your current portfolio bidding strategies (ROAS).
 
 3. Update the new ROAS target column on the spreadsheet. This is the only field that can be changed.

 4. Use the **Update Strategies** option to push your new ROAS targets to Google Ads.
