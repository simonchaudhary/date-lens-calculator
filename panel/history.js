/**
 * panel/history.js
 *
 * OWNS:
 *   - loadHistory() — fetches calculations + selections from background
 *   - loadSnapshots() — fetches snapshots from background
 *   - renderHistory() — filters and renders history/snapshot cards
 *   - createHistoryCard() — calculation card with pin, copy, delete
 *   - createSnapshotCard() — snapshot card with copy, delete
 *   - Filter buttons (All / Pinned / Snapshots)
 *   - Clear All history button
 *
 * DOES NOT TOUCH: Selections state, calculator values, paste mode, or snapshots
 *   storage directly (delegates to background via messages).
 */

import { state } from './state.js';
import { formatNumber, formatTime, escapeHtml, renderCardMeta } from './utils.js';
import { showToast } from './toast.js';

// DOM refs
const historyEmpty    = document.getElementById('history-empty');
const historyList     = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');
const filterButtons   = document.querySelectorAll('.filter-btn');

// ─── Load & Render ───────────────────────────────────────────────────────────

export async function loadHistory() {
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
  if (state.historyFilter === 'all') {
    items = calculations.map(c => ({ ...c, _type: 'calculation' }));
  } else if (state.historyFilter === 'pinned') {
    items = calculations.filter(c => c.pinned).map(c => ({ ...c, _type: 'calculation' }));
  } else if (state.historyFilter === 'snapshots') {
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

// ─── History Card ────────────────────────────────────────────────────────────

function createHistoryCard(calc) {
  const card      = document.createElement('div');
  card.className  = `history-card${calc.pinned ? ' pinned' : ''}`;
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
    navigator.clipboard.writeText(String(calc.result)).then(() => showToast('Copied!'));
  });

  card.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'DELETE_HISTORY_ITEM', id: calc.id });
    loadHistory();
    showToast('Deleted');
  });

  return card;
}

// ─── Snapshot Card ───────────────────────────────────────────────────────────

function createSnapshotCard(snapshot) {
  const card      = document.createElement('div');
  card.className  = 'history-card snapshot-card';
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
    navigator.clipboard.writeText(String(snapshot.result)).then(() => showToast('Copied!'));
  });

  card.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'DELETE_SNAPSHOT', id: snapshot.id });
    loadHistory();
    showToast('Snapshot deleted');
  });

  return card;
}

// ─── Filters & Clear ─────────────────────────────────────────────────────────

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.historyFilter = btn.dataset.filter;
    loadHistory();
  });
});

btnClearHistory.addEventListener('click', () => {
  if (confirm('Clear all history? This cannot be undone.')) {
    chrome.runtime.sendMessage({ type: 'CLEAR_HISTORY' });
    loadHistory();
    showToast('History cleared');
  }
});

// Auto-load when history tab is clicked
document.querySelector('[data-tab="history"]')?.addEventListener('click', () => {
  loadHistory();
});
