/**
 * content/dom-utils.js
 *
 * OWNS:
 *   - Extracting text from DOM elements (preferring direct text nodes)
 *   - Filtering a set of matched elements to remove nested duplicates
 *   - AABB overlap detection between two DOMRect-like objects
 *   - Querying elements that fall within a rectangular screen region
 *
 * DOES NOT TOUCH: Extraction state (extractType/extractRegex), highlights,
 *   overlays, badges, messaging, or mode state.
 *
 * All functions are pure relative to DOM state — no side effects.
 */

/**
 * Get text content from an element, preferring direct text nodes.
 * Avoids pulling text from large nested structures that fall outside the
 * drag selection rectangle.
 * @returns {{ text: string, hasDirectText: boolean }}
 */
function getDirectTextContent(el) {
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

  if (hasDirectText) return { text: text.trim(), hasDirectText: true };

  // No direct text — fall back to full textContent, but skip elements that
  // contain complex nested blocks (the data inside would be outside the rect).
  if (el.querySelector('table, div, p, ul, ol, dl, section, article, tr, tbody')) {
    return { text: '', hasDirectText: false };
  }

  return { text: (el.textContent || '').trim(), hasDirectText: false };
}

/**
 * Remove elements that are ancestors of other elements in the matched set,
 * unless they have direct text of their own.
 */
function filterMatchedElements(matched) {
  const filtered = [];
  for (const item of matched) {
    if (item.hasDirectText) {
      filtered.push(item);
    } else {
      const containsAnother = matched.some(
        m => m.element !== item.element && item.element.contains(m.element)
      );
      if (!containsAnother) filtered.push(item);
    }
  }
  return filtered;
}

/**
 * Returns true if the two rect-like objects overlap.
 */
function rectsOverlap(r1, r2) {
  return !(r1.right < r2.left || r1.left > r2.right ||
           r1.bottom < r2.top || r1.top > r2.bottom);
}

/**
 * Query all leaf-ish elements whose bounding rect overlaps rectBounds.
 * rectBounds is a { left, top, right, bottom } object in viewport coordinates.
 * @returns {Array<{ element, text, hasDirectText }>}
 */
function getElementsInRect(rectBounds) {
  const elements = [];
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
