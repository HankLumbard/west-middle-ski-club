(() => {
  'use strict';
  const cfg = window.SKI_CLUB_CONFIG || {};
  const form = document.querySelector('#signupForm');
  const list = document.querySelector('#peopleList');
  const template = document.querySelector('#personTemplate');
  const error = document.querySelector('#errorNotice');
  const setup = document.querySelector('#setupNotice');
  const submitButton = document.querySelector('#submitButton');
  const price = Number(cfg.cardPrice) || 45;
  let nextPerson = 0;
  let pending = null;

  const scriptUrl = String(cfg.scriptUrl || '').trim();
  const validEndpoint = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(scriptUrl);
  if (!validEndpoint) { setup.hidden = false; submitButton.disabled = true; }

  function selectedCount() {
    const guardian = form.querySelector('[name="guardianCard"]:checked');
    return (guardian?.value === 'yes' ? 1 : 0) + [...list.querySelectorAll('.person-card')].filter(card => card.querySelector('[data-field="card"]:checked')?.value === 'yes').length;
  }

  function updateTotal() {
    const count = selectedCount();
    document.querySelector('#total').textContent = `$${count * price}`;
    document.querySelector('#cardCount').textContent = count ? `${count} ${count === 1 ? 'card' : 'cards'} × $${price}` : 'Select who needs a card';
  }

  function renumber() {
    [...list.querySelectorAll('.person-card')].forEach((card, i) => {
      card.querySelector('.person-number').textContent = i + 1;
      card.querySelector('.remove-button').setAttribute('aria-label', `Remove person ${i + 1}`);
      card.querySelector('legend').textContent = `Person ${i + 1}`;
    });
  }

  function addPerson() {
    const card = template.content.firstElementChild.cloneNode(true);
    const key = `person-${++nextPerson}`;
    card.querySelectorAll('[data-field]').forEach(field => {
      field.name = field.dataset.field === 'card' ? `${key}-card` : `${key}-${field.dataset.field}`;
    });
    card.querySelector('.remove-button').addEventListener('click', () => { card.remove(); renumber(); updateTotal(); });
    list.append(card); renumber(); updateTotal();
    card.querySelector('input').focus();
  }

  function showError(message) { error.textContent = message; error.hidden = false; error.focus(); }
  function clearError() { error.hidden = true; error.textContent = ''; }
  document.querySelector('#addPerson').addEventListener('click', addPerson);
  form.addEventListener('change', updateTotal);

  function getValues() {
    const data = new FormData(form);
    const text = key => String(data.get(key) || '').trim().replace(/\s+/g, ' ');
    const guardian = {
      firstName: text('firstName'), lastName: text('lastName'), email: text('email'), cell: text('cell'),
      street: text('street'), city: text('city'), state: text('state'), zip: text('zip')
    };
    const people = [];
    if (text('guardianCard') === 'yes') people.push({ firstName: guardian.firstName, lastName: guardian.lastName, type: 'Adult' });
    for (const card of list.querySelectorAll('.person-card')) {
      const firstName = card.querySelector('[data-field="firstName"]').value.trim();
      const lastName = card.querySelector('[data-field="lastName"]').value.trim();
      const type = card.querySelector('[data-field="type"]').value;
      if (card.querySelector('[data-field="card"]:checked')?.value === 'yes') people.push({ firstName, lastName, type });
    }
    return { guardian, people, total: people.length * price, registrationId: crypto.randomUUID() };
  }

  function postRegistration(payload) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.name = `signup-${crypto.randomUUID()}`;
      iframe.title = 'Registration confirmation';
      iframe.hidden = true;
      const postForm = document.createElement('form');
      postForm.method = 'POST'; postForm.action = scriptUrl; postForm.target = iframe.name; postForm.hidden = true;
      const input = document.createElement('input');
      input.type = 'hidden'; input.name = 'payload'; input.value = JSON.stringify(payload);
      postForm.append(input);
      const nonce = crypto.randomUUID();
      const nonceInput = document.createElement('input');
      nonceInput.type = 'hidden'; nonceInput.name = 'nonce'; nonceInput.value = nonce;
      postForm.append(nonceInput);
      let timer;
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', onMessage); iframe.remove(); postForm.remove(); };
      // HTML Service can send from a nested Google iframe, so verify origin and the one-time nonce instead of the immediate frame.
      const onMessage = event => {
        let host;
        try { host = new URL(event.origin).hostname; } catch { return; }
        if (!(host === 'script.google.com' || host.endsWith('.googleusercontent.com'))) return;
        const msg = event.data;
        if (msg?.kind !== 'west-ski-registration' || msg.nonce !== nonce || msg.registrationId !== payload.registrationId) return;
        cleanup();
        if (msg.ok) resolve(msg); else { const failure = new Error(msg.error || 'The registration could not be saved.'); failure.confirmed = true; reject(failure); }
      };
      document.body.append(iframe, postForm);
      window.addEventListener('message', onMessage);
      timer = setTimeout(() => { cleanup(); reject(new Error('We could not confirm the registration. Please retry the same registration, or contact the organizer before paying.')); }, 40000);
      postForm.submit();
    });
  }

  function venmoUrl(payload) {
    const note = `West Middle Ski Club ${payload.registrationId}`;
    const recipient = encodeURIComponent(cfg.venmoUsername || 'Henry-Lumbard-1');
    return `https://venmo.com/u/${recipient}?txn=pay&amount=${payload.total.toFixed(2)}&note=${encodeURIComponent(note)}`;
  }

  function showSuccess(payload) {
    form.hidden = true; clearError();
    const success = document.querySelector('#success');
    document.querySelector('#successSummary').textContent = `${payload.people.length} ${payload.people.length === 1 ? 'punch card' : 'punch cards'} registered for ${payload.guardian.firstName} ${payload.guardian.lastName}.`;
    document.querySelector('#receiptId').textContent = payload.registrationId;
    document.querySelector('#receiptTotal').textContent = `$${payload.total.toFixed(2)}`;
    document.querySelector('#venmoLink').href = venmoUrl(payload);
    success.hidden = false; success.focus();
    try { sessionStorage.setItem('west-ski-last-registration', JSON.stringify({ id: payload.registrationId, total: payload.total })); } catch {}
  }

  form.addEventListener('submit', async event => {
    event.preventDefault(); clearError();
    if (!validEndpoint) return;
    if (!pending) {
      if (!form.reportValidity()) return;
      if (!selectedCount()) { showError('Select Yes for at least one punch card.'); return; }
      pending = getValues();
    }
    submitButton.disabled = true;
    submitButton.firstChild.textContent = 'Saving registration… ';
    try { await postRegistration(pending); showSuccess(pending); pending = null; }
    catch (err) {
      if (err.confirmed) {
        pending = null;
        showError(`${err.message} Please correct the form and try again.`);
      } else {
        showError(`${err.message} Your registration ID is ${pending.registrationId}. Retrying will use the same ID to prevent a duplicate.`);
        form.querySelectorAll('input,select,button').forEach(el => { if (el !== submitButton) el.disabled = true; });
      }
      submitButton.disabled = false;
      submitButton.firstChild.textContent = pending ? 'Retry registration ' : 'Register & continue to payment ';
    }
  });
  updateTotal();
})();
