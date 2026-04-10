/**
 * panel/formula-parser.js
 *
 * OWNS:
 *   - evaluateMath(expr) — CSP-safe recursive descent parser for arithmetic
 *     expressions (+, -, *, /, parentheses, unary minus).
 *   - parseAndEvalFormula(expr, selections, selectionLetters) — resolves
 *     [A], [B], … references to selection sums, validates character set,
 *     then delegates evaluation to evaluateMath().
 *
 * DOES NOT TOUCH: DOM, state, Chrome APIs, messaging, or history storage.
 *
 * CSP CONSTRAINT: Never use eval() or new Function() here.
 *   This parser is the only safe alternative inside the extension.
 *
 * TIGHT COUPLING NOTE (documented, not fixed): parseAndEvalFormula() must
 *   receive selections and selectionLetters from the caller (calculator.js)
 *   because the formula references [A], [B], etc. that map to those structures.
 *   The parser itself is pure; only the reference resolution requires external data.
 */

/**
 * Evaluate a pure arithmetic expression string (no [A] references).
 * Supported: integers, floats, +, -, *, /, (, ), unary minus.
 * @throws {Error} if the expression is invalid or produces a non-finite result
 */
export function evaluateMath(expr) {
  const tokens = expr.match(/\d*\.\d+|\d+|[-+*/()]/g);
  if (!tokens) return 0;
  let pos = 0;

  function parseExpression() {
    let result = parseTerm();
    while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
      const op = tokens[pos++];
      const right = parseTerm();
      if (op === '+') result += right;
      else            result -= right;
    }
    return result;
  }

  function parseTerm() {
    let result = parseFactor();
    while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
      const op    = tokens[pos++];
      const right = parseFactor();
      if (op === '*') result *= right;
      else            result /= right;
    }
    return result;
  }

  function parseFactor() {
    if (pos >= tokens.length) return 0;
    const token = tokens[pos++];
    if (token === '(') {
      const result = parseExpression();
      if (pos < tokens.length && tokens[pos] === ')') pos++;
      return result;
    }
    if (token === '-') return -parseFactor();
    if (token === '+') return  parseFactor();
    return parseFloat(token);
  }

  const result = parseExpression();
  if (typeof result !== 'number' || !isFinite(result)) {
    throw new Error('Result is not a valid number');
  }
  return result;
}

/**
 * Resolve [A], [B] references to selection sums, validate the expression,
 * and return the numeric result.
 * @param {string} expr - the raw formula string, e.g. "[A] * 0.9 - [B]"
 * @param {Array}  selections - the current selections array from state
 * @param {Object} selectionLetters - map of id → letter from state
 * @throws {Error} if a reference is missing, characters are invalid, or math fails
 */
export function parseAndEvalFormula(expr, selections, selectionLetters) {
  // Replace [A], [B], … with their selection sum values
  let processed = expr.replace(/\[([A-Z])\]/g, (match, letter) => {
    const selId = Object.keys(selectionLetters).find(k => selectionLetters[k] === letter);
    if (!selId) throw new Error(`Selection [${letter}] not found`);
    const sel = selections.find(s => s.id === selId);
    if (!sel)  throw new Error(`Selection [${letter}] not found`);
    const sum = sel.values.reduce((a, b) => a + b, 0);
    return `(${sum})`;
  });

  // Safety: only allow numbers, operators, parentheses, spaces, dots
  if (!/^[\d\s+\-*/().]+$/.test(processed)) {
    throw new Error('Invalid characters in formula');
  }

  return evaluateMath(processed);
}
