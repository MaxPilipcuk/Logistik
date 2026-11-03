const SLOT_COUNT = 33;
const blankSlots = () => Array.from({ length: SLOT_COUNT }, () => ({ code: '', weight: '', version: 0 }));
let state = { transfer: '', slots: blankSlots(), updated: '', revision: -1 };
let activeSlot = -1;
let activeVersion, activeGeneration, transferRevision;
let toastTimer, busy = false, online = false, polling = false;
const $ = (id) => document.getElementById(id);
const slotDialog = $('slot-dialog');
const transferDialog = $('transfer-dialog');

function connection(ok) {
  online = ok;
  $('connection-status').textContent = ok ? 'SYNCHRON' : 'KEINE VERBINDUNG';
  document.querySelector('.live-indicator').classList.toggle('offline', !ok);
}
function acceptPlan(plan) {
  if (plan.revision > state.revision) { state = plan; render(); }
}
async function api(path, data) {
  let response;
  try {
    response = await fetch(new URL(`api/${path}`, document.baseURI), {
      method: data ? 'POST' : 'GET', cache: 'no-store',
      headers: data ? { 'Content-Type': 'application/json' } : {},
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    const result = await response.json();
    connection(true);
    if (!response.ok) {
      if (result.plan) acceptPlan(result.plan);
      if (response.status >= 500) connection(false);
      throw new Error(result.error || 'Anfrage fehlgeschlagen.');
    }
    return result;
  } catch (error) {
    if (!response || error instanceof SyntaxError) {
      connection(false);
      throw new Error('Keine Serververbindung. Eingabe ist nicht bestätigt gespeichert. Bitte Verbindung prüfen und erneut versuchen.');
    }
    throw error;
  }
}
async function syncPlan() {
  acceptPlan(await api('plan'));
}
async function poll() {
  if (polling || busy) return;
  polling = true;
  try { await syncPlan(); } catch (_) { /* status remains visible */ }
  finally { polling = false; }
}
async function mutate(path, data, success) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('dialog button, dialog input').forEach(el => el.disabled = true);
  try {
    acceptPlan(await api(path, data));
    success();
  } catch (error) { window.alert(error.message); }
  finally {
    busy = false;
    document.querySelectorAll('dialog button, dialog input').forEach(el => el.disabled = false);
  }
}

function slotPosition(index) {
  return { row: Math.floor(index / 3) + 1, side: ['Links', 'Mitte', 'Rechts'][index % 3], gridRow: 3 - (index % 3) };
}

function slotMarkup(slot, index, printable = false) {
  const position = slotPosition(index);
  const location = `Reihe ${position.row} · ${position.side}`;
  const placement = `grid-column:${position.row};grid-row:${position.gridRow}`;
  const number = String(index + 1).padStart(2, '0');
  if (printable) {
    return `<div class="print-slot ${slot.code ? 'loaded' : ''}" style="${placement}"><b>PLATZ ${number}</b><small class="print-location">${location}</small>${slot.code ? `<strong>${escapeHtml(slot.code)}</strong><span>${formatWeight(slot.weight)} kg</span>` : '<span>Frei</span>'}</div>`;
  }
  return `<div class="slot ${slot.code ? 'loaded' : ''}" role="button" tabindex="0" style="${placement}" data-slot="${index}" title="${slot.code ? escapeHtml(slot.code) : `Ladeplatz ${number}`}" aria-label="Platz ${number}, ${location}${slot.code ? `, Sendung ${escapeHtml(slot.code)}, ${formatWeight(slot.weight)} Kilogramm` : ', frei'}"><span class="slot-number">${number}</span><span class="slot-location">${location}</span>${slot.code ? `<span class="slot-code">${escapeHtml(slot.code)}</span><span class="slot-state">${formatWeight(slot.weight)} kg</span><button class="slot-remove" type="button" data-remove="${index}" aria-label="Eintrag auf Platz ${number} löschen" title="Eintrag löschen">×</button>` : '<span class="slot-state">Frei</span>'}</div>`;
}

function render() {
  $('slot-grid').innerHTML = state.slots.map((slot, index) => slotMarkup(slot, index)).join('');
  $('print-slots').innerHTML = state.slots.map((slot, index) => slotMarkup(slot, index, true)).join('');
  const occupied = state.slots.filter((slot) => slot.code.trim()).length;
  const weight = state.slots.reduce((sum, slot) => sum + (Number(String(slot.weight).replace(',', '.')) || 0), 0);
  $('occupied-count').textContent = occupied;
  $('progress-fill').style.width = `${(occupied / SLOT_COUNT) * 100}%`;
  $('total-weight').innerHTML = `${formatWeight(weight)} <small>kg</small>`;
  $('transfer-value').textContent = state.transfer || 'Noch keine Transfernummer';
  $('summary-transfer').textContent = state.transfer || '—';
  $('last-change').textContent = state.updated ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(state.updated)) : '—';
  $('print-transfer').textContent = `Transfernummer: ${state.transfer || '—'}`;
  $('print-count').textContent = `${occupied} / 33 Plätze belegt`;
  $('print-weight').textContent = `Gesamtgewicht: ${formatWeight(weight)} kg`;
}

