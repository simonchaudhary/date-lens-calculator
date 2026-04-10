/**
 * panel/selections.js
 *
 * OWNS:
 *   - addSelection() — creates a selection object, assigns a letter label,
 *     renders it, switches to the Selections tab, shows a toast
 *   - assignLetterLabel() — assigns the next available A–Z letter
 *   - renderSelections() — rebuilds the selection card list in the DOM
 *   - createSelectionCard() — builds a single card with value chips and actions
 *   - addCalcValue() / removeCalcValue() / renderCalcValues() — manages
 *     the set of values currently loaded into the calculator
 *   - parseManualInput() — parses comma/space/tab/newline-separated number strings
 *   - Manual input button and clear-selections button wiring
 *
 * DOES NOT TOUCH: History, snapshots, paste mode, or formula evaluation.
 *
 * TIGHT COUPLING (documented, not fixable without a larger refactor):
 *   calculatorValues entries hold { sourceId, idx } references into selections.
 *   Deleting a value at index idx from a selection must decrement idx for all
 *   calculatorValues that reference the same selection at a higher index.
 *   This cross-state mutation is in the delete-value handler below.
 *
 * EXPORTS used by calculator.js: addCalcValue, removeCalcValue, renderCalcValues,
 *   renderSelections (called after calculator clears values).
 * EXPORTS used by paste.js: addSelection, assignLetterLabel, renderSelections.
 * EXPORTS used by index.js: addSelection, renderSelections, updateFormulaRefs (re-exported from calculator.js).
 */

import { state } from './state.js';
import { generateId, formatTime, renderCardMeta } from './utils.js';
import { showToast } from './toast.js';
import { switchToTab } from './tabs.js';

// DOM refs
const selectionsCountBadge = document.getElementById('selections-count');
const selectionsHeader     = document.getElementById('selections-header');
const selectionsEmpty      = document.getElementById('selections-empty');
const selectionsList       = document.getElementById('selections-list');
const calcValuesDisplay    = document.getElementById('calc-values-display');
const manualValuesInput    = document.getElementById('manual-values-input');
const btnAddManual         = document.getElementById('btn-add-manual');
const btnClearSelections   = document.getElementById('btn-clear-selections');
const btnClearCalc         = document.getElementById('btn-clear-calc');
const calcResult           = document.getElementById('calc-result');

// updateFormulaRefs is set by calculator.js after it imports this module
// to break the circular dependency (selections.js → calculator.js → selections.js).
let _updateFormulaRefs = () => {};
export function setFormulaRefUpdater(fn) { _updateFormulaRefs = fn; }

// ─── Letter Assignment ───────────────────────────────────────────────────────

export function assignLetterLabel(id) {
  const usedLetters = Object.values(state.selectionLetters);
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!usedLetters.includes(letter)) {
      state.selectionLetters[id] = letter;
      return;
    }
  }
  state.selectionLetters[id] = '?';
}

// ─── Add Selection ───────────────────────────────────────────────────────────

export function addSelection(data) {
  const selection = {
    id:            data.id || generateId(),
    values:        data.values        || [],
    originalTexts: data.originalTexts || [],
    pageTitle:     data.pageTitle     || 'Current Page',
    pageUrl:       data.pageUrl       || '',
    timestamp:     data.timestamp     || Date.now(),
    source:        data.source        || 'selection'
  };

  state.selections.unshift(selection);
  assignLetterLabel(selection.id);
  renderSelections();
  _updateFormulaRefs();
  switchToTab('selections');
  showToast(`Extracted ${selection.values.length} number${selection.values.length !== 1 ? 's' : ''}`);
}

// ─── Render Selections ───────────────────────────────────────────────────────

export function renderSelections() {
  selectionsCountBadge.textContent = state.selections.length;
  selectionsEmpty.classList.toggle('hidden', state.selections.length > 0);
  if (selectionsHeader) {
    selectionsHeader.style.display = state.selections.length > 0 ? 'flex' : 'none';
  }
  selectionsList.innerHTML = '';
  for (const sel of state.selections) {
    selectionsList.appendChild(createSelectionCard(sel));
  }
}

