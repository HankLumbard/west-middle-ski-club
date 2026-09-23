/**
 * West Middle School Ski Club punch-card registrations.
 * Paste into the Apps Script editor attached to your private Google Sheet.
 * Deploy as a Web app: execute as Me, access Anyone.
 */
const SHEET_NAME = 'Punch Cards';
const CARD_PRICE = 45;
const HEADERS = [
  'Submitted At', 'Registration ID', 'Guardian First Name', 'Guardian Last Name',
  'Email', 'Cell', 'Street Address', 'City', 'State', 'ZIP',
  'Cardholder First Name', 'Cardholder Last Name', 'Cardholder Type',
  'Card Price', 'Registration Total', 'Paid', 'Payment Notes'
];

function doGet(e) {
  const params = e && e.parameter || {};
  const id = String(params.id || '');
  let found = false;
  if (params.action === 'status' && /^[a-f0-9-]{36}$/i.test(id)) {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet && spreadsheet.getSheetByName(SHEET_NAME);
    if (sheet && sheet.getLastRow() > 1) {
      found = !!sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).findNext();
    }
  }
  // A public status check reveals only whether an unguessable registration ID exists.
  const result = JSON.stringify({ ok: found, registrationId: id });
  const callback = String(params.callback || '');
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + result + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(result)
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const nonce = String(e && e.parameter && e.parameter.nonce || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 80);
  let id = '';
  let result;
  try {
    const payload = JSON.parse(String(e.parameter.payload || ''));
    id = String(payload.registrationId || '');
    validate_(payload);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('The registration system is busy. Please retry.');
    try {
      const sheet = getSheet_();
      const last = sheet.getLastRow();
      if (last > 1) {
        const prior = sheet.getRange(2, 2, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
        if (prior) {
          result = { kind: 'west-ski-registration', nonce: nonce, registrationId: id, ok: true, duplicate: true };
        }
      }
      if (!result) {
        const g = payload.guardian;
        const now = new Date();
        const total = payload.people.length * CARD_PRICE;
        const rows = payload.people.map(p => [
          now, safe_(id), safe_(g.firstName), safe_(g.lastName), safe_(g.email), safe_(g.cell),
          safe_(g.street), safe_(g.city), safe_(g.state), safe_(g.zip),
          safe_(p.firstName), safe_(p.lastName), safe_(p.type), CARD_PRICE, total, false, ''
        ]);
        const nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, rows.length, HEADERS.length).setValues(rows);
        sheet.getRange(nextRow, 16, rows.length, 1).insertCheckboxes();
        SpreadsheetApp.flush();
        result = { kind: 'west-ski-registration', nonce: nonce, registrationId: id, ok: true };
      }
    } finally { lock.releaseLock(); }
  } catch (err) {
    result = { kind: 'west-ski-registration', nonce: nonce, registrationId: id, ok: false, error: String(err.message || 'Could not save registration.').slice(0, 180) };
  }
  // Apps Script nests HTML Service in its own sandboxed iframe; reply to the top-level signup page.
  // No personal information is returned or placed in the payment URL.
  const encoded = Utilities.base64Encode(Utilities.newBlob(JSON.stringify(result), 'application/json').getBytes());
  return HtmlService.createHtmlOutput('<!doctype html><html><body><script>window.top.postMessage(JSON.parse(atob("' + encoded + '")),"*");<\/script></body></html>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Attach this script to the Google Sheet first.');
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  if (!sheet.getLastRow()) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0000a6').setFontColor('#ffffff');
  }
  return sheet;
}

function validate_(p) {
  if (!p || typeof p !== 'object' || !p.guardian || !Array.isArray(p.people)) throw new Error('Invalid registration.');
  if (!/^[a-f0-9-]{36}$/i.test(String(p.registrationId || ''))) throw new Error('Invalid registration ID.');
  if (p.people.length < 1 || p.people.length > 30) throw new Error('Choose between 1 and 30 punch cards.');
  const g = p.guardian;
  ['firstName', 'lastName', 'email', 'cell', 'street', 'city', 'state', 'zip'].forEach(key => required_(g[key], 160));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(g.email))) throw new Error('Enter a valid email address.');
  p.people.forEach(person => {
    required_(person.firstName, 80); required_(person.lastName, 80);
    if (!['Student', 'Adult'].includes(person.type)) throw new Error('Invalid cardholder type.');
  });
  if (p.total !== p.people.length * CARD_PRICE) throw new Error('The card total does not match.');
}

function required_(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Complete all required fields.');
}

function safe_(value) {
  const text = String(value).trim();
  // Prevent entered names or addresses being interpreted as spreadsheet formulas.
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}
