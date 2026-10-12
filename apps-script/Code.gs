/**
 * West Middle School Ski Club punch-card registrations.
 * Paste into the Apps Script editor attached to your private Google Sheet.
 * Deploy as a Web app: execute as Me, access Anyone.
 */
const SHEET_NAME = 'Punch Cards';
const SETTINGS_SHEET_NAME = 'Settings';
const RECEIPT_HEADERS = ['Receipt Status', 'Receipt Sent At', 'Receipt Error'];
const HEADERS = [
  'Submitted At', 'Registration ID', 'Guardian First Name', 'Guardian Last Name',
  'Email', 'Cell', 'Street Address', 'City', 'State', 'ZIP',
  'Cardholder First Name', 'Cardholder Last Name', 'Cardholder Type',
  'Card Price', 'Registration Total', 'Paid', 'Payment Notes', 'Submission Key'
];
const DEFAULT_SETTINGS = [
  ['Registration Open', false, 'Checked = open. Unchecked = closed. Changes apply to new page visits and are enforced when saving.'],
  ['Student Punch Card Price', 45, 'Amount charged for each student punch card.'],
  ['Adult Punch Card Price', 45, 'Amount charged for each adult punch card.'],
  ['Student Lift Ticket Price', 28, 'Discounted student lift ticket price.'],
  ['Student Lift Ticket Note', 'Any day', 'When the student lift ticket price applies.'],
  ['Adult Weekday Lift Ticket Price', 28, 'Discounted adult weekday/non-holiday lift ticket price.'],
  ['Adult Weekend/Holiday Lift Ticket Price', 33, 'Discounted adult weekend/holiday lift ticket price.'],
  ['Rental Price', 26, 'Discounted ski rental price.'],
  ['Snowboard Rental Price', 30, 'Discounted snowboard rental price.'],
  ['Tubing Included', true, 'Checked = tubing is included with each punch card.'],
  ['Free Tubing Sessions', 3, 'Free two-hour tubing sessions included per card.'],
  ['Tubing Session Hours', 2, 'Length of each free tubing session.'],
  ['Tubing Value', 60, 'Dollar value of the included tubing sessions.'],
  ['Closed Message', 'Registration is closed while final pricing and details are being confirmed.', 'Message shown on the website while registration is closed.']
];

function doGet(e) {
  const params = e && e.parameter || {};
  let result;

  if (params.action === 'settings') {
    try {
      result = { ok: true, settings: getPublicSettings_() };
    } catch (err) {
      console.error('Settings endpoint failed:', err && err.stack ? err.stack : err);
      result = { ok: false, error: 'Registration settings are unavailable.' };
    }
  } else {
    const id = String(params.id || '');
    let match = null;
    if (params.action === 'status' && /^[a-f0-9-]{36}$/i.test(id)) {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = spreadsheet && spreadsheet.getSheetByName(SHEET_NAME);
      if (sheet) match = findRegistration_(sheet, id);
    }
    // Only an unguessable internal ID can retrieve the short display code.
    result = { ok: !!match, registrationId: id, displayId: match ? match.displayId : null };
  }

  const callback = String(params.callback || '');
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$]{0,80}$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run once from the Apps Script editor to create the Settings tab and authorize access.
function initializeSettings() {
  ensureSettingsSheet_();
  SpreadsheetApp.flush();
}

