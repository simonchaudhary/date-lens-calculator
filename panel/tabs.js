/**
 * panel/tabs.js
 *
 * OWNS:
 *   - Tab button click handling (switches active tab)
 *   - switchToTab(tabName) — programmatic tab switch used by other modules
 *     (e.g. selections.js switches to 'selections' after a new extraction)
 *
 * DOES NOT TOUCH: State, Chrome APIs, selection data, or calculator values.
 */

const tabButtons  = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    switchToTab(btn.dataset.tab);
  });
});

export function switchToTab(tabName) {
  tabButtons.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));

  const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const tab = document.getElementById(`tab-${tabName}`);
  if (btn) btn.classList.add('active');
  if (tab) tab.classList.add('active');
}