function createSelectionCard(sel) {
  const card   = document.createElement('div');
  card.className  = 'selection-card';
  card.dataset.id = sel.id;

  const letter     = state.selectionLetters[sel.id] || '?';
  const timeStr    = formatTime(sel.timestamp);
  const sourceIcon = sel.source === 'drag'
    ? '<svg class="card-source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/></svg>'
    : sel.source === 'paste'
      ? '<svg class="card-source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>'
      : '<svg class="card-source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l14 8-7 2-3 7z"/></svg>';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-label">
        <span class="card-letter">${letter}</span>
        <span class="card-source">${sourceIcon} ${sel.source}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="card-time">${timeStr}</span>
        <div class="card-actions">
          <button class="card-action-btn" data-action="select-all" title="Add all to calculator">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <button class="card-action-btn danger" data-action="delete-card" title="Remove entire selection">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div class="card-values">
      ${sel.values.map((v, i) => `
        <span class="value-chip" data-value="${v}" data-idx="${i}" title="Click to add to calculator">
          ${v}
          <button class="chip-delete-btn" title="Remove this value" data-action="delete-value">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </span>`).join('')}
    </div>
    <div class="card-meta">
      ${renderCardMeta(sel.pageTitle, sel.pageUrl)}
    </div>
  `;

  // Value chip click → add/remove from calculator
  card.querySelectorAll('.value-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete-value"]')) return;
      const value = parseFloat(chip.dataset.value);
      if (chip.classList.contains('selected')) {
        chip.classList.remove('selected');
        removeCalcValue(value, sel.id, parseInt(chip.dataset.idx));
      } else {
        chip.classList.add('selected');
        addCalcValue(value, sel.id, parseInt(chip.dataset.idx));
      }
    });
  });

  // Delete individual value
  card.querySelectorAll('[data-action="delete-value"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chip  = btn.closest('.value-chip');
      const idx   = parseInt(chip.dataset.idx);
      const value = parseFloat(chip.dataset.value);

      sel.values.splice(idx, 1);
      sel.originalTexts.splice(idx, 1);
      removeCalcValue(value, sel.id, idx);

      // TIGHT COUPLING: shift idx references for values after the deleted one
      state.calculatorValues.forEach(cv => {
        if (cv.sourceId === sel.id && cv.idx > idx) cv.idx--;
      });

      renderSelections();
      renderCalcValues();
      _updateFormulaRefs();
      showToast('Value removed');
    });
  });

  // Add all to calculator
  card.querySelector('[data-action="select-all"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    sel.values.forEach((v, i) => addCalcValue(v, sel.id, i));
    card.querySelectorAll('.value-chip').forEach(c => c.classList.add('selected'));
    showToast(`Added ${sel.values.length} values to calculator`);
  });

  // Delete entire card
  card.querySelector('[data-action="delete-card"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.selections       = state.selections.filter(s => s.id !== sel.id);
    delete state.selectionLetters[sel.id];
    state.calculatorValues = state.calculatorValues.filter(cv => cv.sourceId !== sel.id);
    renderSelections();
    renderCalcValues();
    _updateFormulaRefs();
  });

  return card;
}

// ─── Calculator Values ───────────────────────────────────────────────────────

export function addCalcValue(value, sourceId, idx) {
  const exists = state.calculatorValues.some(cv => cv.sourceId === sourceId && cv.idx === idx);
  if (!exists) {
    state.calculatorValues.push({ value, sourceId, idx });
    renderCalcValues();
  }
}

export function removeCalcValue(value, sourceId, idx) {
  state.calculatorValues = state.calculatorValues.filter(
    cv => !(cv.sourceId === sourceId && cv.idx === idx)
  );
  renderCalcValues();
}

export function renderCalcValues() {
  if (state.calculatorValues.length === 0) {
    calcValuesDisplay.innerHTML = '<div class="calc-placeholder">No values selected</div>';
    return;
  }

  calcValuesDisplay.innerHTML = state.calculatorValues.map((cv, i) => {
    const letter = state.selectionLetters[cv.sourceId] || '?';
    return `<span class="value-chip selected" data-calc-idx="${i}" title="From [${letter}]">${cv.value}<span class="original">[${letter}]</span></span>`;
  }).join('');

  calcValuesDisplay.querySelectorAll('.value-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const idx     = parseInt(chip.dataset.calcIdx);
      const removed = state.calculatorValues[idx];
      state.calculatorValues.splice(idx, 1);

      // Deselect chip in the source selection card
      if (removed) {
        const card = selectionsList.querySelector(`[data-id="${removed.sourceId}"]`);
        if (card) {
          card.querySelectorAll('.value-chip').forEach(c => {
            if (parseInt(c.dataset.idx) === removed.idx) c.classList.remove('selected');
          });
        }
      }
      renderCalcValues();
    });
  });
}

// ─── Clear Selections ────────────────────────────────────────────────────────

btnClearSelections?.addEventListener('click', () => {
  if (state.selections.length === 0) return;
  state.selections       = [];
  state.selectionLetters = {};
  state.calculatorValues = [];
  calcResult.classList.add('hidden');
  renderSelections();
  renderCalcValues();
  _updateFormulaRefs();
  showToast('Cleared all selections');
});

// ─── Clear Calculator Values ─────────────────────────────────────────────────

btnClearCalc.addEventListener('click', () => {
  if (state.calculatorValues.length === 0) return;
  state.calculatorValues = [];
  calcResult.classList.add('hidden');
  selectionsList.querySelectorAll('.value-chip.selected').forEach(c => c.classList.remove('selected'));
  renderCalcValues();
  showToast('Cleared all calculator values');
});

// ─── Manual Input ────────────────────────────────────────────────────────────

btnAddManual.addEventListener('click', () => {
  const text = manualValuesInput.value.trim();
  if (!text) return;

  const numbers = parseManualInput(text);
  if (numbers.length === 0) {
    showToast('No valid numbers found');
    return;
  }

  const manualSel = {
    id:            generateId(),
    values:        numbers,
    originalTexts: numbers.map(String),
    pageTitle:     'Manual Input',
    pageUrl:       '',
    timestamp:     Date.now(),
    source:        'manual'
  };

  state.selections.unshift(manualSel);
  assignLetterLabel(manualSel.id);
  renderSelections();
  _updateFormulaRefs();
  manualValuesInput.value = '';
  showToast(`Added ${numbers.length} values`);
});

manualValuesInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnAddManual.click();
});

function parseManualInput(text) {
  const parts   = text.split(/[,\s\t\n]+/).filter(Boolean);
  const numbers = [];
  for (const p of parts) {
    const cleaned = p.replace(/[$€£¥₹%]/g, '').replace(/,/g, '');
    const n = parseFloat(cleaned);
    if (!isNaN(n) && isFinite(n)) numbers.push(n);
  }
  return numbers;
}
