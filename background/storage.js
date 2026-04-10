/**
 * background/storage.js
 *
 * OWNS: All chrome.storage.local CRUD operations for the three data stores:
 *   - selections  (max 200, FIFO)
 *   - calculations (max 500, FIFO)
 *   - snapshots   (max 100, FIFO)
 *
 * DOES NOT TOUCH: Message routing, tab management, UI, or content scripts.
 * Every function here is async and returns a Promise.
 */

import { generateId } from '../shared/generate-id.js';

export async function saveSelection(data) {
  const result = await chrome.storage.local.get({ selections: [] });
  const selections = result.selections;
  selections.unshift({
    id: generateId(),
    values: data.values,
    originalTexts: data.originalTexts,
    pageTitle: data.pageTitle,
    pageUrl: data.pageUrl,
    timestamp: data.timestamp,
    source: data.source || 'selection'
  });
  if (selections.length > 200) selections.length = 200;
  await chrome.storage.local.set({ selections });
}

export async function saveCalculation(data) {
  const result = await chrome.storage.local.get({ calculations: [] });
  const calculations = result.calculations;
  calculations.unshift({
    id: generateId(),
    ...data,
    timestamp: Date.now(),
    pinned: false
  });
  if (calculations.length > 500) calculations.length = 500;
  await chrome.storage.local.set({ calculations });
}

export async function getHistory() {
  const result = await chrome.storage.local.get({ selections: [], calculations: [] });
  return { selections: result.selections, calculations: result.calculations };
}

export async function deleteHistoryItem(id) {
  const result = await chrome.storage.local.get({ selections: [], calculations: [] });
  result.selections    = result.selections.filter(s => s.id !== id);
  result.calculations  = result.calculations.filter(c => c.id !== id);
  await chrome.storage.local.set(result);
}

export async function togglePin(id) {
  const result = await chrome.storage.local.get({ calculations: [] });
  const calc = result.calculations.find(c => c.id === id);
  if (calc) {
    calc.pinned = !calc.pinned;
    await chrome.storage.local.set({ calculations: result.calculations });
  }
}

export async function clearHistory() {
  await chrome.storage.local.set({ selections: [], calculations: [] });
}

export async function saveSnapshot(data) {
  const result = await chrome.storage.local.get({ snapshots: [] });
  const snapshots = result.snapshots;
  snapshots.unshift({
    id: generateId(),
    ...data,
    timestamp: Date.now()
  });
  if (snapshots.length > 100) snapshots.length = 100;
  await chrome.storage.local.set({ snapshots });
}

export async function getSnapshots() {
  const result = await chrome.storage.local.get({ snapshots: [] });
  return result.snapshots;
}

export async function deleteSnapshot(id) {
  const result = await chrome.storage.local.get({ snapshots: [] });
  result.snapshots = result.snapshots.filter(s => s.id !== id);
  await chrome.storage.local.set(result);
}