// Run once from the Apps Script editor to create a live student punch-card goal tracker.
// The goal input is preserved if this function is run again.
function initializeStudentGoalTracker() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Attach this script to the Google Sheet first.');
  getSheet_(); // Ensure the source tab exists before installing formulas that reference it.

  let sheet = spreadsheet.getSheetByName('Student Goal');
  if (!sheet) sheet = spreadsheet.insertSheet('Student Goal');

  if (!sheet.getLastRow()) {
    sheet.getRange('A1:B1').merge();
    sheet.getRange('A1').setValue('Student Punch Card Goal');
    sheet.getRange('A2:B5').setValues([
      ['Goal (student cards)', 40],
      ['Student punch cards sold', ''],
      ['Progress', ''],
      ['Cards remaining', '']
    ]);
    sheet.getRange('B3').setFormula("=COUNTIF('Punch Cards'!M:M,\"Student\")");
    sheet.getRange('B4').setFormula('=IFERROR(B3/B2,0)');
    sheet.getRange('B5').setFormula('=MAX(B2-B3,0)');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 245);
    sheet.setColumnWidth(2, 180);
    sheet.getRange('A1:B1').setFontWeight('bold').setBackground('#0000a6').setFontColor('#ffffff');
    sheet.getRange('A2:A5').setFontWeight('bold');
    sheet.getRange('B4').setNumberFormat('0%');
    sheet.getRange('B2').setBackground('#fff2cc').setNote('Enter or change the student punch-card goal here. Adult punch cards are not included.');
    sheet.getRange('B3:B5').setBackground('#e2f0d9');
    sheet.getRange('A7:B7').merge();
    sheet.getRange('A7').setValue('Only rows marked Student on the Punch Cards tab count. Adult cards are excluded.');
    sheet.getRange('A7').setWrap(true).setFontColor('#555555');
    sheet.setRowHeight(7, 36);
  } else {
    const value = sheet.getRange('B2').getValue();
    if (value === '' || value == null) sheet.getRange('B2').setValue(40);
    sheet.getRange('B3').setFormula("=COUNTIF('Punch Cards'!M:M,\"Student\")");
    sheet.getRange('B4').setFormula('=IFERROR(B3/B2,0)');
    sheet.getRange('B5').setFormula('=MAX(B2-B3,0)');
  }
  SpreadsheetApp.flush();
}

function getPublicSettings_() {
  return getSettings_();
}

function doPost(e) {
  const nonce = String(e && e.parameter && e.parameter.nonce || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 80);
  let id = '';
  let result;
  try {
    const rawPayload = String(e && e.parameter && e.parameter.payload || '');
    const payload = JSON.parse(rawPayload);
    id = String(payload.registrationId || '');
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid registration ID.');

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error('The registration system is busy. Please retry.');
    try {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (!spreadsheet) throw new Error('Attach this script to the Google Sheet first.');
      const existingSheet = spreadsheet.getSheetByName(SHEET_NAME);
      const prior = existingSheet ? findRegistration_(existingSheet, id) : null;
      if (prior) {
        result = { kind: 'west-ski-registration', nonce: nonce, registrationId: id, displayId: prior.displayId, ok: true, duplicate: true };
      } else {
        const settings = getSettings_();
        if (!settings.registrationOpen) throw new Error(settings.closedMessage || 'Registration is currently closed.');
        validate_(payload, settings);

        const sheet = getSheet_();
        const code = newCode_(sheet);
        const g = payload.guardian;
        const now = new Date();
        const total = money_(payload.people.reduce((sum, person) => sum + settings.cardPrices[person.type], 0));
        const receiptsEnabled = PropertiesService.getScriptProperties().getProperty('REGISTRATION_EMAILS_ENABLED') === 'true';
        // The guardian's card is first when purchased; otherwise the first child's
        // row carries the guardian contact information and registration total.
        const rows = payload.people.map((person, index) => [
          now, code, safe_(g.firstName), safe_(g.lastName), safe_(g.email), safe_(g.cell),
          safe_(g.street), safe_(g.city), safe_(g.state), safe_(g.zip),
          safe_(person.firstName), safe_(person.lastName), safe_(person.type),
          settings.cardPrices[person.type], index === 0 ? total : '', false, '', id,
          ...(receiptsEnabled ? [index === 0 ? 'Pending' : '', '', ''] : [])
        ]);
        const nextRow = sheet.getLastRow() + 1;
        sheet.getRange(nextRow, 1, rows.length, rows[0].length).setValues(rows);
        sheet.getRange(nextRow, 16, rows.length, 1).insertCheckboxes();
        SpreadsheetApp.flush();
        result = { kind: 'west-ski-registration', nonce: nonce, registrationId: id, displayId: code, ok: true };
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

// Run this first to preview one sample receipt in your own Inbox and Sent mail.
// This does not register anyone or enable automatic emails.
function sendTestReceiptToMyself() {
  const email = Session.getEffectiveUser().getEmail();
  if (!email) throw new Error('Run this function from your own Apps Script editor.');
  sendRegistrationReceipt_({
    email: email, firstName: 'Henry', code: 'TEST', total: 135,
    people: [
      { firstName: 'Henry', lastName: 'Lumbard', type: 'Adult', price: 45 },
      { firstName: 'Elli', lastName: 'Lumbard', type: 'Student', price: 45 },
      { firstName: 'Jacob', lastName: 'Lumbard', type: 'Student', price: 45 }
    ]
  }, true);
}

// Run only after reviewing the test. Only new registrations are queued.
function enableRegistrationEmails() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Run this from the Apps Script attached to your registration sheet.');
  const sheet = getSheet_();
  const headers = sheet.getRange(1, 19, 1, RECEIPT_HEADERS.length).getValues()[0];
  headers.forEach((header, index) => {
    if (header && header !== RECEIPT_HEADERS[index]) throw new Error('Columns S–U are already in use.');
  });
  sheet.getRange(1, 19, 1, RECEIPT_HEADERS.length).setValues([RECEIPT_HEADERS])
    .setFontWeight('bold').setBackground('#0000a6').setFontColor('#ffffff');
  sheet.getRange('T2:T').setNumberFormat('m/d/yyyy h:mm AM/PM');
  if (!ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === 'sendPendingRegistrationReceipts')) {
    ScriptApp.newTrigger('sendPendingRegistrationReceipts').timeBased().everyMinutes(1).create();
  }
  PropertiesService.getScriptProperties().setProperties({
    REGISTRATION_EMAIL_SPREADSHEET_ID: spreadsheet.getId(),
    REGISTRATION_EMAILS_ENABLED: 'true'
  });
}

function disableRegistrationEmails() {
  PropertiesService.getScriptProperties().setProperty('REGISTRATION_EMAILS_ENABLED', 'false');
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sendPendingRegistrationReceipts') ScriptApp.deleteTrigger(trigger);
  });
}

