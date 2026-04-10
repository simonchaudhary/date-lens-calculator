/**
 * content/highlights.js
 *
 * OWNS:
 *   - highlightedElements state array
 *   - clearHighlights() — removes the datalens-highlight class from all tracked elements
 *
 * DOES NOT TOUCH: Overlays, badges, extraction logic, modes, or messaging.
 *   Applying highlights is done by drag-mode.js; this module only manages removal.
 */

// Tracks every element currently wearing the datalens-highlight class
let highlightedElements = [];

function clearHighlights() {
  for (const el of highlightedElements) {
    el.classList.remove('datalens-highlight');
  }
  highlightedElements = [];
}