function formatWeight(value) {
  const number = Number(String(value || 0).replace(',', '.')) || 0;
  return number.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function openSlot(index) {
  if (busy || !online) { showToast('Bitte Serververbindung abwarten.'); return; }
  activeSlot = index;
  activeVersion = state.slots[index].version;
  activeGeneration = state.generation;
  const slot = state.slots[index];
  $('modal-position').textContent = `PLATZ ${String(index + 1).padStart(2, '0')}`;
  const position = slotPosition(index);
  $('modal-location').textContent = `Reihe ${position.row} · ${position.side}`;
  $('barcode-input').value = slot.code;
  updateBarcodeCount();
  $('weight-input').value = slot.weight;
  slotDialog.showModal();
  setTimeout(() => $('barcode-input').focus(), 80);
}

function updateBarcodeCount() {
  $('barcode-count').textContent = `${$('barcode-input').value.length} / 20`;
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

$('slot-grid').addEventListener('click', (event) => {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    event.stopPropagation();
    const index = Number(remove.dataset.remove);
    mutate(`slots/${index}`, { code: '', weight: '', version: state.slots[index].version, generation: state.generation }, () => {
      showToast(`Eintrag auf Platz ${String(index + 1).padStart(2, '0')} gelöscht`);
    });
    return;
  }
  const slot = event.target.closest('[data-slot]');
  if (slot) openSlot(Number(slot.dataset.slot));
});
$('slot-grid').addEventListener('keydown', (event) => {
  if (event.target.matches('[data-slot]') && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    openSlot(Number(event.target.dataset.slot));
  }
});

async function saveSlotAndNext(allowEmpty = false, advance = true) {
  if (busy || activeSlot < 0) return;
  const code = $('barcode-input').value.trim();
  const weight = $('weight-input').value.replace(',', '.');
  if (!code && allowEmpty && !weight) {
    closeDialog(slotDialog);
    openSlot((activeSlot + 1) % SLOT_COUNT);
    return;
  }
  if (code.length !== 20) { showToast('Die Sendungsnummer muss genau 20 Zeichen enthalten.'); return; }
  if (!$('weight-input').reportValidity()) return;
  const savedIndex = activeSlot;
  await mutate(`slots/${savedIndex}`, { code, weight, version: activeVersion, generation: activeGeneration }, () => {
    closeDialog(slotDialog);
    showToast(`Platz ${String(savedIndex + 1).padStart(2, '0')} gespeichert`);
  });
  if (advance && !slotDialog.open) openSlot((savedIndex + 1) % SLOT_COUNT);
}
$('slot-form').addEventListener('submit', (event) => {
  event.preventDefault();
  saveSlotAndNext();
});
$('save-slot-close').addEventListener('click', () => saveSlotAndNext(false, false));
$('barcode-input').addEventListener('input', updateBarcodeCount);
slotDialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  saveSlotAndNext(true);
});
[slotDialog, transferDialog].forEach(dialog => dialog.addEventListener('cancel', event => {
  if (busy) event.preventDefault();
}));

document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
  closeDialog(slotDialog);
  closeDialog(transferDialog);
}));

function openTransferDialog() {
  if (busy || !online) { showToast('Bitte Serververbindung abwarten.'); return; }
  transferRevision = state.revision;
  $('transfer-input').value = state.transfer;
  transferDialog.showModal();
  setTimeout(() => $('transfer-input').focus(), 80);
}

$('new-transfer').addEventListener('click', openTransferDialog);
$('edit-transfer').addEventListener('click', openTransferDialog);
$('transfer-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const transfer = $('transfer-input').value.trim();
  if (!transfer) return;
  const reset = $('transfer-form').dataset.new === 'yes';
  if (reset && state.slots.some(slot => slot.code) && !window.confirm('Neuen Ladeplan starten und alle 33 Plätze für alle Rechner leeren?')) return;
  mutate('transfer', { transfer, reset, revision: transferRevision }, () => {
    closeDialog(transferDialog);
    showToast(reset ? 'Neuer Ladeplan wurde angelegt' : 'Transfernummer aktualisiert');
  });
});
$('new-transfer').addEventListener('click', () => { $('transfer-form').dataset.new = 'yes'; });
$('edit-transfer').addEventListener('click', () => { $('transfer-form').dataset.new = 'no'; });

$('print-plan').addEventListener('click', async () => {
  if (busy) return;
  try { await syncPlan(); } catch (error) { window.alert(error.message); return; }
  $('print-date').textContent = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  render();
  window.print();
});

document.addEventListener('keydown', (event) => {
  if (slotDialog.open || transferDialog.open) return;
  if (/^[1-9]$/.test(event.key) && document.activeElement === document.body) openSlot(Number(event.key) - 1);
});

$('today').textContent = new Intl.DateTimeFormat('de-DE', { dateStyle: 'full' }).format(new Date());
render();

const viewButtons = document.querySelectorAll('[data-truck-view]');
function setTruckView(view) {
  const selected = view === 'top' ? 'top' : 'side';
  $('truck-stage').dataset.view = selected;
  viewButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.truckView === selected)));
  try { localStorage.setItem('loadflow-view', selected); } catch (_) {}
}
viewButtons.forEach(button => button.addEventListener('click', () => setTruckView(button.dataset.truckView)));
let savedTruckView = 'side';
try { savedTruckView = localStorage.getItem('loadflow-view') || 'side'; } catch (_) {}
setTruckView(savedTruckView);


connection(false);
poll();
setInterval(poll, 2000);
window.addEventListener('online', poll);
window.addEventListener('offline', () => connection(false));
