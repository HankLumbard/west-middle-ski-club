(() => {
  'use strict';
  const cfg = window.SKI_CLUB_CONFIG || {};
  const form = document.querySelector('#signupForm');
  const list = document.querySelector('#peopleList');
  const template = document.querySelector('#personTemplate');
  const error = document.querySelector('#errorNotice');
  const setup = document.querySelector('#setupNotice');
  const closedNotice = document.querySelector('#closedNotice');
  const pricingPanel = document.querySelector('.side-column');
  const submitButton = document.querySelector('#submitButton');
  const scriptUrl = String(cfg.scriptUrl || '').trim();
  const validEndpoint = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(scriptUrl);
  const defaultSettings = {
    registrationOpen: false,
    closedMessage: 'Registration is closed while final pricing and details are being confirmed.',
    cardPrices: { Student: 45, Adult: 45 },
    liftTickets: {
      student: { price: 28, note: 'Any day' },
      adultWeekday: { price: 28, note: 'Weekdays and non-holidays' },
      adultWeekend: { price: 33, note: 'Weekends and holidays' }
    },
    rentalPrice: 26,
    tubing: { included: true, sessions: 3, hours: 2, value: 60 }
  };
  let settings = defaultSettings;
  let settingsLoaded = false;
  let nextPerson = 0;
  let pending = null;

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function formatMoney(value) {
    return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function normalizeSettings(raw) {
    const cards = raw.cardPrices || {};
    const lifts = raw.liftTickets || {};
    const tubing = raw.tubing || {};
    const studentLift = lifts.student || {};
    const adultWeekday = lifts.adultWeekday || {};
    const adultWeekend = lifts.adultWeekend || {};
    return {
      registrationOpen: raw.registrationOpen === true,
      closedMessage: typeof raw.closedMessage === 'string' && raw.closedMessage.trim()
        ? raw.closedMessage.trim()
        : defaultSettings.closedMessage,
      cardPrices: {
        Student: numberOr(cards.Student, defaultSettings.cardPrices.Student),
        Adult: numberOr(cards.Adult, defaultSettings.cardPrices.Adult)
      },
      liftTickets: {
        student: {
          price: numberOr(studentLift.price, defaultSettings.liftTickets.student.price),
          note: typeof studentLift.note === 'string' && studentLift.note.trim()
            ? studentLift.note.trim()
            : defaultSettings.liftTickets.student.note
        },
        adultWeekday: {
          price: numberOr(adultWeekday.price, defaultSettings.liftTickets.adultWeekday.price),
          note: defaultSettings.liftTickets.adultWeekday.note
        },
        adultWeekend: {
          price: numberOr(adultWeekend.price, defaultSettings.liftTickets.adultWeekend.price),
          note: defaultSettings.liftTickets.adultWeekend.note
        }
      },
      rentalPrice: numberOr(raw.rentalPrice, defaultSettings.rentalPrice),
      tubing: {
        included: tubing.included !== false,
        sessions: numberOr(tubing.sessions, defaultSettings.tubing.sessions),
        hours: numberOr(tubing.hours, defaultSettings.tubing.hours),
        value: numberOr(tubing.value, defaultSettings.tubing.value)
      }
    };
  }

  function setRegistrationStatus(isOpen, message) {
    const pageTitle = document.querySelector('#pageTitle');
    const pageIntro = document.querySelector('#pageIntro');
    form.hidden = !isOpen;
    pricingPanel.hidden = !isOpen;
    closedNotice.hidden = isOpen;
    submitButton.disabled = !validEndpoint || !isOpen;
    if (isOpen) {
      pageTitle.textContent = 'Get your punch cards.';
      pageIntro.textContent = 'Enter your contact information and choose who needs a card. You’ll pay by Venmo after the registration is recorded.';
    } else {
      pageTitle.textContent = 'Registration is closed';
      pageIntro.textContent = 'We’re confirming final pricing and details. Please check back soon.';
      closedNotice.textContent = message || settings.closedMessage || defaultSettings.closedMessage;
    }
  }

  function updatePricingDisplay() {
    document.querySelector('#headerPrices').textContent =
      'Student ' + formatMoney(settings.cardPrices.Student) + ' · Adult ' + formatMoney(settings.cardPrices.Adult);
    document.querySelector('#studentCardPrice').textContent = formatMoney(settings.cardPrices.Student);
    document.querySelector('#adultCardPrice').textContent = formatMoney(settings.cardPrices.Adult);
    document.querySelector('#studentLiftPrice').textContent = formatMoney(settings.liftTickets.student.price);
    document.querySelector('#studentLiftNote').textContent = settings.liftTickets.student.note;
    document.querySelector('#adultWeekdayLiftPrice').textContent = formatMoney(settings.liftTickets.adultWeekday.price);
    document.querySelector('#adultWeekendLiftPrice').textContent = formatMoney(settings.liftTickets.adultWeekend.price);
    document.querySelector('#rentalPrice').textContent = formatMoney(settings.rentalPrice);
    document.querySelector('#tubingStatus').textContent = settings.tubing.included ? 'Included' : 'Not included';
    if (settings.tubing.included) {
      document.querySelector('#tubingDetails').textContent =
        settings.tubing.sessions + ' free ' + settings.tubing.hours + '-hour sessions per card · ' +
        formatMoney(settings.tubing.value) + ' value';
      document.querySelector('#discountFoot').textContent =
        'The punch card includes the tubing sessions. Lift tickets and rentals are paid for separately at the rates shown.';
    } else {
      document.querySelector('#tubingDetails').textContent = 'Tubing is paid for separately.';
      document.querySelector('#discountFoot').textContent =
        'Lift tickets, rentals, and tubing are paid for separately at the rates shown.';
    }
  }

  function selectedCardTypes() {
    const types = [];
    const guardian = form.querySelector('[name="guardianCard"]:checked');
    if (guardian && guardian.value === 'yes') types.push('Adult');
    list.querySelectorAll('.person-card').forEach(card => {
      types.push(card.querySelector('[data-field="type"]').value);
    });
    return types;
  }

  function updateTotal() {
    const counts = { Student: 0, Adult: 0 };
    selectedCardTypes().forEach(type => { counts[type] = (counts[type] || 0) + 1; });
    const total = counts.Student * settings.cardPrices.Student + counts.Adult * settings.cardPrices.Adult;
    document.querySelector('#total').textContent = formatMoney(total);
    const summary = [];
    if (counts.Student) summary.push(counts.Student + ' student ' + (counts.Student === 1 ? 'card' : 'cards') + ' × ' + formatMoney(settings.cardPrices.Student));
    if (counts.Adult) summary.push(counts.Adult + ' adult ' + (counts.Adult === 1 ? 'card' : 'cards') + ' × ' + formatMoney(settings.cardPrices.Adult));
    document.querySelector('#cardCount').textContent =
      summary.length ? summary.join(' · ') : 'Add a person or choose a card for the parent or guardian';
  }

  function renumber() {
    [...list.querySelectorAll('.person-card')].forEach((card, index) => {
      card.querySelector('.person-number').textContent = index + 1;
      card.querySelector('.remove-button').setAttribute('aria-label', 'Remove person ' + (index + 1));
      card.querySelector('legend').textContent = 'Person ' + (index + 1);
    });
  }

  function addPerson() {
    const card = template.content.firstElementChild.cloneNode(true);
    const key = 'person-' + (++nextPerson);
    card.querySelectorAll('[data-field]').forEach(field => {
      field.name = key + '-' + field.dataset.field;
    });
    card.querySelector('.remove-button').addEventListener('click', () => {
      card.remove();
      renumber();
      updateTotal();
    });
    list.append(card);
    renumber();
    updateTotal();
    card.querySelector('input').focus();
  }

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
    error.focus();
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
  }

  function fetchSettings() {
    if (!validEndpoint) {
      setup.hidden = false;
      setup.textContent = 'The registration settings are not connected. Signups remain closed.';
      setRegistrationStatus(false, defaultSettings.closedMessage);
      return;
    }

    const callbackName = 'skiSettings_' + crypto.randomUUID().replaceAll('-', '');
    const settingsScript = document.createElement('script');
    let timer;
    let finished = false;

    function finish(response) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      delete window[callbackName];
      settingsScript.remove();
      if (response && response.ok === true && response.settings && typeof response.settings === 'object') {
        settings = normalizeSettings(response.settings);
        settingsLoaded = true;
        setup.hidden = true;
        updatePricingDisplay();
        updateTotal();
        setRegistrationStatus(settings.registrationOpen, settings.closedMessage);
      } else {
        setup.hidden = false;
        setup.textContent = 'Update the Apps Script to load the Settings tab. Signups remain closed until then.';
        setRegistrationStatus(false, 'Registration is closed until the Google Sheet settings are available.');
      }
    }

    window[callbackName] = finish;
    settingsScript.onerror = () => finish(null);
    timer = setTimeout(() => finish(null), 8000);
    settingsScript.src = scriptUrl + '?action=settings&callback=' + callbackName + '&t=' + Date.now();
    document.head.append(settingsScript);
  }

  document.querySelector('#addPerson').addEventListener('click', addPerson);
  form.addEventListener('change', updateTotal);

  function getValues() {
    const data = new FormData(form);
    const text = key => String(data.get(key) || '').trim().replace(/\s+/g, ' ');
    const guardian = {
      firstName: text('firstName'),
      lastName: text('lastName'),
      email: text('email'),
      cell: text('cell'),
      street: text('street'),
      city: text('city'),
      state: text('state'),
      zip: text('zip')
    };
    const people = [];
    if (text('guardianCard') === 'yes') {
      people.push({ firstName: guardian.firstName, lastName: guardian.lastName, type: 'Adult' });
    }
    list.querySelectorAll('.person-card').forEach(card => {
      people.push({
        firstName: card.querySelector('[data-field="firstName"]').value.trim(),
        lastName: card.querySelector('[data-field="lastName"]').value.trim(),
        type: card.querySelector('[data-field="type"]').value
      });
    });
    const total = people.reduce((sum, person) => sum + settings.cardPrices[person.type], 0);
    return {
      guardian,
      people,
      total: Math.round((total + Number.EPSILON) * 100) / 100,
      registrationId: crypto.randomUUID()
    };
  }

  function postRegistration(payload) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.name = 'signup-' + crypto.randomUUID();
      iframe.title = 'Registration confirmation';
      iframe.hidden = true;
      const postForm = document.createElement('form');
      postForm.method = 'POST';
      postForm.action = scriptUrl;
      postForm.target = iframe.name;
      postForm.hidden = true;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = JSON.stringify(payload);
      postForm.append(input);
      const nonce = crypto.randomUUID();
      const nonceInput = document.createElement('input');
      nonceInput.type = 'hidden';
      nonceInput.name = 'nonce';
      nonceInput.value = nonce;
      postForm.append(nonceInput);
      let timer, pollTimer, statusTimeout, statusScript, callbackName;
      let settled = false;

      const cleanupStatus = () => {
        clearTimeout(statusTimeout);
        if (callbackName) {
          delete window[callbackName];
          callbackName = null;
        }
        statusScript?.remove();
        statusScript = null;
      };
      const cleanup = () => {
        clearTimeout(timer);
        clearTimeout(pollTimer);
        cleanupStatus();
        window.removeEventListener('message', onMessage);
        iframe.remove();
        postForm.remove();
      };
      const finish = (ok, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (ok) resolve(value);
        else reject(value);
      };
      const schedulePoll = () => {
        cleanupStatus();
        if (!settled) pollTimer = setTimeout(pollForSave, 1800);
      };
      const pollForSave = () => {
        if (settled) return;
        callbackName = 'skiStatus_' + crypto.randomUUID().replaceAll('-', '');
        const name = callbackName;
        statusScript = document.createElement('script');
        window[name] = response => {
          if (response?.registrationId === payload.registrationId && response.ok === true) finish(true, response);
          else schedulePoll();
        };
        statusScript.onerror = schedulePoll;
        statusTimeout = setTimeout(schedulePoll, 7000);
        statusScript.src = scriptUrl + '?action=status&id=' + encodeURIComponent(payload.registrationId) +
          '&callback=' + name + '&t=' + Date.now();
        document.head.append(statusScript);
      };
      const onMessage = event => {
        let host;
        try { host = new URL(event.origin).hostname; } catch { return; }
        if (!(host === 'script.google.com' || host.endsWith('.googleusercontent.com'))) return;
        const msg = event.data;
        if (msg?.kind !== 'west-ski-registration' || msg.nonce !== nonce || msg.registrationId !== payload.registrationId) return;
        if (msg.ok) finish(true, msg);
        else {
          const failure = new Error(msg.error || 'The registration could not be saved.');
          failure.confirmed = true;
          finish(false, failure);
        }
      };

      document.body.append(iframe, postForm);
      window.addEventListener('message', onMessage);
      timer = setTimeout(() => finish(false, new Error('We could not confirm the registration. Please retry the same registration, or contact the organizer before paying.')), 40000);
      postForm.submit();
      pollTimer = setTimeout(pollForSave, 1300);
    });
  }

  function venmoUrl(payload, displayId) {
    const note = 'West Middle Ski Club ' + displayId;
    const recipient = encodeURIComponent(cfg.venmoUsername || 'Henry-Lumbard-1');
    return 'https://venmo.com/u/' + recipient + '?txn=pay&amount=' + payload.total.toFixed(2) + '&note=' + encodeURIComponent(note);
  }

  function showSuccess(payload, confirmation) {
    const displayId = confirmation?.displayId || payload.registrationId;
    form.hidden = true;
    closedNotice.hidden = true;
    clearError();
    const success = document.querySelector('#success');
    document.querySelector('#successSummary').textContent =
      payload.people.length + ' ' + (payload.people.length === 1 ? 'punch card' : 'punch cards') +
      ' registered for ' + payload.guardian.firstName + ' ' + payload.guardian.lastName + '.';
    document.querySelector('#receiptId').textContent = displayId;
    document.querySelector('#receiptTotal').textContent = formatMoney(payload.total);
    document.querySelector('#receiptNote').textContent = 'West Middle Ski Club ' + displayId;
    document.querySelector('#venmoLink').href = venmoUrl(payload, displayId);
    success.hidden = false;
    success.focus();
    try { sessionStorage.setItem('west-ski-last-registration', JSON.stringify({ id: displayId, total: payload.total })); } catch {}
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearError();
    if (!validEndpoint || !settingsLoaded || !settings.registrationOpen) return;
    if (!pending) {
      if (!form.reportValidity()) return;
      if (!selectedCardTypes().length) {
        showError('Add at least one cardholder or select a card for the parent or guardian.');
        return;
      }
      pending = getValues();
    }
    submitButton.disabled = true;
    submitButton.firstChild.textContent = 'Saving registration… ';
    try {
      const confirmation = await postRegistration(pending);
      showSuccess(pending, confirmation);
      pending = null;
    } catch (err) {
      if (err.confirmed) {
        pending = null;
        showError(err.message + ' Please correct the form and try again.');
      } else {
        showError(err.message + ' Retrying will use the same submission to prevent a duplicate.');
        form.querySelectorAll('input,select,button').forEach(element => {
          if (element !== submitButton) element.disabled = true;
        });
      }
      submitButton.disabled = false;
      submitButton.firstChild.textContent = pending ? 'Retry registration ' : 'Register & continue to payment ';
    }
  });

  document.querySelector('#copyNote').addEventListener('click', async event => {
    const button = event.currentTarget;
    const note = document.querySelector('#receiptNote').textContent;
    try {
      await navigator.clipboard.writeText(note);
      button.textContent = 'Note copied';
    } catch {
      button.textContent = 'Select the note above to copy';
    }
  });

  updatePricingDisplay();
  updateTotal();
  setRegistrationStatus(false, defaultSettings.closedMessage);
  fetchSettings();
})();
