/**
 * panel/utils.js
 *
 * OWNS: Pure utility functions used across multiple panel modules.
 *   - formatNumber()      — locale-aware number display
 *   - formatTime()        — relative/absolute timestamp display
 *   - generateId()        — unique ID generation (panel-side copy; background has its own)
 *   - escapeHtml()        — XSS-safe string rendering
 *   - parseUrlMetadata()  — extracts domain, UUID location, slug, date from a URL
 *   - renderCardMeta()    — builds the HTML badge row shown on selection/history cards
 *
 * DOES NOT TOUCH: State, DOM outside of the escapeHtml trick, Chrome APIs, or messaging.
 */

export function formatNumber(n) {
  if (typeof n === 'string') n = parseFloat(n);
  if (isNaN(n)) return '—';
  if (Number.isInteger(n)) return n.toLocaleString();
  return parseFloat(n.toFixed(4)).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  const d    = new Date(timestamp);
  const now  = new Date();
  const diff = now - d;

  if (diff < 60000)    return 'just now';
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function parseUrlMetadata(urlStr) {
  if (!urlStr) return null;
  try {
    const url      = new URL(urlStr);
    const domain   = url.hostname;
    const segments = url.pathname.split('/').filter(Boolean);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let location = null;
    let page     = null;

    if (segments.length >= 2 && uuidRegex.test(segments[0])) {
      location = segments[0];
      page     = segments[1];
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

export function renderCardMeta(title, urlStr) {
  if (!urlStr) return `<span class="card-meta-url">${escapeHtml(title || 'Page')}</span>`;
  const meta = parseUrlMetadata(urlStr);
  if (meta && (meta.domain || meta.location || meta.date)) {
    let html = `<div class="url-badges">`;
    if (meta.domain)   html += `<span class="badge" title="${meta.domain}">${meta.domain}</span>`;
    if (meta.location) html += `<span class="badge" title="Location: ${meta.location}">${meta.location.substring(0, 8)}...</span>`;
    if (meta.page)     html += `<span class="badge" title="Page">${meta.page}</span>`;
    if (meta.date)     html += `<span class="badge badge-date" title="Date">📅 ${meta.date}</span>`;
    html += `</div>`;
    return html;
  }
  return `<span class="card-meta-url" title="${urlStr}">${escapeHtml(title || urlStr || 'Page')}</span>`;
}
