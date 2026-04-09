// DataLens Calculator — Content Script
// Handles DOM interaction: click mode, drag mode, number extraction

(function () {
  'use strict';

  // Prevent double injection
  if (window.__datalensInjected) return;
  window.__datalensInjected = true;

  let currentMode = 'off'; // 'off' | 'click' | 'drag'
  let extractType = 'number'; // 'number' | 'text' | 'regex'
  let extractRegex = '';
  let overlay = null;
  let selectionRect = null;
  let modeBadge = null;
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let highlightedElements = [];
  let lastHoveredElement = null;
  let dragBadge = null;

  // ─── Number Extraction ───────────────────────────────────────────

  function extractNumbers(text) {
    if (!text || typeof text !== 'string') return [];

    if (extractType === 'text') {
      const t = text.trim();
      return t ? [{ original: t, value: t }] : [];
    }

    let regex;
    if (extractType === 'regex') {
      try {
        const regexStr = extractRegex.trim();
        if (!regexStr) return [];
        regex = new RegExp(regexStr, 'g');
      } catch (e) {
        return []; // Invalid regex
      }
    } else {
      // Match numeric patterns: integers, decimals, currency, percentages, negative
      regex = /[-+]?[$€£¥₹]?\s*\d{1,3}(?:[,.\s]\d{3})*(?:[.,]\d+)?%?/g;
    }

    const matches = text.match(regex);
    if (!matches) return [];

    const results = [];
    for (const match of matches) {
      const original = match.trim();

      if (extractType === 'regex') {
        const cleaned = original.replace(/[$€£¥₹%\s,]/g, '');
        const n = parseFloat(cleaned);
        results.push({ original, value: (!isNaN(n) && isFinite(n)) ? n : original });
        continue;
      }
      // Strip currency symbols, spaces, and percentage signs
      let cleaned = original.replace(/[$€£¥₹%\s]/g, '');

      // Handle thousand separators vs decimals:
      // If format is like 1,234.56 or 1.234,56
      const commaCount = (cleaned.match(/,/g) || []).length;
      const dotCount = (cleaned.match(/\./g) || []).length;

      if (commaCount > 0 && dotCount > 0) {
        // Both present: last separator is decimal
        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');
        if (lastComma > lastDot) {
          // European: 1.234,56
          cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
          // US: 1,234.56
          cleaned = cleaned.replace(/,/g, '');
        }
      } else if (commaCount === 1) {
        // Could be thousand separator (1,234) or decimal (3,5)
        const afterComma = cleaned.split(',')[1];
        if (afterComma && afterComma.length === 3) {
          cleaned = cleaned.replace(',', ''); // thousand separator
        } else {
          cleaned = cleaned.replace(',', '.'); // decimal
        }
      } else if (commaCount > 1) {
        // Multiple commas = thousand separators: 1,234,567
        cleaned = cleaned.replace(/,/g, '');
      }

      const value = parseFloat(cleaned);
      if (!isNaN(value) && isFinite(value)) {
        results.push({ original, value });
      }
    }

    return results;
  }

  // ─── Element Text Extraction ─────────────────────────────────────

  function getDirectTextContent(el) {
    // Get text from element, preferring direct text nodes
    let text = '';
    let hasDirectText = false;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const val = node.textContent.trim();
        if (val) {
          text += val + ' ';
          hasDirectText = true;
        }
      }
    }
    
    if (hasDirectText) {
      return { text: text.trim(), hasDirectText: true };
    }

    // If no direct text, fall back to full textContent but avoid grabbing text 
    // from large nested structures. If the element contains complex nested blocks 
    // (like an inner table), grabbing textContent will mistakenly suck in data 
    // from sub-elements that might fall outside the drag selection rectangle.
    if (el.querySelector('table, div, p, ul, ol, dl, section, article, tr, tbody')) {
      return { text: '', hasDirectText: false };
    }

    text = el.textContent || '';
    return { text: text.trim(), hasDirectText: false };
  }

  function filterMatchedElements(matched) {
    const filtered = [];
    for (const item of matched) {
      if (item.hasDirectText) {
        filtered.push(item);
      } else {
        const containsAnother = matched.some(m => m.element !== item.element && item.element.contains(m.element));
        if (!containsAnother) {
          filtered.push(item);
        }
      }
    }
    return filtered;
  }

  // ─── Overlap Detection ──────────────────────────────────────────

  function rectsOverlap(r1, r2) {
    return !(r1.right < r2.left || r1.left > r2.right ||
             r1.bottom < r2.top || r1.top > r2.bottom);
  }

  function getElementsInRect(rectBounds) {
    const elements = [];
    // Query leaf-ish elements: cells, spans, divs with text, etc.
    const candidates = document.querySelectorAll(
      'td, th, span, p, li, dd, dt, h1, h2, h3, h4, h5, h6, a, label, ' +
      'div:not(:has(div)), strong, em, b, i, code, pre, small, big, sup, sub'
    );

    for (const el of candidates) {
      if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') continue;
      const elRect = el.getBoundingClientRect();
      if (elRect.width === 0 || elRect.height === 0) continue;
      if (rectsOverlap(rectBounds, elRect)) {
        const info = getDirectTextContent(el);
        if (info.text) {
          elements.push({ element: el, text: info.text, hasDirectText: info.hasDirectText });
        }
      }
    }
    return elements;
  }

  // ─── Mode Badge ──────────────────────────────────────────────────

  function showModeBadge(mode) {
    removeModeBadge();
    modeBadge = document.createElement('div');
    modeBadge.className = 'datalens-mode-badge';
    modeBadge.style.display = 'flex';
    modeBadge.style.alignItems = 'center';

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const dragKey = isMac ? 'Option+Shift+D' : 'Alt+Shift+D';
    const clickKey = isMac ? 'Option+Shift+C' : 'Alt+Shift+C';

    const textSpan = document.createElement('span');
    textSpan.textContent = mode === 'drag'
      ? `DataLens — Drag Select Mode (${dragKey} to toggle)`
      : `DataLens — Click Mode (${clickKey} to toggle)`;

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '8px';
    controls.style.marginLeft = '12px';
    controls.style.pointerEvents = 'auto'; // allow interaction

    const select = document.createElement('select');
    select.className = 'datalens-extract-select';
    select.innerHTML = `
      <option value="number">Numbers</option>
      <option value="text">Text</option>
      <option value="regex">Regex</option>
    `;
    select.value = extractType;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'datalens-extract-input';
    input.placeholder = '\\d+';
    input.value = extractRegex;
    input.style.display = extractType === 'regex' ? 'block' : 'none';

    select.addEventListener('change', (e) => {
      extractType = e.target.value;
      input.style.display = extractType === 'regex' ? 'block' : 'none';
      if (extractType === 'regex') input.focus();
    });

    input.addEventListener('input', (e) => {
      extractRegex = e.target.value;
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });

    controls.appendChild(select);
    controls.appendChild(input);

    modeBadge.appendChild(textSpan);
    modeBadge.appendChild(controls);

    document.body.appendChild(modeBadge);
  }

  function removeModeBadge() {
    if (modeBadge) {
      modeBadge.classList.add('datalens-badge-exit');
      const badge = modeBadge;
      setTimeout(() => badge.remove(), 250);
      modeBadge = null;
    }
  }

  // ─── Click Mode ──────────────────────────────────────────────────

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
      return; // Allow select/input to function normally in click mode window
    }
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    const info = getDirectTextContent(target);
    const numbers = extractNumbers(info.text);

    if (numbers.length === 0) {
      // Flash red briefly
      target.classList.add('datalens-flash');
      setTimeout(() => target.classList.remove('datalens-flash'), 400);
      return;
    }

    // Flash cyan
    target.classList.add('datalens-flash');
    setTimeout(() => target.classList.remove('datalens-flash'), 400);

    // Send to background
    chrome.runtime.sendMessage({
      type: 'SELECTION_DATA',
      values: numbers.map(n => n.value),
      originalTexts: numbers.map(n => n.original),
      source: 'click'
    });
  }

  function enableClickMode() {
    document.addEventListener('mouseover', onClickModeHover, true);
    document.addEventListener('mouseout', onClickModeLeave, true);
    document.addEventListener('click', onClickModeClick, true);
    showModeBadge('click');
  }

  function disableClickMode() {
    document.removeEventListener('mouseover', onClickModeHover, true);
    document.removeEventListener('mouseout', onClickModeLeave, true);
    document.removeEventListener('click', onClickModeClick, true);
    if (lastHoveredElement) {
      lastHoveredElement.classList.remove('datalens-click-hover');
      lastHoveredElement = null;
    }
  }

  // ─── Drag Mode ───────────────────────────────────────────────────

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'datalens-overlay';
    document.body.appendChild(overlay);

    selectionRect = document.createElement('div');
    selectionRect.className = 'datalens-selection-rect';
    selectionRect.style.display = 'none';
    document.body.appendChild(selectionRect);

    overlay.addEventListener('mousedown', onDragStart);
    overlay.addEventListener('mousemove', onDragMove);
    overlay.addEventListener('mouseup', onDragEnd);
    document.addEventListener('mouseup', onDragEnd);
  }

  function removeOverlay() {
    if (overlay) {
      overlay.removeEventListener('mousedown', onDragStart);
      overlay.removeEventListener('mousemove', onDragMove);
      overlay.removeEventListener('mouseup', onDragEnd);
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

  function onDragStart(e) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    selectionRect.style.display = 'block';
    selectionRect.style.left = dragStartX + 'px';
    selectionRect.style.top = dragStartY + 'px';
    selectionRect.style.width = '0px';
    selectionRect.style.height = '0px';
    clearHighlights();

    // Create drag badge
    if (dragBadge) dragBadge.remove();
    dragBadge = document.createElement('div');
    dragBadge.className = 'datalens-drag-badge';
    dragBadge.textContent = '0 items';
    document.body.appendChild(dragBadge);
    updateBadgePos(e.clientX, e.clientY);

    e.preventDefault();
  }

  function onDragMove(e) {
    if (!isDragging) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(currentX, dragStartX);
    const top = Math.min(currentY, dragStartY);
    const width = Math.abs(currentX - dragStartX);
    const height = Math.abs(currentY - dragStartY);

    selectionRect.style.left = left + 'px';
    selectionRect.style.top = top + 'px';
    selectionRect.style.width = width + 'px';
    selectionRect.style.height = height + 'px';

    updateBadgePos(currentX, currentY);

    // Throttle highlight updates
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
    dragBadge.style.top = (y + 15) + 'px';
  }

  function updateHighlights(rectBounds) {
    clearHighlights();
    // Temporarily hide overlay to query elements beneath
    overlay.style.pointerEvents = 'none';
    selectionRect.style.display = 'none';

    const matched = getElementsInRect(rectBounds);

    overlay.style.pointerEvents = '';
    selectionRect.style.display = 'block';

    const filteredMatched = filterMatchedElements(matched);
    const expanded = autoExpandSelection(filteredMatched, rectBounds);

    // Merge for preview
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
      dragBadge.textContent = `${count} item${count !== 1 ? 's' : ''}`;
      dragBadge.style.display = count > 0 ? 'block' : 'none';
      if (count > 0) dragBadge.classList.add('active');
    }
  }

  function clearHighlights() {
    for (const el of highlightedElements) {
      el.classList.remove('datalens-highlight');
    }
    highlightedElements = [];
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(currentX, dragStartX);
    const top = Math.min(currentY, dragStartY);
    const width = Math.abs(currentX - dragStartX);
    const height = Math.abs(currentY - dragStartY);

    // Minimum drag threshold
    if (width < 5 && height < 5) {
      selectionRect.style.display = 'none';
      clearHighlights();
      return;
    }

    const rectBounds = { left, top, right: left + width, bottom: top + height };

    // Temporarily hide overlay to query elements
    overlay.style.pointerEvents = 'none';
    selectionRect.style.display = 'none';

    const matched = getElementsInRect(rectBounds);

    overlay.style.pointerEvents = '';

    clearHighlights();
    selectionRect.style.display = 'none';

    const filteredMatched = filterMatchedElements(matched);

    // Extract numbers from all matched elements
    const allNumbers = [];
    const allOriginals = [];

    for (const { text } of filteredMatched) {
      const numbers = extractNumbers(text);
      for (const n of numbers) {
        allNumbers.push(n.value);
        allOriginals.push(n.original);
      }
    }

    if (allNumbers.length > 0) {
      // Auto-expand selection if a pattern is detected
      const expandedItems = autoExpandSelection(filteredMatched, rectBounds);
      
      // Merge results, avoiding duplicates
      const finalItems = [...filteredMatched];
      const existingElements = new Set(filteredMatched.map(m => m.element));
      
      for (const item of expandedItems) {
        if (!existingElements.has(item.element)) {
          finalItems.push(item);
          existingElements.add(item.element);
        }
      }

      // Flash matched elements
      for (const { element } of finalItems) {
        element.classList.add('datalens-flash');
        setTimeout(() => element.classList.remove('datalens-flash'), 400);
      }

      // Recalculate numbers from finished set
      const finalNumbers = [];
      const finalOriginals = [];
      for (const { text } of finalItems) {
        const numbers = extractNumbers(text);
        for (const n of numbers) {
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
  }

  function autoExpandSelection(matched, rectBounds) {
    if (matched.length < 2) return [];

    const dragW = rectBounds.right - rectBounds.left;
    const dragH = rectBounds.bottom - rectBounds.top;
    const dragDirection = dragH >= dragW ? 'vertical' : 'horizontal';

    // 1. Table Column/Row Strategy
    const tableResult = tryExpandTableColumn(matched, dragDirection);
    if (tableResult.length > 0) return tableResult;

    // 2. Class & Tag Strategy (direction-aware)
    const classResult = tryExpandByClassAndAlignment(matched, dragDirection);
    if (classResult.length > 0) return classResult;

    return [];
  }

  function tryExpandTableColumn(matched, dragDirection) {
    const cells = matched.filter(m => m.element.tagName === 'TD' || m.element.tagName === 'TH');
    if (cells.length < 2) return [];

    const tables = new Set(cells.map(m => m.element.closest('table')));
    if (tables.size !== 1) return [];

    const table = tables.values().next().value;

    if (dragDirection === 'horizontal') {
      // Expand to all cells in the same row
      const rows = new Set(cells.map(m => m.element.parentNode));
      if (rows.size !== 1) return [];
      const row = rows.values().next().value;
      const expanded = [];
      for (const cell of row.children) {
        const info = getDirectTextContent(cell);
        if (info.text) {
          expanded.push({ element: cell, text: info.text, hasDirectText: info.hasDirectText });
        }
      }
      return expanded;
    } else {
      // Vertical: expand to all cells in the same column
      const firstCell = cells[0].element;
      const columnIndex = Array.from(firstCell.parentNode.children).indexOf(firstCell);
      const allSameColumn = cells.every(m => {
        const idx = Array.from(m.element.parentNode.children).indexOf(m.element);
        return idx === columnIndex;
      });
      if (!allSameColumn) return [];

      const expanded = [];
      const rows = table.querySelectorAll('tr');
      for (const row of rows) {
        const cell = row.children[columnIndex];
        if (cell) {
          const info = getDirectTextContent(cell);
          if (info.text) {
            expanded.push({ element: cell, text: info.text, hasDirectText: info.hasDirectText });
          }
        }
      }
      return expanded;
    }
  }

  function findNearestCommonParent(elements) {
    if (elements.length === 0) return null;
    if (elements.length === 1) return elements[0].parentNode;

    function getAncestors(el) {
      const ancestors = [];
      let current = el.parentNode;
      while (current && current !== document) {
        ancestors.push(current);
        current = current.parentNode;
      }
      return ancestors;
    }

    const firstAncestors = getAncestors(elements[0]);
    for (const ancestor of firstAncestors) {
      if (elements.every(el => ancestor.contains(el))) {
        return ancestor;
      }
    }
    return document.body;
  }

  function tryExpandByClassAndAlignment(matched, dragDirection) {
    const elements = matched.map(m => m.element);

    // All matched elements must share the same tag name
    const tagName = elements[0].tagName;
    if (!elements.every(el => el.tagName === tagName)) return [];

    // Find the nearest common ancestor that contains all matched elements
    const commonParent = findNearestCommonParent(elements);
    if (!commonParent) return [];

    // Find classes shared by ALL matched elements (excluding internal ones)
    const classSets = elements.map(el =>
      [...el.classList].filter(c => !c.startsWith('datalens-'))
    );
    const commonClasses = classSets[0].filter(cls =>
      classSets.every(set => set.includes(cls))
    );

    // Build a scoped selector: tagName[.commonClass] within commonParent
    const selector = commonClasses.length > 0
      ? `${tagName.toLowerCase()}.${commonClasses[0]}`
      : tagName.toLowerCase();

    // Compute the bounding band of the already-matched elements
    const matchedRects = elements.map(el => el.getBoundingClientRect());
    const bandLeft  = Math.min(...matchedRects.map(r => r.left))  - 10;
    const bandRight = Math.max(...matchedRects.map(r => r.right)) + 10;
    const bandTop    = Math.min(...matchedRects.map(r => r.top))    - 10;
    const bandBottom = Math.max(...matchedRects.map(r => r.bottom)) + 10;

    const candidates = commonParent.querySelectorAll(selector);
    const expanded = [];
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width  / 2;
      const centerY = rect.top  + rect.height / 2;

      // Vertical drag → keep only candidates in the same horizontal band (same column)
      // Horizontal drag → keep only candidates in the same vertical band (same row)
      if (dragDirection === 'vertical'   && (centerX < bandLeft  || centerX > bandRight))  continue;
      if (dragDirection === 'horizontal' && (centerY < bandTop   || centerY > bandBottom)) continue;

      const info = getDirectTextContent(el);
      if (info.text) {
        expanded.push({ element: el, text: info.text, hasDirectText: info.hasDirectText });
      }
    }
    return expanded;
  }

  function enableDragMode() {
    createOverlay();
    showModeBadge('drag');
  }

  function disableDragMode() {
    removeOverlay();
  }

  // ─── Mode Management ─────────────────────────────────────────────

  function setMode(newMode) {
    // Disable current mode
    if (currentMode === 'click') disableClickMode();
    if (currentMode === 'drag') disableDragMode();

    currentMode = newMode;

    // Enable new mode
    if (newMode === 'click') enableClickMode();
    else if (newMode === 'drag') enableDragMode();

    if (newMode === 'off') removeModeBadge();
  }

  // ─── Message Handling ────────────────────────────────────────────

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

  // Escape key to turn off
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && currentMode !== 'off') {
      setMode('off');
      chrome.runtime.sendMessage({ type: 'MODE_CHANGED', mode: 'off' }).catch(() => {});
    }
  });
})();
