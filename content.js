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
    const dragKey = isMac ? 'Cmd+Shift+D' : 'Alt+Shift+D';
    const clickKey = isMac ? 'Cmd+Shift+C' : 'Alt+Shift+C';

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
    // Also listen on document for mouse-up outside overlay
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

    // Throttle highlight updates
    if (!onDragMove._throttled) {
      onDragMove._throttled = true;
      requestAnimationFrame(() => {
        updateHighlights({ left, top, right: left + width, bottom: top + height });
        onDragMove._throttled = false;
      });
    }
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

    for (const { element } of filteredMatched) {
      element.classList.add('datalens-highlight');
      highlightedElements.push(element);
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
      // Flash matched elements
      for (const { element } of filteredMatched) {
        element.classList.add('datalens-flash');
        setTimeout(() => element.classList.remove('datalens-flash'), 400);
      }

      chrome.runtime.sendMessage({
        type: 'SELECTION_DATA',
        values: allNumbers,
        originalTexts: allOriginals,
        source: 'drag'
      });
    }
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
