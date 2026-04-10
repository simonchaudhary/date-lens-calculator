/**
 * panel/state.js
 *
 * OWNS: The single shared mutable state object for the panel.
 *
 * DOES NOT TOUCH: Any DOM, Chrome APIs, or business logic.
 *
 * All panel modules import this object and read/mutate its properties directly.
 * Because JS exports are live bindings to the same object, mutations made in
 * one module are immediately visible to all other importers.
 *
 * TIGHT COUPLING NOTE (documented, not fixed): selections and calculatorValues
 * are tightly coupled — calculatorValues entries hold {sourceId, idx} references
 * into selections. Deleting a value from a selection must shift idx references
 * in calculatorValues. This coupling lives in selections.js and is flagged there.
 */

export const state = {
  selections:      [],   // Array of selection objects (newest first)
  calculatorValues: [],  // Array of { value, sourceId, idx } currently in calculator
  currentMode:     'off',
  historyFilter:   'all',
  selectionLetters: {},  // Map: selection id → letter label ('A'–'Z')
  lastSavedResult:  null // Cached result for the snapshot modal
};
