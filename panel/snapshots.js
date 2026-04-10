/**
 * panel/snapshots.js
 *
 * OWNS:
 *   - Snapshot naming modal (open, close, save)
 *   - Keyboard shortcut (Enter) inside the modal name input
 *
 * DOES NOT TOUCH: Snapshot storage (background.js), history rendering
 *   (history.js), or calculator values. Reads lastSavedResult from state.
 */

import { state } from './state.js';
import { showToast } from './toast.js';

const snapshotModal     = document.getElementById('snapshot-modal');
const snapshotNameInput = document.getElementById('snapshot-name-input');
const btnSnapshotCancel = document.getElementById('btn-snapshot-cancel');
const btnSnapshotSave   = document.getElementById('btn-snapshot-save');

btnSnapshotCancel.addEventListener('click', () => {
  snapshotModal.classList.add('hidden');
});

snapshotModal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
  snapshotModal.classList.add('hidden');
});

btnSnapshotSave.addEventListener('click', async () => {
  const name = snapshotNameInput.value.trim();
  if (!name) {
    showToast('Enter a name for the snapshot');
    return;
  }

  if (state.lastSavedResult) {
    await chrome.runtime.sendMessage({
      type: 'SAVE_SNAPSHOT',
      data: {
        name,
        formula: state.lastSavedResult.formula,
        result:  state.lastSavedResult.value,
        values:  state.lastSavedResult.values
      }
    });
    showToast('Snapshot saved!');
    snapshotModal.classList.add('hidden');
    state.lastSavedResult = null;
  }
});

snapshotNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSnapshotSave.click();
});
