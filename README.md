# West Middle School Ski Club signup

Static signup website plus a Google Sheets Apps Script backend for punch-card registrations. The website reads prices and registration status from the Sheet's **Settings** tab. Student and adult punch-card prices can differ; lift tickets, ski rental, snowboard rental, and tubing details can be edited there. Registration starts closed, and the server also rejects new registrations while closed. Existing registrations can still be safely confirmed if a response was delayed.

## Set up the Google Sheet

1. Open the private Google Sheet used for registrations, then choose **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with [`apps-script/Code.gs`](apps-script/Code.gs) and save.
3. In the function list, choose `initializeSettings` and click **Run**. Approve the requested Google permissions. This creates the **Settings** tab; its **Registration Open** checkbox starts unchecked.
4. Update the Apps Script deployment: **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the existing Web app URL and settings (**Execute as: Me**, **Who has access: Anyone**).
5. Visit the website. It remains closed until you check **Registration Open** in the Settings tab. Change values in the **Value** column as needed, then have families reload the page to see the latest settings. Uncheck the box at any time to close registration.

The website is configured with the deployed `/exec` URL in `config.js`. If that URL changes, update `config.js` and publish the changed file to GitHub Pages. The public site displays the prices from Settings, including separate ski and snowboard rental rates, and uses the card prices to calculate the Venmo total. The Apps Script validates totals against the current Sheet prices when it saves a registration.

## October 2026 cardholder pricing

Tubing offers three two-hour sessions per card at **$20 per session**, regularly $28. Student cards also offer **two introductory ski lessons per card for $10 each**, regularly $40 each. Snowboard rental is **$40**, regularly $40. These are informational benefits paid separately; registration collects punch-card payments only.

Replace the bound Apps Script with the current `apps-script/Code.gs`, save, run **updateCardholderPricing** once, then update the existing deployment to a new version. This adds the tubing and lesson price settings and sets snowboard rental to $40, preserving registration status, punch-card prices, and registrations. Old Tubing Included, Free Tubing Sessions, and Tubing Value rows remain labeled as unused. Until the new script is deployed, the frontend displays the confirmed benefit prices instead of the old free-tubing/$30 snowboard information.

## Student punch-card goal

To add the **Student Goal** tab to the registration sheet, update the Apps Script with the current `apps-script/Code.gs`, save it, then run `initializeStudentGoalTracker` once from the Apps Script editor and approve permissions if prompted. The tab starts with a goal of 40, which can be changed in the highlighted goal cell. It counts rows marked `Student` in the **Punch Cards** tab and shows cards sold, percent complete, and cards remaining. Adult cards are excluded. The tracker recalculates as registrations are added.

## Registration data

The first registration creates the **Punch Cards** tab and its columns. There is one row per student or adult cardholder. A guardian is included as an adult only when they select that they need a card; other cardholders are added automatically. **Registration Total** appears only on the first row of each registration (the guardian's card row when purchased, otherwise the first cardholder row with the guardian's contact information); remaining rows are blank in that column so it can be summed without double-counting. `Paid` starts unchecked; check the box for each cardholder after confirming the Venmo payment. A shared four-character Registration ID groups a family purchase. The hidden Submission Key keeps retries safe. Do not overwrite the header row.

## Registration receipt emails

Receipts use Gmail and appear in the sending account's Sent mail. They use the approved wording, actual cardholder names and purchase prices, registration ID, total due, and Venmo payment link. Only the guardian receives a receipt; there is no organizer copy.

1. Replace the bound Apps Script `Code.gs` with the current `apps-script/Code.gs` and save.
2. Run **enableRegistrationEmails** once and authorize access. This adds receipt tracking columns S–U and installs a one-minute email trigger. It does not email old registrations.
3. Update the existing Web app deployment: **Deploy → Manage deployments → Edit → New version → Deploy**.
4. Submit a registration through the site with your own email address to test the complete flow. Check Inbox and Sent for the receipt.

Alternatively, **sendTestReceiptToMyself** sends a clearly labeled sample receipt to the Google account running the script, without registering anyone or enabling automatic emails.

