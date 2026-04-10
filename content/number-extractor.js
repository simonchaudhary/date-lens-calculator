/**
 * content/number-extractor.js
 *
 * OWNS:
 *   - Extraction type state (extractType, extractRegex)
 *   - extractNumbers() — regex-based number parsing with smart separator detection
 *
 * DOES NOT TOUCH: DOM manipulation, overlay, highlights, modes, or messaging.
 *
 * NOTE: Content scripts share a single global scope. Variables declared here
 * (let/const at file level) are visible to all content/ files loaded after this one.
 * Load order in manifest.json must keep this file FIRST in the content scripts list.
 */

// Extraction configuration — read by mode-badge.js to populate the type selector
let extractType  = 'number'; // 'number' | 'text' | 'regex'
let extractRegex = '';

/**
 * Parse numbers from a text string according to the current extractType.
 * Returns an array of { original: string, value: number|string }.
 */
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
      return []; // Invalid regex — silently ignore
    }
  } else {
    // Match numeric patterns: integers, decimals, currency, percentages, negatives
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

    // Strip currency symbols, spaces, percentage signs
    let cleaned = original.replace(/[$€£¥₹%\s]/g, '');

    // Disambiguate thousand separators vs decimal separators
    const commaCount = (cleaned.match(/,/g) || []).length;
    const dotCount   = (cleaned.match(/\./g) || []).length;

    if (commaCount > 0 && dotCount > 0) {
      // Both present — last separator is decimal
      const lastComma = cleaned.lastIndexOf(',');
      const lastDot   = cleaned.lastIndexOf('.');
      if (lastComma > lastDot) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.'); // European: 1.234,56
      } else {
        cleaned = cleaned.replace(/,/g, '');                    // US: 1,234.56
      }
    } else if (commaCount === 1) {
      const afterComma = cleaned.split(',')[1];
      if (afterComma && afterComma.length === 3) {
        cleaned = cleaned.replace(',', '');  // thousand separator
      } else {
        cleaned = cleaned.replace(',', '.'); // decimal
      }
    } else if (commaCount > 1) {
      cleaned = cleaned.replace(/,/g, ''); // 1,234,567
    }

    const value = parseFloat(cleaned);
    if (!isNaN(value) && isFinite(value)) {
      results.push({ original, value });
    }
  }

  return results;
}