// Email is sent by a separate trigger, keeping registration saving fast.
function sendPendingRegistrationReceipts() {
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('REGISTRATION_EMAILS_ENABLED') !== 'true') return;
  const sheet = SpreadsheetApp.openById(properties.getProperty('REGISTRATION_EMAIL_SPREADSHEET_ID')).getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return;
  const jobs = [];
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 21).getValues();
    const groups = new Map();
    rows.forEach(row => {
      if (!row[17]) return;
      if (!groups.has(row[17])) groups.set(row[17], []);
      groups.get(row[17]).push(row);
    });
    rows.forEach((row, index) => {
      if (row[18] !== 'Pending' || jobs.length >= 10) return;
      const people = groups.get(row[17]);
      if (!people) return;
      jobs.push({ row: index + 2, receipt: {
        email: String(row[4]), firstName: String(row[2]), code: String(row[1]),
        total: money_(people.reduce((sum, person) => sum + Number(person[13]), 0)),
        people: people.map(person => ({firstName: person[10], lastName: person[11], type: person[12], price: Number(person[13])}))
      }});
      // Do not resend automatically if execution stops after Gmail accepts it.
      sheet.getRange(index + 2, 19).setValue('Sending');
    });
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  jobs.forEach(job => {
    try {
      sendRegistrationReceipt_(job.receipt, false);
      sheet.getRange(job.row, 19, 1, 3).setValues([['Sent', new Date(), '']]);
    } catch (err) {
      sheet.getRange(job.row, 19, 1, 3).setValues([['Review needed', '', safe_(String(err.message || err).slice(0, 250))]]);
    }
  });
}

