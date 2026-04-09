// DataLens Calculator — Background Service Worker
// Routes messages between content script and side panel, manages storage

// Open side panel when toolbar icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Side panel behavior error:', error));

// Track current mode per tab
const tabModes = {};

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;
  
  const currentMode = tabModes[tab.id] || 'off';
  
  if (command === 'toggle-drag-mode') {
    const newMode = currentMode === 'drag' ? 'off' : 'drag';
    await enableModeInTab(tab.id, newMode);
    // Also notify panel
    chrome.runtime.sendMessage({ type: 'MODE_CHANGED', mode: newMode }, () => chrome.runtime.lastError);
  } else if (command === 'toggle-click-mode') {
    const newMode = currentMode === 'click' ? 'off' : 'click';
    await enableModeInTab(tab.id, newMode);
    chrome.runtime.sendMessage({ type: 'MODE_CHANGED', mode: newMode }, () => chrome.runtime.lastError);
  }
});

function enableModeInTab(tabId, mode) {
  chrome.tabs.sendMessage(tabId, { type: 'SET_MODE', mode }, async (response) => {
    if (chrome.runtime.lastError || !response) {
      try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });

        tabModes[tabId] = mode;
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { type: 'SET_MODE', mode }, () => chrome.runtime.lastError);
        }, 50);
      } catch (injectErr) {
        console.warn('DataLens cannot run on this page', injectErr);
      }
    } else {
      tabModes[tabId] = mode;
    }
  });
}

// Message routing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'SELECTION_DATA':
      // Forward from content script to side panel
      // Add metadata
      message.tabId = sender.tab?.id;
      message.pageTitle = sender.tab?.title || 'Unknown Page';
      message.pageUrl = sender.tab?.url || '';
      message.timestamp = Date.now();
      
      // Save to storage
      saveSelection(message);
      
      // Forward to panel
      message.type = 'SELECTION_DATA_FORWARDED';
      chrome.runtime.sendMessage(message, () => chrome.runtime.lastError);
      sendResponse({ status: 'ok' });
      break;

    case 'SET_MODE':
      // Forward from panel to content script
      if (message.tabId) {
        enableModeInTab(message.tabId, message.mode);
      } else {
        // Send to active tab
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id) {
            enableModeInTab(tabs[0].id, message.mode);
          }
        });
      }
      sendResponse({ status: 'ok' });
      break;

    case 'GET_MODE':
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const mode = tabs[0]?.id ? (tabModes[tabs[0].id] || 'off') : 'off';
        sendResponse({ mode });
      });
      return true; // async response

    case 'SAVE_CALCULATION':
      saveCalculation(message.data);
      sendResponse({ status: 'ok' });
      break;

    case 'GET_HISTORY':
      getHistory().then(history => sendResponse(history));
      return true; // async

    case 'DELETE_HISTORY_ITEM':
      deleteHistoryItem(message.id).then(() => sendResponse({ status: 'ok' }));
      return true;

    case 'TOGGLE_PIN':
      togglePin(message.id).then(() => sendResponse({ status: 'ok' }));
      return true;

    case 'CLEAR_HISTORY':
      chrome.storage.local.set({ selections: [], calculations: [] });
      sendResponse({ status: 'ok' });
      break;

    case 'SAVE_SNAPSHOT':
      saveSnapshot(message.data).then(() => sendResponse({ status: 'ok' }));
      return true;

    case 'GET_SNAPSHOTS':
      getSnapshots().then(snapshots => sendResponse(snapshots));
      return true;

    case 'DELETE_SNAPSHOT':
      deleteSnapshot(message.id).then(() => sendResponse({ status: 'ok' }));
      return true;
  }
});

// Storage helpers
async function saveSelection(data) {
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
  // Keep last 200 selections
  if (selections.length > 200) selections.length = 200;
  await chrome.storage.local.set({ selections });
}

async function saveCalculation(data) {
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

async function getHistory() {
  const result = await chrome.storage.local.get({ selections: [], calculations: [] });
  return {
    selections: result.selections,
    calculations: result.calculations
  };
}

async function deleteHistoryItem(id) {
  const result = await chrome.storage.local.get({ selections: [], calculations: [] });
  result.selections = result.selections.filter(s => s.id !== id);
  result.calculations = result.calculations.filter(c => c.id !== id);
  await chrome.storage.local.set(result);
}

async function togglePin(id) {
  const result = await chrome.storage.local.get({ calculations: [] });
  const calc = result.calculations.find(c => c.id === id);
  if (calc) {
    calc.pinned = !calc.pinned;
    await chrome.storage.local.set({ calculations: result.calculations });
  }
}

async function saveSnapshot(data) {
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

async function getSnapshots() {
  const result = await chrome.storage.local.get({ snapshots: [] });
  return result.snapshots;
}

async function deleteSnapshot(id) {
  const result = await chrome.storage.local.get({ snapshots: [] });
  result.snapshots = result.snapshots.filter(s => s.id !== id);
  await chrome.storage.local.set(result);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// Clean up tab mode tracking when tabs close
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabModes[tabId];
});
