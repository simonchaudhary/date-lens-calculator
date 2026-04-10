/**
 * content/auto-expand.js
 *
 * OWNS:
 *   - autoExpandSelection() — entry point, tries two strategies in order
 *   - tryExpandTableColumn() — table column/row expansion strategy
 *   - tryExpandByClassAndAlignment() — shared CSS class + alignment strategy
 *   - findNearestCommonParent() — lowest common ancestor traversal
 *
 * DOES NOT TOUCH: Extraction state, highlights, overlays, badges, modes,
 *   or messaging. Reads DOM but never modifies it.
 *
 * COUPLING NOTE: Calls getDirectTextContent() from dom-utils.js (shared scope).
 *
 * TIGHT COUPLING NOTE (unfixable here): Both strategies require live DOM queries
 * (getBoundingClientRect, querySelectorAll) and cannot be made into pure functions
 * without a DOM environment. They are extracted here to isolate the heuristic logic
 * from the drag mode event loop.
 */

/**
 * Given the elements initially matched by a drag, attempt to expand the selection
 * to a full column, row, or class-aligned set.
 * @param {Array<{element, text, hasDirectText}>} matched
 * @param {{left, top, right, bottom}} rectBounds
 * @returns {Array<{element, text, hasDirectText}>} additional items (no duplicates with matched)
 */
function autoExpandSelection(matched, rectBounds) {
  if (matched.length < 2) return [];

  const dragW = rectBounds.right  - rectBounds.left;
  const dragH = rectBounds.bottom - rectBounds.top;
  const dragDirection = dragH >= dragW ? 'vertical' : 'horizontal';

  const tableResult = tryExpandTableColumn(matched, dragDirection);
  if (tableResult.length > 0) return tableResult;

  const classResult = tryExpandByClassAndAlignment(matched, dragDirection);
  if (classResult.length > 0) return classResult;

  return [];
}

// ─── Strategy 1: Table Column / Row ─────────────────────────────────────────

function tryExpandTableColumn(matched, dragDirection) {
  const cells = matched.filter(m => m.element.tagName === 'TD' || m.element.tagName === 'TH');
  if (cells.length < 2) return [];

  const tables = new Set(cells.map(m => m.element.closest('table')));
  if (tables.size !== 1) return [];

  const table = tables.values().next().value;

  if (dragDirection === 'horizontal') {
    // All cells must be in the same row
    const rows = new Set(cells.map(m => m.element.parentNode));
    if (rows.size !== 1) return [];
    const row = rows.values().next().value;
    const expanded = [];
    for (const cell of row.children) {
      const info = getDirectTextContent(cell);
      if (info.text) expanded.push({ element: cell, text: info.text, hasDirectText: info.hasDirectText });
    }
    return expanded;
  }

  // Vertical: all cells must share the same column index
  const firstCell  = cells[0].element;
  const columnIndex = Array.from(firstCell.parentNode.children).indexOf(firstCell);
  const allSameColumn = cells.every(m => {
    const idx = Array.from(m.element.parentNode.children).indexOf(m.element);
    return idx === columnIndex;
  });
  if (!allSameColumn) return [];

  const expanded = [];
  for (const row of table.querySelectorAll('tr')) {
    const cell = row.children[columnIndex];
    if (cell) {
      const info = getDirectTextContent(cell);
      if (info.text) expanded.push({ element: cell, text: info.text, hasDirectText: info.hasDirectText });
    }
  }
  return expanded;
}

// ─── Strategy 2: Shared CSS Class + Alignment ────────────────────────────────

function tryExpandByClassAndAlignment(matched, dragDirection) {
  const elements = matched.map(m => m.element);

  // All matched elements must share the same tag name
  const tagName = elements[0].tagName;
  if (!elements.every(el => el.tagName === tagName)) return [];

  const commonParent = findNearestCommonParent(elements);
  if (!commonParent) return [];

  // Find classes shared by ALL matched elements (excluding datalens-internal classes)
  const classSets = elements.map(el =>
    [...el.classList].filter(c => !c.startsWith('datalens-'))
  );
  const commonClasses = classSets[0].filter(cls =>
    classSets.every(set => set.includes(cls))
  );

  const selector = commonClasses.length > 0
    ? `${tagName.toLowerCase()}.${commonClasses[0]}`
    : tagName.toLowerCase();

  // Compute the bounding band of the already-matched elements
  const matchedRects = elements.map(el => el.getBoundingClientRect());
  const bandLeft   = Math.min(...matchedRects.map(r => r.left))   - 10;
  const bandRight  = Math.max(...matchedRects.map(r => r.right))  + 10;
  const bandTop    = Math.min(...matchedRects.map(r => r.top))    - 10;
  const bandBottom = Math.max(...matchedRects.map(r => r.bottom)) + 10;

  const candidates = commonParent.querySelectorAll(selector);
  const expanded = [];
  for (const el of candidates) {
    const rect    = el.getBoundingClientRect();
    const centerX = rect.left + rect.width  / 2;
    const centerY = rect.top  + rect.height / 2;

    // Vertical drag → keep only candidates in the same horizontal band (same column)
    if (dragDirection === 'vertical'   && (centerX < bandLeft  || centerX > bandRight))  continue;
    // Horizontal drag → keep only candidates in the same vertical band (same row)
    if (dragDirection === 'horizontal' && (centerY < bandTop   || centerY > bandBottom)) continue;

    const info = getDirectTextContent(el);
    if (info.text) expanded.push({ element: el, text: info.text, hasDirectText: info.hasDirectText });
  }
  return expanded;
}

// ─── Helper ──────────────────────────────────────────────────────────────────

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
    if (elements.every(el => ancestor.contains(el))) return ancestor;
  }
  return document.body;
}
