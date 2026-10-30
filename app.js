const SLOT_COUNT = 33;
const STORAGE_KEY = 'loadflow-plan-v1';
const blankSlots = () => Array.from({ length: SLOT_COUNT }, () => ({ code: '', weight: '' }));
let state = loadState();
let activeSlot = -1;
let toastTimer;

const $ = (id) => document.getElementById(id);
const slotDialog = $('slot-dialog');
const transferDialog = $('transfer-dialog');

function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (value && Array.isArray(value.slots) && value.slots.length === SLOT_COUNT) return value;
  } catch (_) { /* ignore invalid browser storage */ }
  return { transfer: '', slots: blankSlots(), updated: '' };
}

function saveState() {
  state.updated = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function slotMarkup(slot, index, printable = false) {
  const number = String(index + 1).padStart(2, '0');
  if (printable) {
    return `<div class="print-slot ${slot.code ? 'loaded' : ''}"><b>PLATZ ${number}</b>${slot.code ? `<strong>${escapeHtml(slot.code)}</strong><span>${formatWeight(slot.weight)} kg</span>` : '<span>Frei</span>'}</div>`;
  }
  return `<div class="slot ${slot.code ? 'loaded' : ''}" role="button" tabindex="0" data-slot="${index}" title="${slot.code ? escapeHtml(slot.code) : `Ladeplatz ${number}`}" aria-label="Platz ${number}${slot.code ? `, Sendung ${escapeHtml(slot.code)}, ${formatWeight(slot.weight)} Kilogramm` : ', frei'}"><span class="slot-number">${number}</span>${slot.code ? `<span class="slot-code">${escapeHtml(slot.code)}</span><span class="slot-state">${formatWeight(slot.weight)} kg</span><button class="slot-remove" type="button" data-remove="${index}" aria-label="Eintrag auf Platz ${number} löschen" title="Eintrag löschen">×</button>` : '<span class="slot-state">Frei</span>'}</div>`;
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
  activeSlot = index;
  const slot = state.slots[index];
  $('modal-position').textContent = `LADEPLATZ ${String(index + 1).padStart(2, '0')}`;
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
    state.slots[index] = { code: '', weight: '' };
    saveState();
    showToast(`Eintrag auf Platz ${String(index + 1).padStart(2, '0')} gelöscht`);
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

$('slot-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (activeSlot < 0) return;
  const code = $('barcode-input').value.trim();
  const weight = $('weight-input').value.replace(',', '.');
  if (!code) {
    $('barcode-input').focus();
    return;
  }
  state.slots[activeSlot] = { code, weight: weight === '' ? '' : String(Number(weight).toFixed(1)) };
  const savedIndex = activeSlot;
  saveState();
  closeDialog(slotDialog);
  const nextIndex = (savedIndex + 1) % SLOT_COUNT;
  showToast(`Platz ${String(savedIndex + 1).padStart(2, '0')} gespeichert`);
  openSlot(nextIndex);
});

$('barcode-input').addEventListener('input', updateBarcodeCount);

slotDialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  const code = $('barcode-input').value.trim();
  const weight = $('weight-input').value.replace(',', '.');
  if (code) state.slots[activeSlot] = { code, weight: weight === '' ? '' : String(Number(weight).toFixed(1)) };
  const nextIndex = (activeSlot + 1) % SLOT_COUNT;
  saveState();
  closeDialog(slotDialog);
  openSlot(nextIndex);
});

document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => {
  closeDialog(slotDialog);
  closeDialog(transferDialog);
}));

function openTransferDialog() {
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
  const isNew = transfer !== state.transfer;
  state.transfer = transfer;
  // A new transfer starts with an empty vehicle; editing the current transfer keeps its entries.
  if ($('transfer-form').dataset.new === 'yes') state.slots = blankSlots();
  $('transfer-form').dataset.new = 'no';
  saveState();
  closeDialog(transferDialog);
  showToast(isNew ? 'Neuer Ladeplan wurde angelegt' : 'Transfernummer aktualisiert');
});
$('new-transfer').addEventListener('click', () => { $('transfer-form').dataset.new = 'yes'; });
$('edit-transfer').addEventListener('click', () => { $('transfer-form').dataset.new = 'no'; });

$('print-plan').addEventListener('click', () => {
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
