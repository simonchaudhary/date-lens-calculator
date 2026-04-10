/**
 * panel/mode-control.js
 *
 * OWNS:
 *   - Click/Drag mode toggle buttons in the panel header
 *   - setMode() — updates local state copy and sends SET_MODE to background
 *   - updateModeButtons() — reflects current mode in button active states
 *   - Incoming MODE_CHANGED message handling (Escape key or keyboard shortcut)
 *
 * DOES NOT TOUCH: Selections, calculator, history, paste, or storage.
 *
 * MODE STATE NOTE: state.currentMode here is a local copy for button rendering.
 * The authoritative source of truth is background/mode-manager.js (tabModes).
 * The two stay in sync via SET_MODE (panel→background) and MODE_CHANGED
 * (background→panel) messages.
 */

import { state } from './state.js';

const btnClickMode = document.getElementById('btn-click-mode');
const btnDragMode  = document.getElementById('btn-drag-mode');

btnClickMode.addEventListener('click', () => {
  const newMode = state.currentMode === 'click' ? 'off' : 'click';
  setMode(newMode);
});

btnDragMode.addEventListener('click', () => {
  const newMode = state.currentMode === 'drag' ? 'off' : 'drag';
  setMode(newMode);
});

export function setMode(mode) {
  state.currentMode = mode;
  updateModeButtons();
  chrome.runtime.sendMessage({ type: 'SET_MODE', mode });
}

export function updateModeButtons() {
  btnClickMode.classList.toggle('active', state.currentMode === 'click');
  btnDragMode.classList.toggle('active',  state.currentMode === 'drag');
}
