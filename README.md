# West Middle School Ski Club signup

Static signup website plus a Google Sheets Apps Script backend for punch-card purchases. The site collects guardian contact information and an explicit Yes/No card choice for the guardian and each additional person. Only selected cardholders are saved: one row per card, $45 per row. A unique four-character code groups a family purchase. A hidden Submission Key keeps retries safe even when a short code collides. Each card includes three free two-hour tubing sessions ($60 value); lift tickets and rentals are paid for separately at the cardholder rates shown.

## Set up the sheet

1. Create a new private Google Sheet in the organizer's account. Do not give families access to it.
2. Open **Extensions → Apps Script**. Replace the starter code with `apps-script/Code.gs` and save.
3. In Apps Script choose **Deploy → New deployment → Web app**. Set **Execute as: Me** and **Who has access: Anyone**. Authorize it and copy the URL ending in `/exec`.
4. Paste that URL into `config.js` as `scriptUrl`. Keep the quotes around it. The public form stays disabled until this is set.
5. In GitHub, publish this repository with **Settings → Pages → Deploy from a branch → main → /(root)**. The website files are at the repository root. Each Apps Script code change requires a new Web app version under **Manage deployments → Edit → New version**.

The first submission creates the **Punch Cards** tab and its columns. `Paid` starts unchecked; check the box for each cardholder row after you confirm the Venmo payment. Use the shared Registration ID and Payment Notes column to reconcile a family payment. Google Sheets can export this tab to CSV or Excel. Do not overwrite the header row.

## Payment flow

The form sends a registration to the script, waits for a positive acknowledgment, then shows the total and Venmo link for `@Henry-Lumbard-1`. The payment note includes the four-character code. Families must verify the recipient, amount, and note in Venmo. The link attempts to prefill the amount and note; Venmo's app/browser behavior can vary. Payments are not detected automatically; mark `Paid` in the sheet after confirming receipt.

If a request times out, **Retry registration** reuses the same internal submission key. The script checks that key before writing rows, so a delayed response does not create a second purchase. A new visit starts a new registration. The user should contact the organizer before paying if the site cannot confirm the save.

## Logo and copy

The original school logo asset was not available in this project. The header uses a simple W wordmark in the agreed blue (`#0000A6`), red (`#D30909`), and white. To use the real logo, add it to `assets/` and replace the `.brand-mark` element in `index.html` with an `<img>` carrying meaningful alt text. Review the lift/rental rates and tubing inclusion wording against Timber Ridge's offer before sharing the form.

## Files

- `index.html`, `styles.css`, `script.js`, `config.js`, `assets/favicon.svg`: complete frontend
- `apps-script/Code.gs`: server-side validation and Google Sheet writing
