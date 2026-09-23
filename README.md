# West Middle School Ski Club signup

Static signup website plus a Google Sheets Apps Script backend for punch-card registrations. The website reads prices and registration status from the Sheet's **Settings** tab. Student and adult punch-card prices can differ; lift tickets, rentals, and tubing details can be edited there. Registration starts closed, and the server also rejects new registrations while closed. Existing registrations can still be safely confirmed if a response was delayed.

## Set up the Google Sheet

1. Open the private Google Sheet used for registrations, then choose **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs) and save.
3. In the function list, choose `initializeSettings` and click **Run**. Approve the requested Google permissions. This creates the **Settings** tab; its **Registration Open** checkbox starts unchecked.
4. Update the Apps Script deployment: **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the existing Web app URL and settings (**Execute as: Me**, **Who has access: Anyone**).
5. Visit the website. It remains closed until you check **Registration Open** in the Settings tab. Change values in the **Value** column as needed, then have families reload the page to see the latest settings. Uncheck the box at any time to close registration.

The website is configured with the deployed `/exec` URL in `config.js`. If that URL changes, update `config.js` and publish the changed file to GitHub Pages. The public site displays the prices from Settings and uses the card prices to calculate the Venmo total. The Apps Script validates totals against the current Sheet prices when it saves a registration.

## Student punch-card goal

To add the **Student Goal** tab to the registration sheet, update the Apps Script with the current `apps-script/Code.gs`, save it, then run `initializeStudentGoalTracker` once from the Apps Script editor and approve permissions if prompted. The tab starts with a goal of 40, which can be changed in the highlighted goal cell. It counts rows marked `Student` in the **Punch Cards** tab and shows cards sold, percent complete, and cards remaining. Adult cards are excluded. The tracker recalculates as registrations are added.

## Registration data

The first registration creates the **Punch Cards** tab and its columns. There is one row per student or adult cardholder. A guardian is included as an adult only when they select that they need a card; other cardholders are added automatically. `Paid` starts unchecked; check the box for each cardholder after confirming the Venmo payment. A shared four-character Registration ID groups a family purchase. The hidden Submission Key keeps retries safe. Do not overwrite the header row.

## Payment flow

The form sends a registration to the script, waits for a positive acknowledgment, then shows the total and Venmo link for `@Henry-Lumbard-1`. The payment note includes the four-character code. Families must verify the recipient, amount, and note in Venmo. The link attempts to prefill the amount and note; Venmo's app/browser behavior can vary. Payments are not detected automatically; mark `Paid` in the sheet after confirming receipt.

If a request times out, retrying reuses the same internal submission key. The script checks that key before writing rows, so a delayed response does not create a second purchase. A new visit starts a new registration. Families should contact the organizer before paying if the site cannot confirm the save.

## Files

- `index.html`, `styles-registration-settings.css`, `script.js`, `config.js`, and `assets/`: complete frontend
- `apps-script/Code.gs`: settings management, server-side validation, and Google Sheet writing
