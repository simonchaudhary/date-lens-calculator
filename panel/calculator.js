/**
 * panel/calculator.js
 *
 * OWNS:
 *   - Quick operation buttons (sum, avg, min, max, product, subtract, count, median)
 *   - performOperation() — pure arithmetic on an array of values
 *   - showResult() — renders formula and value in the result panel
 *   - Copy and Save (→ snapshot modal) buttons on the result
 *   - Custom formula: updateFormulaRefs(), evaluateFormula()
 *   - lastSavedResult caching for the snapshot modal
 *
 * DOES NOT TOUCH: Selection rendering, history loading, paste mode, or snapshot storage.
 *
 * TIGHT COUPLING NOTE (documented, not fixable):
 *   - updateFormulaRefs() reads state.selections and state.selectionLetters.
 *   - evaluateFormula() reads state.selections and state.selectionLetters via
 *     parseAndEvalFormula(). These are inherent to the feature.
 *   - showResult() is also called by history.js — it is exported for that purpose.
 */

import { state } from './state.js';
import { formatNumber } from './utils.js';
import { showToast } from './toast.js';
import { parseAndEvalFormula } from './formula-parser.js';
import { setFormulaRefUpdater } from './selections.js';

// DOM refs
const formulaRefList  = document.getElementById('formula-ref-list');
const formulaInput    = document.getElementById('formula-input');
const btnEvalFormula  = document.getElementById('btn-eval-formula');
const calcResult      = document.getElementById('calc-result');
const resultFormula   = document.getElementById('result-formula');
const resultValue     = document.getElementById('result-value');
const btnCopyResult   = document.getElementById('btn-copy-result');
const btnSaveResult   = document.getElementById('btn-save-result');
const snapshotModal   = document.getElementById('snapshot-modal');
const snapshotNameInput = document.getElementById('snapshot-name-input');

// Register the updater so selections.js can call it after mutations
setFormulaRefUpdater(updateFormulaRefs);

// ─── Formula Refs Display ────────────────────────────────────────────────────

export function updateFormulaRefs() {
  formulaRefList.innerHTML = '';
  for (const sel of state.selections) {
    const letter = state.selectionLetters[sel.id];
    if (!letter) continue;
    const sumVal = sel.values.reduce((a, b) => a + b, 0);
    const ref    = document.createElement('span');
    ref.className = 'formula-ref';
    ref.innerHTML = `<span class="formula-ref-letter">[${letter}]</span> = ${formatNumber(sumVal)} (${sel.values.length} vals)`;
    formulaRefList.appendChild(ref);
  }
}

// ─── Quick Operations ────────────────────────────────────────────────────────

document.querySelectorAll('.op-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const op     = btn.dataset.op;
    const values = state.calculatorValues.map(cv => cv.value);

    if (values.length === 0) {
      showToast('No values selected');
      return;
    }

    const result = performOperation(op, values);
    showResult(result.formula, result.value);

    chrome.runtime.sendMessage({
      type: 'SAVE_CALCULATION',
      data: {
        operation: op,
        values:    values,
        result:    result.value,
        formula:   result.formula,
        pageTitle: state.selections[0]?.pageTitle || 'Calculator'
      }
    });
  });
});

export function performOperation(op, values) {
  let result, formula;

  switch (op) {
    case 'sum':
      result  = values.reduce((a, b) => a + b, 0);
      formula = values.join(' + ') + ` = ${formatNumber(result)}`;
      break;
    case 'avg':
      result  = values.reduce((a, b) => a + b, 0) / values.length;
      formula = `(${values.join(' + ')}) / ${values.length} = ${formatNumber(result)}`;
      break;
    case 'min':
      result  = Math.min(...values);
      formula = `min(${values.join(', ')}) = ${formatNumber(result)}`;
      break;
    case 'max':
      result  = Math.max(...values);
      formula = `max(${values.join(', ')}) = ${formatNumber(result)}`;
      break;
    case 'product':
      result  = values.reduce((a, b) => a * b, 1);
      formula = values.join(' × ') + ` = ${formatNumber(result)}`;
      break;
    case 'subtract':
      result  = values.reduce((a, b) => a - b);
      formula = values.join(' − ') + ` = ${formatNumber(result)}`;
      break;
    case 'count':
      result  = values.length;
      formula = `count(${values.length} value${values.length !== 1 ? 's' : ''})`;
      break;
    case 'median': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid    = Math.floor(sorted.length / 2);
      result  = sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
      formula = `median(${values.join(', ')}) = ${formatNumber(result)}`;
      break;
    }
    default:
      result  = 0;
      formula = 'Unknown operation';
  }

  return { value: result, formula };
}

// ─── Result Display ──────────────────────────────────────────────────────────

export function showResult(formula, value) {
  calcResult.classList.remove('hidden');
  resultFormula.textContent = formula;
  resultValue.textContent   = formatNumber(value);
  // Re-trigger entrance animation
  calcResult.style.animation = 'none';
  calcResult.offsetHeight;   // force reflow
  calcResult.style.animation = '';
}

btnCopyResult.addEventListener('click', () => {
  navigator.clipboard.writeText(resultValue.textContent).then(() => {
    showToast('Copied to clipboard!');
  });
});

btnSaveResult.addEventListener('click', () => {
  state.lastSavedResult = {
    formula: resultFormula.textContent,
    value:   resultValue.textContent,
    values:  state.calculatorValues.map(cv => cv.value)
  };
  snapshotModal.classList.remove('hidden');
  snapshotNameInput.value = '';
  snapshotNameInput.focus();
});

// ─── Custom Formula ──────────────────────────────────────────────────────────

btnEvalFormula.addEventListener('click', evaluateFormula);
formulaInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') evaluateFormula();
});

function evaluateFormula() {
  const expr = formulaInput.value.trim();
  if (!expr) {
    showToast('Enter a formula');
    return;
  }

  try {
    const result = parseAndEvalFormula(expr, state.selections, state.selectionLetters);
    showResult(expr + ` = ${formatNumber(result)}`, result);

    chrome.runtime.sendMessage({
      type: 'SAVE_CALCULATION',
      data: {
        operation: 'formula',
        formula:   expr,
        values:    [],
        result:    result,
        pageTitle: 'Custom Formula'
      }
    });
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}
