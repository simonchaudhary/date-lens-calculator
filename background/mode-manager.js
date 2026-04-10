/**
 * background/mode-manager.js
 *
 * OWNS:
 *   - Per-tab mode state (tabModes map)
 *   - Injecting content scripts into a tab and activating a mode
 *   - Cleaning up mode tracking when a tab closes
 *
 * DOES NOT TOUCH: Storage, message routing, side panel configuration.
 *
 * TIGHT COUPLING NOTE: The list of content script files below (CONTENT_FILES)
 * must stay in sync with the files declared in manifest.json content_scripts
 * and the file list in this module. If you add or rename a content/ file,
 * update both places.
 */

// Per-tab mode state. Source of truth for mode across the extension.
// content.js and panel.js each hold a local copy; this is authoritative.
export const tabModes = {};

// Load order matters — later files call functions defined in earlier files.
const CONTENT_FILES = [
  'content/number-extractor.js',
  'content/dom-utils.js',
  'content/highlights.js',
  'content/mode-badge.js',
  'content/auto-expand.js',
  'content/click-mode.js',
  'content/drag-mode.js',
  'content/index.js',
];

export function enableModeInTab(tabId, mode) {
  chrome.tabs.sendMessage(tabId, { type: 'SET_MODE', mode }, async (response) => {
    if (chrome.runtime.lastError || !response) {
      // Content script not yet injected — inject all files then activate mode
      try {
        await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/content.css'] });
        for (const file of CONTENT_FILES) {
          await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
        }
        tabModes[tabId] = mode;
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, { type: 'SET_MODE', mode }, () => chrome.runtime.lastError);
        }, 50);
      } catch (injectErr) {
        console.warn('DataLens cannot run on this page:', injectErr);
      }
    } else {
      tabModes[tabId] = mode;
    }
  });
}

// Remove stale mode entry when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabModes[tabId];
});
