/**
 * shared/message-types.js
 *
 * OWNS: All chrome.runtime message type constants used across the extension.
 * DOES NOT TOUCH: Any logic, storage, UI, or DOM.
 *
 * Import this in background/ and panel/ modules.
 * Content scripts cannot use ES-module imports, so they reference these
 * strings directly — keep this file as the single source of truth and
 * update content scripts if you rename a constant here.
 */

export const MSG = {
  // content → background → panel
  SELECTION_DATA:           'SELECTION_DATA',
  SELECTION_DATA_FORWARDED: 'SELECTION_DATA_FORWARDED',

  // panel ↔ background ↔ content
  SET_MODE:         'SET_MODE',
  GET_MODE:         'GET_MODE',
  MODE_CHANGED:     'MODE_CHANGED',
  GET_CURRENT_MODE: 'GET_CURRENT_MODE',
  PING:             'PING',

  // panel → background (storage)
  SAVE_CALCULATION:  'SAVE_CALCULATION',
  GET_HISTORY:       'GET_HISTORY',
  DELETE_HISTORY_ITEM: 'DELETE_HISTORY_ITEM',
  TOGGLE_PIN:        'TOGGLE_PIN',
  CLEAR_HISTORY:     'CLEAR_HISTORY',
  SAVE_SNAPSHOT:     'SAVE_SNAPSHOT',
  GET_SNAPSHOTS:     'GET_SNAPSHOTS',
  DELETE_SNAPSHOT:   'DELETE_SNAPSHOT',
};