function sendRegistrationReceipt_(receipt, test) {
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(receipt.email)) throw new Error('The guardian email must be one valid email address.');
  const formatMoney = value => '$' + money_(value).toFixed(2);
  const note = 'WMS Ski Club ' + receipt.code;
  const url = 'https://venmo.com/u/Henry-Lumbard-1?txn=pay&amount=' + money_(receipt.total).toFixed(2) + '&note=' + encodeURIComponent(note);
  const lines = [
    ...(test ? ['TEST RECEIPT — Sample only. No registration was created and no payment is due.', ''] : []),
    'Hi ' + receipt.firstName + ',', '',
    'Thanks for registering for the West Middle School Ski Club! Your punch card registration has been recorded.', '',
    'Registration ID: ' + receipt.code, '', 'Punch cards:',
    ...receipt.people.map(person => '• ' + person.firstName + ' ' + person.lastName + ' — ' + person.type + ' — ' + formatMoney(person.price)), '',
    'Total due: ' + formatMoney(receipt.total), 'Payment status: Awaiting payment', '',
    'To pay, use the Venmo link below for @Henry-Lumbard-1. Please include “' + note + '” in your payment note so I can match your payment to your registration.', '',
    'Pay with Venmo: ' + url, '',
    'If you’ve already paid, thank you! This email confirms your registration; payments are marked paid separately after I confirm receipt.', '',
    'If you don’t use Venmo, reply to this email to arrange another way to pay. You can also reply with any questions or corrections.', '',
    'See you on the slopes!', '', 'Henry Lumbard', 'West Middle School Ski Club'
  ];
  const htmlBody = '<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#17243b;max-width:620px">' +
    lines.map(line => line.startsWith('Pay with Venmo: ')
      ? '<a href="' + escapeReceiptHtml_(url) + '" style="display:inline-block;background:#0000a6;color:white;padding:10px 18px;border-radius:6px;text-decoration:none">Pay with Venmo</a>'
      : escapeReceiptHtml_(line)).join('<br>') + '</div>';
  GmailApp.sendEmail(receipt.email,
    (test ? '[TEST] ' : '') + 'WMS Ski Club Registration Confirmation — ' + receipt.code,
    lines.join('\n'), {htmlBody: htmlBody, name: 'Henry Lumbard · WMS Ski Club'});
}

function escapeReceiptHtml_(value) {
  return String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

function getSettings_() {
  // Keep web app reads side-effect free. initializeSettings() handles setup and repairs.
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Attach this script to the Google Sheet first.');
  const sheet = spreadsheet.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) throw new Error('Settings tab is missing. Run initializeSettings().');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Settings tab is empty. Run initializeSettings().');
  const rows = sheet.getRange(1, 1, lastRow, 2).getValues();
  const headers = rows[0];
  if (String(headers[0] || '').trim() !== 'Setting' || String(headers[1] || '').trim() !== 'Value') {
    throw new Error('The Settings tab exists but has different headers. Contact the organizer before changing it.');
  }
  const map = {};
  rows.slice(1).forEach(row => {
    const key = String(row[0] || '').trim();
    if (key) map[key] = row[1];
  });

  return {
    registrationOpen: booleanSetting_(map['Registration Open'], false),
    cardPrices: {
      Student: numberSetting_(map['Student Punch Card Price'], 45),
      Adult: numberSetting_(map['Adult Punch Card Price'], 45)
    },
    liftTickets: {
      student: {
        price: numberSetting_(map['Student Lift Ticket Price'], 28),
        note: textSetting_(map['Student Lift Ticket Note'], 'Any day')
      },
      adultWeekday: {
        price: numberSetting_(map['Adult Weekday Lift Ticket Price'], 28),
        note: 'Weekdays and non-holidays'
      },
      adultWeekend: {
        price: numberSetting_(map['Adult Weekend/Holiday Lift Ticket Price'], 33),
        note: 'Weekends and holidays'
      }
    },
    rentalPrice: numberSetting_(map['Rental Price'], 26),
    snowboardRentalPrice: numberSetting_(map['Snowboard Rental Price'], 26),
    tubing: {
      included: booleanSetting_(map['Tubing Included'], true),
      sessions: numberSetting_(map['Free Tubing Sessions'], 3),
      hours: numberSetting_(map['Tubing Session Hours'], 2),
      value: numberSetting_(map['Tubing Value'], 60)
    },
    closedMessage: textSetting_(map['Closed Message'], 'Registration is closed while final pricing and details are being confirmed.')
  };
}

function ensureSettingsSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Attach this script to the Google Sheet first.');
  let sheet = spreadsheet.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SETTINGS_SHEET_NAME);

  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, 3).setValues([['Setting', 'Value', 'Description']]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#0000a6').setFontColor('#ffffff');
    sheet.setColumnWidth(1, 255);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 590);
  } else {
    const headers = sheet.getRange(1, 1, 1, 3).getValues()[0];
    if (String(headers[0]).trim() !== 'Setting' || String(headers[1]).trim() !== 'Value') {
      throw new Error('The Settings tab exists but has different headers. Contact the organizer before changing it.');
    }
    if (!String(headers[2] || '').trim()) sheet.getRange(1, 3).setValue('Description');
  }

  const existingValues = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    : [];
  const existing = new Set(existingValues.map(row => String(row[0] || '').trim()).filter(Boolean));

  DEFAULT_SETTINGS.forEach(setting => {
    if (existing.has(setting[0])) return;
    sheet.appendRow(setting);
    const row = sheet.getLastRow();
    if (setting[0] === 'Registration Open' || setting[0] === 'Tubing Included') {
      sheet.getRange(row, 2).insertCheckboxes();
      sheet.getRange(row, 2).setValue(setting[1]);
    }
    existing.add(setting[0]);
  });

  const lastRow = sheet.getLastRow();
  const allSettings = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 2).getValues() : [];
  const priceKeys = new Set([
    'Student Punch Card Price', 'Adult Punch Card Price', 'Student Lift Ticket Price',
    'Adult Weekday Lift Ticket Price', 'Adult Weekend/Holiday Lift Ticket Price',
    'Rental Price', 'Snowboard Rental Price', 'Tubing Value'
  ]);
  allSettings.forEach((row, index) => {
    if (priceKeys.has(String(row[0] || '').trim())) {
      sheet.getRange(index + 2, 2).setNumberFormat('$0.##');
    }
  });

  const openRow = allSettings.findIndex(row => String(row[0] || '').trim() === 'Registration Open') + 2;
  if (openRow >= 2) {
    const cell = sheet.getRange(openRow, 2);
    if (!cell.getDataValidation()) {
      const current = booleanSetting_(cell.getValue(), false);
      cell.insertCheckboxes();
      cell.setValue(current);
    }
  }
  return sheet;
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Attach this script to the Google Sheet first.');
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (!sheet.getLastRow()) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#0000a6').setFontColor('#ffffff');
    sheet.hideColumns(18);
  } else {
    const internalHeader = sheet.getRange(1, 18).getValue();
    if (internalHeader && internalHeader !== 'Submission Key') throw new Error('Column R is already in use. Contact the organizer.');
    if (!internalHeader) {
      sheet.getRange(1, 18).setValue('Submission Key').setFontWeight('bold').setBackground('#0000a6').setFontColor('#ffffff');
      sheet.hideColumns(18);
    }
  }
  return sheet;
}

function findRegistration_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const internal = sheet.getRange(2, 18, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  if (internal) return { displayId: String(sheet.getRange(internal.getRow(), 2).getValue()) };
  // Registrations from before short codes used the UUID in column B.
  const legacy = sheet.getRange(2, 2, last - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return legacy ? { displayId: id } : null;
}

function newCode_(sheet) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const last = sheet.getLastRow();
    if (last < 2 || !sheet.getRange(2, 2, last - 1, 1).createTextFinder(code).matchEntireCell(true).findNext()) return code;
  }
  throw new Error('Could not allocate a registration code. Please retry.');
}

function validate_(p, settings) {
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
  const expectedTotal = money_(p.people.reduce((sum, person) => {
    const price = settings.cardPrices[person.type];
    if (!Number.isFinite(price) || price < 0) throw new Error('Invalid card price in Settings.');
    return sum + price;
  }, 0));
  if (money_(Number(p.total)) !== expectedTotal) throw new Error('Card prices changed. Reload the page and check the new total.');
}

function numberSetting_(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? money_(number) : fallback;
}

function booleanSetting_(value, fallback) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const text = String(value || '').trim().toLowerCase();
  if (['true', 'yes', 'open', '1'].includes(text)) return true;
  if (['false', 'no', 'closed', '0', ''].includes(text)) return false;
  return fallback;
}

function textSetting_(value, fallback) {
  const text = String(value == null ? '' : value).trim();
  return text || fallback;
}

function money_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function required_(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Complete all required fields.');
}

function safe_(value) {
  const text = String(value).trim();
  // Prevent entered names or addresses being interpreted as spreadsheet formulas.
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}
