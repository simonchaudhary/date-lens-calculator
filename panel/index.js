/**
 * panel/index.js
 *
 * OWNS:
 *   - Panel bootstrap (init())
 *   - Incoming chrome.runtime message listener:
 *       SELECTION_DATA_FORWARDED → addSelection()
 *       MODE_CHANGED → updateModeButtons()
 *   - Restoring up to 20 stored selections on load
 *   - Updating keyboard shortcut labels (Mac vs Windows/Linux)
 *
 * DOES NOT TOUCH: Individual feature logic. This file only wires modules
 *   together and should remain thin. Feature logic lives in its own module.
 *
 * IMPORT ORDER NOTE: calculator.js imports selections.js and calls
 *   setFormulaRefUpdater(). Both must be imported before init() runs,
 *   which they are since ES module imports are hoisted.
 */

import { state } from './state.js';
import { updateModeButtons } from './mode-control.js';
import { addSelection, assignLetterLabel, renderSelections } from './selections.js';
import { updateFormulaRefs } from './calculator.js';

// Side-effect imports — these modules wire up their own DOM listeners on import
import './tabs.js';
import './mode-control.js';
import './calculator.js';
import './history.js';
import './snapshots.js';
import './paste.js';

// ─── Incoming Messages ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SELECTION_DATA_FORWARDED' || message.type === 'SELECTION_DATA') {
    // Ignore the raw broadcast that hasn't yet been annotated by background
    if (message.type === 'SELECTION_DATA' && !message.pageUrl) return;
    addSelection(message);
    sendResponse?.({ status: 'ok' });
  } else if (message.type === 'MODE_CHANGED') {
    state.currentMode = message.mode;
    updateModeButtons();
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  // Sync mode buttons with background's current mode
  chrome.runtime.sendMessage({ type: 'GET_MODE' }, (response) => {
    if (response?.mode) {
      state.currentMode = response.mode;
      updateModeButtons();
    }
  });

  // Restore up to 20 most-recent stored selections
  chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (response) => {
    if (response?.selections) {
      const stored = response.selections.slice(0, 20);
      for (const sel of stored.reverse()) {
        if (!state.selections.find(s => s.id === sel.id)) {
          state.selections.push(sel);
          assignLetterLabel(sel.id);
        }
      }
      state.selections.reverse(); // newest first
      renderSelections();
      updateFormulaRefs();
    }
  });

  // OS-aware keyboard shortcut labels
  const isMac    = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const dragKey  = isMac ? 'Option+Shift+D' : 'Alt+Shift+D';
  const clickKey = isMac ? 'Option+Shift+C' : 'Alt+Shift+C';

  const kbdClick = document.getElementById('kbd-click');
  const kbdDrag  = document.getElementById('kbd-drag');
  if (kbdClick) kbdClick.textContent = clickKey;
  if (kbdDrag)  kbdDrag.textContent  = dragKey;

  document.getElementById('btn-click-mode').title = `Click Mode (${clickKey})`;
  document.getElementById('btn-drag-mode').title  = `Drag Mode (${dragKey})`;

  renderSelections();
}

init();
