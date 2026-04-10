/**
 * content/index.js
 *
 * OWNS:
 *   - Double-injection guard (window.__datalensInjected)
 *   - currentMode state (source of truth for this content script instance)
 *   - setMode() — disables current mode, enables new mode, updates badge
 *   - chrome.runtime.onMessage listener (SET_MODE, GET_CURRENT_MODE, PING)
 *   - Escape key listener (turns off mode, notifies background)
 *
 * DOES NOT TOUCH: Number extraction, DOM utilities, highlights, overlay,
 *   auto-expand, or storage. Delegates all mode work to click-mode.js,
 *   drag-mode.js, and mode-badge.js via shared scope.
 *
 * LOAD ORDER: This file must be LAST in the content_scripts list in
 *   manifest.json so all dependencies are defined before setup runs.
 */

// Prevent double injection (e.g. when re-injected via chrome.scripting API)
if (window.__datalensInjected) {
  // Already initialised — nothing to do. The existing message listener
  // will handle any incoming SET_MODE commands.
  // eslint-disable-next-line no-throw-literal
} else {
  window.__datalensInjected = true;

  let currentMode = 'off'; // 'off' | 'click' | 'drag'

  // ─── Mode Management ───────────────────────────────────────────────────────

  function setMode(newMode) {
    if (currentMode === 'click') disableClickMode();
    if (currentMode === 'drag')  disableDragMode();

    currentMode = newMode;

    if (newMode === 'click') enableClickMode();
    else if (newMode === 'drag') enableDragMode();

    if (newMode === 'off') removeModeBadge();
  }

  // ─── Message Handling ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_MODE') {
      setMode(message.mode);
      sendResponse({ status: 'ok', mode: currentMode });
    } else if (message.type === 'GET_CURRENT_MODE') {
      sendResponse({ mode: currentMode });
    } else if (message.type === 'PING') {
      sendResponse({ status: 'alive' });
    }
  });

  // ─── Escape Key ────────────────────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentMode !== 'off') {
      setMode('off');
      chrome.runtime.sendMessage({ type: 'MODE_CHANGED', mode: 'off' }).catch(() => {});
    }
  });
}
