/**
 * content/click-mode.js
 *
 * OWNS:
 *   - lastHoveredElement state
 *   - Hover highlight on mouseover/mouseout (datalens-click-hover class)
 *   - Click handler: extracts numbers from clicked element, flashes it,
 *     sends SELECTION_DATA message to background
 *   - enableClickMode() / disableClickMode()
 *
 * DOES NOT TOUCH: Drag overlay, auto-expand, mode badge (delegated to mode-badge.js),
 *   or storage.
 *
 * COUPLING NOTE: Calls getDirectTextContent() (dom-utils.js) and
 *   extractNumbers() (number-extractor.js) via shared scope.
 *   Calls showModeBadge() (mode-badge.js) via shared scope.
 */

let lastHoveredElement = null;

function onClickModeHover(e) {
  if (lastHoveredElement && lastHoveredElement !== e.target) {
    lastHoveredElement.classList.remove('datalens-click-hover');
  }
  e.target.classList.add('datalens-click-hover');
  lastHoveredElement = e.target;
}

function onClickModeLeave(e) {
  e.target.classList.remove('datalens-click-hover');
  if (lastHoveredElement === e.target) lastHoveredElement = null;
}

function onClickModeClick(e) {
  if (e.target.closest && e.target.closest('.datalens-mode-badge')) {
    return; // Allow select/input inside badge to work normally
  }
  e.preventDefault();
  e.stopPropagation();

  const target  = e.target;
  const info    = getDirectTextContent(target);
  const numbers = extractNumbers(info.text);

  // Flash element regardless of result (red tint if no numbers found)
  target.classList.add('datalens-flash');
  setTimeout(() => target.classList.remove('datalens-flash'), 400);

  if (numbers.length === 0) return;

  chrome.runtime.sendMessage({
    type: 'SELECTION_DATA',
    values: numbers.map(n => n.value),
    originalTexts: numbers.map(n => n.original),
    source: 'click'
  });
}

function enableClickMode() {
  document.addEventListener('mouseover', onClickModeHover, true);
  document.addEventListener('mouseout',  onClickModeLeave, true);
  document.addEventListener('click',     onClickModeClick, true);
  showModeBadge('click');
}

function disableClickMode() {
  document.removeEventListener('mouseover', onClickModeHover, true);
  document.removeEventListener('mouseout',  onClickModeLeave, true);
  document.removeEventListener('click',     onClickModeClick, true);
  if (lastHoveredElement) {
    lastHoveredElement.classList.remove('datalens-click-hover');
    lastHoveredElement = null;
  }
}
