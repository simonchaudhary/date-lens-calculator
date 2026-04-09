// DataLens Calculator — Side Panel Logic
// Selections management, calculations, history, paste mode, custom formulas

(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────

  let selections = [];         // Array of selection objects from content script
  let calculatorValues = [];   // Values currently in the calculator
  let currentMode = 'off';
  let historyFilter = 'all';
  let selectionLetters = {};   // Map selection id → letter label

  // ─── DOM Refs ───────────────────────────────────────────────

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const btnClickMode = $('#btn-click-mode');
  const btnDragMode = $('#btn-drag-mode');
  const tabButtons = $$('.tab-btn');
  const tabContents = $$('.tab-content');
  const selectionsCountBadge = $('#selections-count');
  const selectionsEmpty = $('#selections-empty');
  const selectionsList = $('#selections-list');
  const calcValuesDisplay = $('#calc-values-display');
  const manualValuesInput = $('#manual-values-input');
  const btnAddManual = $('#btn-add-manual');
  const btnClearCalc = $('#btn-clear-calc');
  const formulaInput = $('#formula-input');
  const btnEvalFormula = $('#btn-eval-formula');
  const formulaRefList = $('#formula-ref-list');
  const calcResult = $('#calc-result');
  const resultFormula = $('#result-formula');
  const resultValue = $('#result-value');
  const btnCopyResult = $('#btn-copy-result');
  const btnSaveResult = $('#btn-save-result');
  const historyEmpty = $('#history-empty');
  const historyList = $('#history-list');
  const btnClearHistory = $('#btn-clear-history');
  const filterButtons = $$('.filter-btn');
  const snapshotModal = $('#snapshot-modal');
  const snapshotNameInput = $('#snapshot-name-input');
  const btnSnapshotCancel = $('#btn-snapshot-cancel');
  const btnSnapshotSave = $('#btn-snapshot-save');
  const pasteTextarea = $('#paste-textarea');
  const btnPasteExtract = $('#btn-paste-extract');
  const btnPasteClear = $('#btn-paste-clear');
  const pasteResult = $('#paste-result');
  const toast = $('#toast');

  // ─── Tab Navigation ─────────────────────────────────────────

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(`#tab-${tab}`).classList.add('active');
    });
  });

  // ─── Mode Buttons ───────────────────────────────────────────

  btnClickMode.addEventListener('click', () => {
    const newMode = currentMode === 'click' ? 'off' : 'click';
    setMode(newMode);
  });

  btnDragMode.addEventListener('click', () => {
    const newMode = currentMode === 'drag' ? 'off' : 'drag';
    setMode(newMode);
  });

  function setMode(mode) {
    currentMode = mode;
    updateModeButtons();
    chrome.runtime.sendMessage({ type: 'SET_MODE', mode });
  }

  function updateModeButtons() {
    btnClickMode.classList.toggle('active', currentMode === 'click');
    btnDragMode.classList.toggle('active', currentMode === 'drag');
  }

  // ─── Message Handling ───────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SELECTION_DATA_FORWARDED' || message.type === 'SELECTION_DATA') {
      if (message.type === 'SELECTION_DATA' && !message.pageUrl) return; // ignore the unfinished raw broadcast
      addSelection(message);
      sendResponse?.({ status: 'ok' });
    } else if (message.type === 'MODE_CHANGED') {
      currentMode = message.mode;
      updateModeButtons();
    }
  });

  // ─── Selections ─────────────────────────────────────────────

  function addSelection(data) {
    const selection = {
      id: data.id || generateId(),
      values: data.values || [],
      originalTexts: data.originalTexts || [],
      pageTitle: data.pageTitle || 'Current Page',
      pageUrl: data.pageUrl || '',
      timestamp: data.timestamp || Date.now(),
      source: data.source || 'selection'
    };

    selections.unshift(selection);
    assignLetterLabel(selection.id);
    renderSelections();
    updateFormulaRefs();

    // Switch to selections tab
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tabButtons[0].classList.add('active');
    $('#tab-selections').classList.add('active');

    showToast(`Extracted ${selection.values.length} number${selection.values.length !== 1 ? 's' : ''}`);
  }

  function assignLetterLabel(id) {
    const usedLetters = Object.values(selectionLetters);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const letter of alphabet) {
      if (!usedLetters.includes(letter)) {
        selectionLetters[id] = letter;
        return;
      }
    }
    selectionLetters[id] = '?';
  }

  function renderSelections() {
    selectionsCountBadge.textContent = selections.length;
    selectionsEmpty.classList.toggle('hidden', selections.length > 0);
    selectionsList.innerHTML = '';

    for (const sel of selections) {
      const card = createSelectionCard(sel);
      selectionsList.appendChild(card);
    }
  }

  function createSelectionCard(sel) {
    const card = document.createElement('div');
    card.className = 'selection-card';
    card.dataset.id = sel.id;

    const letter = selectionLetters[sel.id] || '?';
    const timeStr = formatTime(sel.timestamp);
    const sourceIcon = sel.source === 'drag'
      ? '<svg class="card-source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/></svg>'
      : sel.source === 'paste'
        ? '<svg class="card-source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>'
        : '<svg class="card-source-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3l14 8-7 2-3 7z"/></svg>';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-label">
          <span class="card-letter">${letter}</span>
          <span class="card-source">${sourceIcon} ${sel.source}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="card-time">${timeStr}</span>
          <div class="card-actions">
            <button class="card-action-btn" data-action="select-all" title="Add all to calculator">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button class="card-action-btn danger" data-action="delete" title="Remove">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="card-values">
        ${sel.values.map((v, i) => {
          const orig = sel.originalTexts?.[i];
          const showOrig = orig && orig !== String(v);
          return `<span class="value-chip" data-value="${v}" data-idx="${i}" title="Click to add to calculator">${v}${showOrig ? `<span class="original">${orig}</span>` : ''}</span>`;
        }).join('')}
      </div>
      <div class="card-meta">
        ${renderCardMeta(sel.pageTitle, sel.pageUrl)}
      </div>
    `;

    // Click value chips to add/remove from calculator
    card.querySelectorAll('.value-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const value = parseFloat(chip.dataset.value);
        if (chip.classList.contains('selected')) {
          chip.classList.remove('selected');
          removeCalcValue(value, sel.id, parseInt(chip.dataset.idx));
        } else {
          chip.classList.add('selected');
          addCalcValue(value, sel.id, parseInt(chip.dataset.idx));
        }
      });
    });

    // Card actions
    card.querySelector('[data-action="select-all"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      sel.values.forEach((v, i) => addCalcValue(v, sel.id, i));
      card.querySelectorAll('.value-chip').forEach(c => c.classList.add('selected'));
      showToast(`Added ${sel.values.length} values to calculator`);
    });

    card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selections = selections.filter(s => s.id !== sel.id);
      delete selectionLetters[sel.id];
      // Remove these values from calculator
      calculatorValues = calculatorValues.filter(cv => cv.sourceId !== sel.id);
      renderSelections();
      renderCalcValues();
      updateFormulaRefs();
    });

    return card;
  }

  // ─── Calculator Values ──────────────────────────────────────

  function addCalcValue(value, sourceId, idx) {
    // Avoid duplicates
    const exists = calculatorValues.some(cv => cv.sourceId === sourceId && cv.idx === idx);
    if (!exists) {
      calculatorValues.push({ value, sourceId, idx });
      renderCalcValues();
    }
  }

  function removeCalcValue(value, sourceId, idx) {
    calculatorValues = calculatorValues.filter(cv => !(cv.sourceId === sourceId && cv.idx === idx));
    renderCalcValues();
  }

  function renderCalcValues() {
    if (calculatorValues.length === 0) {
      calcValuesDisplay.innerHTML = '<div class="calc-placeholder">No values selected</div>';
      return;
    }

    calcValuesDisplay.innerHTML = calculatorValues.map((cv, i) => {
      const letter = selectionLetters[cv.sourceId] || '?';
      return `<span class="value-chip selected" data-calc-idx="${i}" title="From [${letter}]">${cv.value}<span class="original">[${letter}]</span></span>`;
    }).join('');

    // Click to remove
    calcValuesDisplay.querySelectorAll('.value-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const idx = parseInt(chip.dataset.calcIdx);
        const removed = calculatorValues[idx];
        calculatorValues.splice(idx, 1);
        // Deselect in selection cards
        if (removed) {
          const card = selectionsList.querySelector(`[data-id="${removed.sourceId}"]`);
          if (card) {
            const chips = card.querySelectorAll('.value-chip');
            chips.forEach(c => {
              if (parseInt(c.dataset.idx) === removed.idx) {
                c.classList.remove('selected');
              }
            });
          }
        }
        renderCalcValues();
      });
    });
  }

  // Clear all calculator values
  btnClearCalc.addEventListener('click', () => {
    if (calculatorValues.length === 0) return;
    calculatorValues = [];
    calcResult.classList.add('hidden');
    selectionsList.querySelectorAll('.value-chip.selected').forEach(c => c.classList.remove('selected'));
    renderCalcValues();
    showToast('Cleared all calculator values');
  });

  // Manual values input
  btnAddManual.addEventListener('click', () => {
    const text = manualValuesInput.value.trim();
    if (!text) return;

    const numbers = parseManualInput(text);
    if (numbers.length === 0) {
      showToast('No valid numbers found');
      return;
    }

    // Create a virtual selection for manual inputs
    const manualSel = {
      id: generateId(),
      values: numbers,
      originalTexts: numbers.map(String),
      pageTitle: 'Manual Input',
      pageUrl: '',
      timestamp: Date.now(),
      source: 'manual'
    };

    selections.unshift(manualSel);
    assignLetterLabel(manualSel.id);
    renderSelections();
    updateFormulaRefs();

    manualValuesInput.value = '';
    showToast(`Added ${numbers.length} values`);
  });

  manualValuesInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnAddManual.click();
  });

  function parseManualInput(text) {
    // Split by comma, space, tab, newline
    const parts = text.split(/[,\s\t\n]+/).filter(Boolean);
    const numbers = [];
    for (const p of parts) {
      const cleaned = p.replace(/[$€£¥₹%]/g, '').replace(/,/g, '');
      const n = parseFloat(cleaned);
      if (!isNaN(n) && isFinite(n)) numbers.push(n);
    }
    return numbers;
  }

  // ─── Operations ─────────────────────────────────────────────

  document.querySelectorAll('.op-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = btn.dataset.op;
      const values = calculatorValues.map(cv => cv.value);

      if (values.length === 0) {
        showToast('No values selected');
        return;
      }

      const result = performOperation(op, values);
      showResult(result.formula, result.value);

      // Save to history
      chrome.runtime.sendMessage({
        type: 'SAVE_CALCULATION',
        data: {
          operation: op,
          values: values,
          result: result.value,
          formula: result.formula,
          pageTitle: selections[0]?.pageTitle || 'Calculator'
        }
      });
    });
  });

  function performOperation(op, values) {
    let result, formula;

    switch (op) {
      case 'sum':
        result = values.reduce((a, b) => a + b, 0);
        formula = values.join(' + ') + ` = ${formatNumber(result)}`;
        break;
      case 'avg':
        result = values.reduce((a, b) => a + b, 0) / values.length;
        formula = `(${values.join(' + ')}) / ${values.length} = ${formatNumber(result)}`;
        break;
      case 'min':
        result = Math.min(...values);
        formula = `min(${values.join(', ')}) = ${formatNumber(result)}`;
        break;
      case 'max':
        result = Math.max(...values);
        formula = `max(${values.join(', ')}) = ${formatNumber(result)}`;
        break;
      case 'product':
        result = values.reduce((a, b) => a * b, 1);
        formula = values.join(' × ') + ` = ${formatNumber(result)}`;
        break;
      case 'subtract':
        result = values.reduce((a, b) => a - b);
        formula = values.join(' − ') + ` = ${formatNumber(result)}`;
        break;
      case 'count':
        result = values.length;
        formula = `count(${values.length} value${values.length !== 1 ? 's' : ''})`;
        break;
      case 'median':
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        result = sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;
        formula = `median(${values.join(', ')}) = ${formatNumber(result)}`;
        break;
      default:
        result = 0;
        formula = 'Unknown operation';
    }

    return { value: result, formula };
  }

  function showResult(formula, value) {
    calcResult.classList.remove('hidden');
    resultFormula.textContent = formula;
    resultValue.textContent = formatNumber(value);

    // Re-trigger animation
    calcResult.style.animation = 'none';
    calcResult.offsetHeight; // force reflow
    calcResult.style.animation = '';
  }

  // Copy result
  btnCopyResult.addEventListener('click', () => {
    const value = resultValue.textContent;
    navigator.clipboard.writeText(value).then(() => {
      showToast('Copied to clipboard!');
    });
  });

  // Save result
  let lastSavedResult = null;
  btnSaveResult.addEventListener('click', () => {
    lastSavedResult = {
      formula: resultFormula.textContent,
      value: resultValue.textContent,
      values: calculatorValues.map(cv => cv.value)
    };
    snapshotModal.classList.remove('hidden');
    snapshotNameInput.value = '';
    snapshotNameInput.focus();
  });

  // ─── Custom Formulas ────────────────────────────────────────

  function updateFormulaRefs() {
    formulaRefList.innerHTML = '';
    for (const sel of selections) {
      const letter = selectionLetters[sel.id];
      if (!letter) continue;

      const sumVal = sel.values.reduce((a, b) => a + b, 0);
      const ref = document.createElement('span');
      ref.className = 'formula-ref';
      ref.innerHTML = `<span class="formula-ref-letter">[${letter}]</span> = ${formatNumber(sumVal)} (${sel.values.length} vals)`;
      formulaRefList.appendChild(ref);
    }
  }

  btnEvalFormula.addEventListener('click', evaluateFormula);
  formulaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') evaluateFormula();
  });

  function evaluateFormula() {
    const expr = formulaInput.value.trim();
    if (!expr) {
      showToast('Enter a formula');
      return;
    }

    try {
      const result = parseAndEvalFormula(expr);
      showResult(expr + ` = ${formatNumber(result)}`, result);

      chrome.runtime.sendMessage({
        type: 'SAVE_CALCULATION',
        data: {
          operation: 'formula',
          formula: expr,
          values: [],
          result: result,
          pageTitle: 'Custom Formula'
        }
      });
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  }

  function parseAndEvalFormula(expr) {
    // Replace [A], [B], etc. with their sum values
    let processed = expr.replace(/\[([A-Z])\]/g, (match, letter) => {
      const selId = Object.keys(selectionLetters).find(k => selectionLetters[k] === letter);
      if (!selId) throw new Error(`Selection [${letter}] not found`);
      const sel = selections.find(s => s.id === selId);
      if (!sel) throw new Error(`Selection [${letter}] not found`);
      const sum = sel.values.reduce((a, b) => a + b, 0);
      return `(${sum})`;
    });

    // Safety: only allow numbers, operators, parentheses, spaces, dots
    if (!/^[\d\s+\-*/().]+$/.test(processed)) {
      throw new Error('Invalid characters in formula');
    }

    // Evaluate safely using Function constructor (limited scope)
    const fn = new Function(`'use strict'; return (${processed});`);
    const result = fn();

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Result is not a valid number');
    }

    return result;
  }

  // ─── History ────────────────────────────────────────────────

  async function loadHistory() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_HISTORY' });
      renderHistory(response?.calculations || [], response?.selections || []);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }

  async function loadSnapshots() {
    try {
      const snapshots = await chrome.runtime.sendMessage({ type: 'GET_SNAPSHOTS' });
      return snapshots || [];
    } catch (e) {
      return [];
    }
  }

  async function renderHistory(calculations, storedSelections) {
    const snapshots = await loadSnapshots();

    let items = [];

    if (historyFilter === 'all') {
      items = calculations.map(c => ({ ...c, _type: 'calculation' }));
    } else if (historyFilter === 'pinned') {
      items = calculations.filter(c => c.pinned).map(c => ({ ...c, _type: 'calculation' }));
    } else if (historyFilter === 'snapshots') {
      items = snapshots.map(s => ({ ...s, _type: 'snapshot' }));
    }

    historyEmpty.classList.toggle('hidden', items.length > 0);
    historyList.innerHTML = '';

    for (const item of items) {
      const card = item._type === 'snapshot'
        ? createSnapshotCard(item)
        : createHistoryCard(item);
      historyList.appendChild(card);
    }
  }

  function createHistoryCard(calc) {
    const card = document.createElement('div');
    card.className = `history-card${calc.pinned ? ' pinned' : ''}`;
    card.dataset.id = calc.id;

    const opLabels = {
      sum: 'Σ Sum', avg: 'x̄ Average', min: '↓ Min', max: '↑ Max',
      product: '∏ Product', subtract: '− Subtract', count: '# Count',
      median: 'M̃ Median', formula: 'ƒ Formula'
    };

    card.innerHTML = `
      <div class="history-op">${opLabels[calc.operation] || calc.operation}</div>
      <div class="history-values">${calc.formula || calc.values?.join(', ') || ''}</div>
      <div class="history-result">${formatNumber(calc.result)}</div>
      <div class="history-meta">
        <div class="history-page">
          ${renderCardMeta(calc.pageTitle, calc.pageUrl)}
          <span style="font-size: 10px; margin-left: 4px; color: var(--text-tertiary)">· ${formatTime(calc.timestamp)}</span>
        </div>
        <div class="history-actions">
          <button class="card-action-btn ${calc.pinned ? 'pin-active' : ''}" data-action="pin" title="Pin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${calc.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z"/></svg>
          </button>
          <button class="card-action-btn" data-action="copy" title="Copy result">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="card-action-btn danger" data-action="delete" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="pin"]')?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_PIN', id: calc.id });
      loadHistory();
    });

    card.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
      navigator.clipboard.writeText(String(calc.result)).then(() => {
        showToast('Copied!');
      });
    });

    card.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'DELETE_HISTORY_ITEM', id: calc.id });
      loadHistory();
      showToast('Deleted');
    });

    return card;
  }

  function createSnapshotCard(snapshot) {
    const card = document.createElement('div');
    card.className = 'history-card snapshot-card';
    card.dataset.id = snapshot.id;

    card.innerHTML = `
      <div class="snapshot-label">📸 ${escapeHtml(snapshot.name)}</div>
      <div class="history-values">${snapshot.formula || ''}</div>
      <div class="history-result">${formatNumber(snapshot.result)}</div>
      <div class="history-meta">
        <span class="history-page">${formatTime(snapshot.timestamp)}</span>
        <div class="history-actions">
          <button class="card-action-btn" data-action="copy" title="Copy">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button class="card-action-btn danger" data-action="delete" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `;

    card.querySelector('[data-action="copy"]')?.addEventListener('click', () => {
      navigator.clipboard.writeText(String(snapshot.result)).then(() => {
        showToast('Copied!');
      });
    });

    card.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'DELETE_SNAPSHOT', id: snapshot.id });
      loadHistory();
      showToast('Snapshot deleted');
    });

    return card;
  }

  // History filters
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyFilter = btn.dataset.filter;
      loadHistory();
    });
  });

  // Clear all
  btnClearHistory.addEventListener('click', () => {
    if (confirm('Clear all history? This cannot be undone.')) {
      chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
      loadHistory();
      showToast('History cleared');
    }
  });

  // ─── Snapshots ──────────────────────────────────────────────

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

    if (lastSavedResult) {
      await chrome.runtime.sendMessage({
        type: 'SAVE_SNAPSHOT',
        data: {
          name,
          formula: lastSavedResult.formula,
          result: lastSavedResult.value,
          values: lastSavedResult.values
        }
      });
      showToast('Snapshot saved!');
      snapshotModal.classList.add('hidden');
      lastSavedResult = null;
    }
  });

  snapshotNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSnapshotSave.click();
  });

  // ─── Paste Mode ─────────────────────────────────────────────

  btnPasteExtract.addEventListener('click', () => {
    const text = pasteTextarea.value.trim();
    if (!text) {
      showToast('Paste some data first');
      return;
    }

    const numbers = extractFromPastedData(text);
    if (numbers.length === 0) {
      showToast('No numbers found in pasted data');
      pasteResult.classList.add('hidden');
      return;
    }

    // Show preview
    pasteResult.classList.remove('hidden');
    pasteResult.innerHTML = `
      <div style="margin-bottom: 8px; font-size: 11px; color: var(--text-secondary);">
        Found <strong style="color: var(--accent);">${numbers.length}</strong> numbers:
      </div>
      <div class="card-values">
        ${numbers.map(n => `<span class="value-chip">${n}</span>`).join('')}
      </div>
      <div style="margin-top: 8px;">
        <button id="btn-paste-add" class="btn-sm btn-accent">Add as Selection</button>
      </div>
    `;

    document.getElementById('btn-paste-add').addEventListener('click', () => {
      const sel = {
        id: generateId(),
        values: numbers,
        originalTexts: numbers.map(String),
        pageTitle: 'Pasted Data',
        pageUrl: '',
        timestamp: Date.now(),
        source: 'paste'
      };

      selections.unshift(sel);
      assignLetterLabel(sel.id);
      renderSelections();
      updateFormulaRefs();

      // Also save to storage via background
      chrome.runtime.sendMessage({
        type: 'SELECTION_DATA',
        ...sel
      });

      showToast(`Added ${numbers.length} pasted values`);
      pasteTextarea.value = '';
      pasteResult.classList.add('hidden');

      // Switch to selections tab
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      tabButtons[0].classList.add('active');
      $('#tab-selections').classList.add('active');
    });
  });

  btnPasteClear.addEventListener('click', () => {
    pasteTextarea.value = '';
    pasteResult.classList.add('hidden');
  });

  function extractFromPastedData(text) {
    const numbers = [];
    // Split by tabs and newlines (Excel/Sheets format)
    const lines = text.split('\n');
    for (const line of lines) {
      const cells = line.split('\t');
      for (const cell of cells) {
        const trimmed = cell.trim();
        if (!trimmed) continue;
        // Try to extract a number
        const cleaned = trimmed.replace(/[$€£¥₹%,\s]/g, '');
        const n = parseFloat(cleaned);
        if (!isNaN(n) && isFinite(n)) {
          numbers.push(n);
        }
      }
    }
    return numbers;
  }

  // ─── Tab: History auto-load ─────────────────────────────────

  const historyTabBtn = document.querySelector('[data-tab="history"]');
  historyTabBtn?.addEventListener('click', () => {
    loadHistory();
  });

  // ─── Utilities ──────────────────────────────────────────────

  function formatNumber(n) {
    if (typeof n === 'string') n = parseFloat(n);
    if (isNaN(n)) return '—';
    // Smart formatting: integers stay as integers, decimals get up to 4 places
    if (Number.isInteger(n)) return n.toLocaleString();
    return parseFloat(n.toFixed(4)).toLocaleString(undefined, {
      maximumFractionDigits: 4
    });
  }

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function parseUrlMetadata(urlStr) {
    if (!urlStr) return null;
    try {
      const url = new URL(urlStr);
      let domain = url.hostname;
      const segments = url.pathname.split('/').filter(Boolean);
      let location = null;
      let page = null;
      
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (segments.length >= 2 && uuidRegex.test(segments[0])) {
         location = segments[0];
         page = segments[1];
      } else {
         location = segments.find(s => uuidRegex.test(s));
         if (segments.length > 0 && !location) page = segments[segments.length - 1];
      }

      const date = url.searchParams.get('date');
      return { domain, location, page, date };
    } catch (e) {
      return null;
    }
  }

  function renderCardMeta(title, urlStr) {
    if (!urlStr) return `<span class="card-meta-url">${escapeHtml(title || 'Page')}</span>`;
    const meta = parseUrlMetadata(urlStr);
    if (meta && (meta.domain || meta.location || meta.date)) {
      let html = `<div class="url-badges">`;
      if (meta.domain) html += `<span class="badge" title="${meta.domain}">${meta.domain}</span>`;
      if (meta.location) html += `<span class="badge" title="Location: ${meta.location}">${meta.location.substring(0, 8)}...</span>`;
      if (meta.page) html += `<span class="badge" title="Page">${meta.page}</span>`;
      if (meta.date) html += `<span class="badge badge-date" title="Date">📅 ${meta.date}</span>`;
      html += `</div>`;
      return html;
    }
    return `<span class="card-meta-url" title="${urlStr}">${escapeHtml(title || urlStr || 'Page')}</span>`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // ─── Init ───────────────────────────────────────────────────

  function init() {
    // Get current mode
    chrome.runtime.sendMessage({ type: 'GET_MODE' }, (response) => {
      if (response?.mode) {
        currentMode = response.mode;
        updateModeButtons();
      }
    });

    // Load stored selections into session
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (response) => {
      if (response?.selections) {
        // Restore recent selections (last 20)
        const stored = response.selections.slice(0, 20);
        for (const sel of stored.reverse()) {
          if (!selections.find(s => s.id === sel.id)) {
            selections.push(sel);
            assignLetterLabel(sel.id);
          }
        }
        selections.reverse(); // newest first
        renderSelections();
        updateFormulaRefs();
      }
    });

    // Update shortcut labels based on OS
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const dragKey = isMac ? 'Cmd+Shift+D' : 'Alt+Shift+D';
    const clickKey = isMac ? 'Cmd+Shift+C' : 'Alt+Shift+C';

    const kbdClick = document.getElementById('kbd-click');
    const kbdDrag = document.getElementById('kbd-drag');
    if (kbdClick) kbdClick.textContent = clickKey;
    if (kbdDrag) kbdDrag.textContent = dragKey;
    btnClickMode.title = `Click Mode (${clickKey})`;
    btnDragMode.title = `Drag Mode (${dragKey})`;

    renderSelections();
  }

  init();
})();
