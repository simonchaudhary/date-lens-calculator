/**
 * content/drag-mode.js
 *
 * OWNS:
 *   - Drag mode state: overlay, selectionRect, isDragging, dragStartX/Y, dragBadge
 *   - Full-page overlay creation and removal
 *   - Rubber-band selection rectangle rendering
 *   - Drag item-count badge (follows cursor during drag)
 *   - Mouse event handlers: onDragStart, onDragMove, onDragEnd
 *   - updateHighlights() — queries elements in rect, applies datalens-highlight
 *   - enableDragMode() / disableDragMode()
 *
 * DOES NOT TOUCH: Number extraction (number-extractor.js), DOM text utilities
 *   (dom-utils.js), auto-expand heuristics (auto-expand.js), mode badge
 *   (mode-badge.js), click mode (click-mode.js), or messaging except for the
 *   final SELECTION_DATA send in onDragEnd.
 *
 * COUPLING NOTE (shared scope): Calls getElementsInRect, filterMatchedElements
 *   (dom-utils.js), clearHighlights (highlights.js), autoExpandSelection
 *   (auto-expand.js), extractNumbers (number-extractor.js), and showModeBadge
 *   (mode-badge.js). All are available via the shared content script scope.
 */

let overlay        = null;
let selectionRect  = null;
let isDragging     = false;
let dragStartX     = 0;
let dragStartY     = 0;
let dragBadge      = null;

// ─── Overlay ─────────────────────────────────────────────────────────────────

function createOverlay() {
  overlay = document.createElement('div');
  overlay.className = 'datalens-overlay';
  document.body.appendChild(overlay);

  selectionRect = document.createElement('div');
  selectionRect.className   = 'datalens-selection-rect';
  selectionRect.style.display = 'none';
  document.body.appendChild(selectionRect);

  overlay.addEventListener('mousedown', onDragStart);
  overlay.addEventListener('mousemove', onDragMove);
  overlay.addEventListener('mouseup',   onDragEnd);
  document.addEventListener('mouseup',  onDragEnd);
}

function removeOverlay() {
  if (overlay) {
    overlay.removeEventListener('mousedown', onDragStart);
    overlay.removeEventListener('mousemove', onDragMove);
    overlay.removeEventListener('mouseup',   onDragEnd);
    overlay.remove();
    overlay = null;
  }
  if (selectionRect) {
    selectionRect.remove();
    selectionRect = null;
  }
  document.removeEventListener('mouseup', onDragEnd);
  clearHighlights();
  isDragging = false;
  if (dragBadge) {
    dragBadge.remove();
    dragBadge = null;
  }
}

// ─── Drag Handlers ───────────────────────────────────────────────────────────

function onDragStart(e) {
  isDragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;

  selectionRect.style.display = 'block';
  selectionRect.style.left    = dragStartX + 'px';
  selectionRect.style.top     = dragStartY + 'px';
  selectionRect.style.width   = '0px';
  selectionRect.style.height  = '0px';
  clearHighlights();

  if (dragBadge) dragBadge.remove();
  dragBadge = document.createElement('div');
  dragBadge.className   = 'datalens-drag-badge';
  dragBadge.textContent = '0 items';
  document.body.appendChild(dragBadge);
  updateBadgePos(e.clientX, e.clientY);

  e.preventDefault();
}

function onDragMove(e) {
  if (!isDragging) return;

  const currentX = e.clientX;
  const currentY = e.clientY;
  const left   = Math.min(currentX, dragStartX);
  const top    = Math.min(currentY, dragStartY);
  const width  = Math.abs(currentX - dragStartX);
  const height = Math.abs(currentY - dragStartY);

  selectionRect.style.left   = left   + 'px';
  selectionRect.style.top    = top    + 'px';
  selectionRect.style.width  = width  + 'px';
  selectionRect.style.height = height + 'px';

  updateBadgePos(currentX, currentY);

  if (!onDragMove._throttled) {
    onDragMove._throttled = true;
    requestAnimationFrame(() => {
      updateHighlights({ left, top, right: left + width, bottom: top + height });
      onDragMove._throttled = false;
    });
  }
}

function updateBadgePos(x, y) {
  if (!dragBadge) return;
  dragBadge.style.left = (x + 15) + 'px';
  dragBadge.style.top  = (y + 15) + 'px';
}

function updateHighlights(rectBounds) {
  clearHighlights();
  overlay.style.pointerEvents      = 'none';
  selectionRect.style.display      = 'none';

  const matched = getElementsInRect(rectBounds);

  overlay.style.pointerEvents = '';
  selectionRect.style.display = 'block';

  const filteredMatched = filterMatchedElements(matched);
  const expanded        = autoExpandSelection(filteredMatched, rectBounds);

  // Merge for preview (no duplicates)
  const previewItems = [...filteredMatched];
  const seen = new Set(filteredMatched.map(m => m.element));
  for (const item of expanded) {
    if (!seen.has(item.element)) {
      previewItems.push(item);
      seen.add(item.element);
    }
  }

  for (const { element } of previewItems) {
    element.classList.add('datalens-highlight');
    highlightedElements.push(element);
  }

  if (dragBadge) {
    const count = previewItems.length;
    dragBadge.textContent    = `${count} item${count !== 1 ? 's' : ''}`;
    dragBadge.style.display  = count > 0 ? 'block' : 'none';
    if (count > 0) dragBadge.classList.add('active');
  }
}

function onDragEnd(e) {
  if (!isDragging) return;
  isDragging = false;

  const currentX = e.clientX;
  const currentY = e.clientY;
  const left   = Math.min(currentX, dragStartX);
  const top    = Math.min(currentY, dragStartY);
  const width  = Math.abs(currentX - dragStartX);
  const height = Math.abs(currentY - dragStartY);

  // Ignore accidental micro-drags
  if (width < 5 && height < 5) {
    selectionRect.style.display = 'none';
    clearHighlights();
    return;
  }

  const rectBounds = { left, top, right: left + width, bottom: top + height };

  overlay.style.pointerEvents = 'none';
  selectionRect.style.display = 'none';

  const matched = getElementsInRect(rectBounds);
  overlay.style.pointerEvents = '';
  clearHighlights();
  selectionRect.style.display = 'none';

  const filteredMatched = filterMatchedElements(matched);

  // Quick check — bail early if nothing selected
  const anyNumbers = filteredMatched.some(({ text }) => extractNumbers(text).length > 0);
  if (!anyNumbers) return;

  // Auto-expand and merge
  const expandedItems   = autoExpandSelection(filteredMatched, rectBounds);
  const finalItems      = [...filteredMatched];
  const existingElements = new Set(filteredMatched.map(m => m.element));
  for (const item of expandedItems) {
    if (!existingElements.has(item.element)) {
      finalItems.push(item);
      existingElements.add(item.element);
    }
  }

  // Flash all matched elements
  for (const { element } of finalItems) {
    element.classList.add('datalens-flash');
    setTimeout(() => element.classList.remove('datalens-flash'), 400);
  }

  // Collect final numbers
  const finalNumbers   = [];
  const finalOriginals = [];
  for (const { text } of finalItems) {
    for (const n of extractNumbers(text)) {
      finalNumbers.push(n.value);
      finalOriginals.push(n.original);
    }
  }

  chrome.runtime.sendMessage({
    type: 'SELECTION_DATA',
    values: finalNumbers,
    originalTexts: finalOriginals,
    source: 'drag'
  });
}

// ─── Enable / Disable ────────────────────────────────────────────────────────

function enableDragMode() {
  createOverlay();
  showModeBadge('drag');
}

function disableDragMode() {
  removeOverlay();
}