New registrations queue one receipt on the first row of the purchase. A separate trigger sends it, typically within a few minutes, without delaying signup. Retries of the form do not queue another receipt. Receipt Status shows Pending, Sending, Sent, or Review needed. Errors leave the registration recorded. For Review needed or a stuck Sending status, check Sent mail before changing the status back to Pending to retry. Run **disableRegistrationEmails** to pause receipt sending and stop queuing new emails.

## Payment flow

The form sends a registration to the script, waits for a positive acknowledgment, then shows the total and Venmo link for `@Henry-Lumbard-1`. The payment note includes the four-character code. Families must verify the recipient, amount, and note in Venmo. On mobile, the button uses a direct `venmo://paycharge` app link with the recipient, amount, and note. On desktop, it opens `https://account.venmo.com/pay` with the same parameters. Mobile users also have an explicit website fallback if the app is unavailable. Both note and amount can be copied. Web prefill remains best-effort because Venmo may ignore URL parameters or discard them during sign-in; a successful end-to-end app/web prefill has not been verified. Email receipts use an HTTPS username payment link with the same payment parameters. Payments are not detected automatically; mark `Paid` in the sheet after confirming receipt.

If a request times out, retrying reuses the same internal submission key. The script checks that key before writing rows, so a delayed response does not create a second purchase. A new visit starts a new registration. Families should contact the organizer before paying if the site cannot confirm the save.

## Files

- `index.html`, `styles-registration-settings.css`, `script.js`, `config.js`, and `assets/`: complete frontend
- `apps-script/Code.gs`: settings management, server-side validation, and Google Sheet writing

## Turnstile and abuse protection

Create a Cloudflare Turnstile widget in **Managed** mode named **West Middle Ski Club**, allowing only `hanklumbard.github.io`. Pre-clearance is not needed. The widget verifies on the signup page; Apps Script validates the single-use token, hostname, and `ski-registration` action before saving a new entry. Existing submission-ID retries remain idempotent and do not queue another receipt.

In the ski Apps Script project's **Project Settings → Script properties**, add:

- `TURNSTILE_SITE_KEY`: the public site key from Cloudflare. The settings endpoint exposes this key to the form.
- `TURNSTILE_SECRET_KEY`: the private key from Cloudflare. Keep it only in Script properties; never put it in GitHub, a public Sheet, a screenshot, or chat.

Set the keys before deploying the protected Apps Script and publishing the updated form. Update the **existing** Apps Script deployment to a new version so the `/exec` URL stays the same. Apps Script may request permission to call the external verification service through `UrlFetchApp`. Do not run sheet initialization or change existing registrations as part of this update.

Security verification fails closed when a token is missing, invalid, expired, reused, from another hostname/action, or the verification service cannot be reached. Visitors see a message and can retry without losing form fields. Missing configuration prevents new registrations rather than silently bypassing protection.

Limits are defined in `ABUSE_LIMITS` in `apps-script/Code.gs`:

| Limit | Default |
|---|---:|
| New registrations across the site in a rolling hour | 200 |
| New registrations across the site in rolling 24 hours | 500 |
| New registrations per normalized email in a rolling hour | 3 |
| New registrations per normalized email in rolling 24 hours | 6 |
| Automatic receipt attempts per UTC calendar day | 90 |

Registration counts use unique registration IDs, so purchasing multiple cards counts as one registration. Existing-ID retries do not consume another registration slot. Receipts above the daily budget remain **Pending** and resume after the UTC day resets. The budget reserves attempts under the script lock before sending, including failed sends. Manually run sample receipts are outside that automatic budget. These application limits reduce junk writes and receipt abuse; they do not stop all requests from reaching Apps Script or guarantee protection against traffic floods.

Run local security checks with `node --test scripts/*.test.cjs`. These use mocked Sheet/email/verification services and never send actual registrations or emails. Production verification should include widget display, rejected missing/invalid tokens, and a real registration test only when the organizer wants one.

Before deployment, refresh the Apps Script editor and run `checkTurnstileConnection`. It contacts Cloudflare with an intentionally invalid token, checks that the private key is accepted, and logs the result without creating registrations or emails. If Google requests authorization, review the permission to connect to an external service. `doGet` alone is not a live connection check.
