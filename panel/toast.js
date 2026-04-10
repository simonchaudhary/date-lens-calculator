/**
 * panel/toast.js
 *
 * OWNS: The temporary toast notification shown at the bottom of the panel.
 *   - showToast(message) — displays a message for 2.5 s then hides it
 *
 * DOES NOT TOUCH: State, other DOM regions, Chrome APIs, or messaging.
 */

const toast = document.getElementById('toast');

export function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}
