/**
 * background/index.js
 *
 * OWNS:
 *   - Side panel configuration (open on icon click)
 *   - Keyboard command handling (Alt+Shift+D, Alt+Shift+C)
 *   - Message routing between content script and side panel
 *
 * DOES NOT TOUCH: Storage details (delegated to storage.js),
 *   content script injection details (delegated to mode-manager.js).
 */

import { MSG } from '../shared/message-types.js';
import {
  saveSelection, saveCalculation, getHistory,
  deleteHistoryItem, togglePin, clearHistory,
  saveSnapshot, getSnapshots, deleteSnapshot
} from './storage.js';
import { tabModes, enableModeInTab } from './mode-manager.js';

// ─── Side Panel ──────────────────────────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Side panel behavior error:', error));

// ─── Keyboard Commands ───────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;

  const currentMode = tabModes[tab.id] || 'off';

  if (command === 'toggle-drag-mode') {
    const newMode = currentMode === 'drag' ? 'off' : 'drag';
    enableModeInTab(tab.id, newMode);
    chrome.runtime.sendMessage({ type: MSG.MODE_CHANGED, mode: newMode }, () => chrome.runtime.lastError);
  } else if (command === 'toggle-click-mode') {
    const newMode = currentMode === 'click' ? 'off' : 'click';
    enableModeInTab(tab.id, newMode);
    chrome.runtime.sendMessage({ type: MSG.MODE_CHANGED, mode: newMode }, () => chrome.runtime.lastError);
  }
});

// ─── Message Routing ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case MSG.SELECTION_DATA:
      // Annotate with tab metadata, save, then forward to panel
      message.tabId     = sender.tab?.id;
      message.pageTitle = sender.tab?.title || 'Unknown Page';
      message.pageUrl   = sender.tab?.url   || '';
      message.timestamp = Date.now();
      saveSelection(message);
      message.type = MSG.SELECTION_DATA_FORWARDED;
      chrome.runtime.sendMessage(message, () => chrome.runtime.lastError);
      sendResponse({ status: 'ok' });
      break;

    case MSG.SET_MODE:
      if (message.tabId) {
        enableModeInTab(message.tabId, message.mode);
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) enableModeInTab(tabs[0].id, message.mode);
        });
      }
      sendResponse({ status: 'ok' });
      break;

    case MSG.GET_MODE:
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const mode = tabs[0]?.id ? (tabModes[tabs[0].id] || 'off') : 'off';
        sendResponse({ mode });
      });
      return true; // async

    case MSG.SAVE_CALCULATION:
      saveCalculation(message.data);
      sendResponse({ status: 'ok' });
      break;

    case MSG.GET_HISTORY:
      getHistory().then(history => sendResponse(history));
      return true;

    case MSG.DELETE_HISTORY_ITEM:
      deleteHistoryItem(message.id).then(() => sendResponse({ status: 'ok' }));
      return true;

    case MSG.TOGGLE_PIN:
      togglePin(message.id).then(() => sendResponse({ status: 'ok' }));
      return true;

    case MSG.CLEAR_HISTORY:
      clearHistory();
      sendResponse({ status: 'ok' });
      break;

    case MSG.SAVE_SNAPSHOT:
      saveSnapshot(message.data).then(() => sendResponse({ status: 'ok' }));
      return true;

    case MSG.GET_SNAPSHOTS:
      getSnapshots().then(snapshots => sendResponse(snapshots));
      return true;

    case MSG.DELETE_SNAPSHOT:
      deleteSnapshot(message.id).then(() => sendResponse({ status: 'ok' }));
      return true;
  }
});
