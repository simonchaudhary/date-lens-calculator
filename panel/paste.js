/**
 * panel/paste.js
 *
 * OWNS:
 *   - Paste tab: textarea input, Extract Numbers button, Clear button
 *   - extractFromPastedData() — splits tab/newline-delimited text, parses numbers
 *   - Preview rendering with "Add as Selection" button
 *   - Sending pasted data to background as SELECTION_DATA (for persistence)
 *   - Switching to Selections tab after adding
 *
 * DOES NOT TOUCH: History, calculator values, or formula evaluation.
 *
 * COUPLING NOTE: Calls addSelection() and assignLetterLabel() from selections.js
 *   to register the pasted data as a first-class selection. This is intentional —
 *   paste is a data-source, not a separate concept.
 */

import { generateId } from './utils.js';
import { showToast } from './toast.js';
import { switchToTab } from './tabs.js';
import { addSelection } from './selections.js';

const pasteTextarea   = document.getElementById('paste-textarea');
const btnPasteExtract = document.getElementById('btn-paste-extract');
const btnPasteClear   = document.getElementById('btn-paste-clear');
const pasteResult     = document.getElementById('paste-result');

btnPasteExtract.addEventListener('click', () => {
  const text = pasteTextarea.value.trim();
  if (!text) {
    showToast('Paste some data first');
    return;
  }

  const numbers = extractFromPastedData(text);
  if (numbers.length === 0) {
    showToast('No numbers found in pasted data');
    pasteResult.classList.add('hidden');
    return;
  }

  pasteResult.classList.remove('hidden');
  pasteResult.innerHTML = `
    <div style="margin-bottom: 8px; font-size: 11px; color: var(--text-secondary);">
      Found <strong style="color: var(--accent);">${numbers.length}</strong> numbers:
    </div>
    <div class="card-values">
      ${numbers.map(n => `<span class="value-chip">${n}</span>`).join('')}
    </div>
    <div style="margin-top: 8px;">
      <button id="btn-paste-add" class="btn-sm btn-accent">Add as Selection</button>
    </div>
  `;

  document.getElementById('btn-paste-add').addEventListener('click', () => {
    const sel = {
      id:            generateId(),
      values:        numbers,
      originalTexts: numbers.map(String),
      pageTitle:     'Pasted Data',
      pageUrl:       '',
      timestamp:     Date.now(),
      source:        'paste'
    };

    // addSelection handles rendering, letter assignment, tab switch, and toast
    addSelection(sel);

    // Also persist via background so it survives panel close/reopen
    chrome.runtime.sendMessage({ type: 'SELECTION_DATA', ...sel });

    pasteTextarea.value = '';
    pasteResult.classList.add('hidden');
  });
});

btnPasteClear.addEventListener('click', () => {
  pasteTextarea.value = '';
  pasteResult.classList.add('hidden');
});

function extractFromPastedData(text) {
  const numbers = [];
  for (const line of text.split('\n')) {
    for (const cell of line.split('\t')) {
      const trimmed = cell.trim();
      if (!trimmed) continue;
      const cleaned = trimmed.replace(/[$€£¥₹%,\s]/g, '');
      const n = parseFloat(cleaned);
      if (!isNaN(n) && isFinite(n)) numbers.push(n);
    }
  }
  return numbers;
}
