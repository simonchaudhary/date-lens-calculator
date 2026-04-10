/**
 * shared/generate-id.js
 *
 * OWNS: Unique ID generation used by both background storage and panel.
 * DOES NOT TOUCH: Any Chrome APIs, DOM, or storage.
 */

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}
