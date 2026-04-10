/**
 * content/mode-badge.js
 *
 * OWNS:
 *   - modeBadge DOM element state
 *   - showModeBadge() — renders the fixed top-center HUD with mode label,
 *     keyboard shortcut hint, and extraction type selector
 *   - removeModeBadge() — animates the HUD out and removes it
 *
 * DOES NOT TOUCH: Overlays, highlights, click/drag mode listeners, or messaging.
 *
 * COUPLING NOTE: Reads extractType and extractRegex from number-extractor.js
 * (shared scope). Writing to those variables is done via the select/input
 * event handlers attached inside showModeBadge().
 */

let modeBadge = null;

function showModeBadge(mode) {
  removeModeBadge();

  modeBadge = document.createElement('div');
  modeBadge.className = 'datalens-mode-badge';
  modeBadge.style.display = 'flex';
  modeBadge.style.alignItems = 'center';

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  const dragKey  = isMac ? 'Option+Shift+D' : 'Alt+Shift+D';
  const clickKey = isMac ? 'Option+Shift+C' : 'Alt+Shift+C';

  const textSpan = document.createElement('span');
  textSpan.textContent = mode === 'drag'
    ? `DataLens — Drag Select Mode (${dragKey} to toggle)`
    : `DataLens — Click Mode (${clickKey} to toggle)`;

  const controls = document.createElement('div');
  controls.style.display        = 'flex';
  controls.style.alignItems     = 'center';
  controls.style.gap            = '8px';
  controls.style.marginLeft     = '12px';
  controls.style.pointerEvents  = 'auto';

  const select = document.createElement('select');
  select.className = 'datalens-extract-select';
  select.innerHTML = `
    <option value="number">Numbers</option>
    <option value="text">Text</option>
    <option value="regex">Regex</option>
  `;
  select.value = extractType; // read from number-extractor.js scope

  const input = document.createElement('input');
  input.type        = 'text';
  input.className   = 'datalens-extract-input';
  input.placeholder = '\\d+';
  input.value       = extractRegex; // read from number-extractor.js scope
  input.style.display = extractType === 'regex' ? 'block' : 'none';

  select.addEventListener('change', (e) => {
    extractType = e.target.value; // write back to number-extractor.js scope
    input.style.display = extractType === 'regex' ? 'block' : 'none';
    if (extractType === 'regex') input.focus();
  });

  input.addEventListener('input', (e) => {
    extractRegex = e.target.value; // write back to number-extractor.js scope
  });

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });

  controls.appendChild(select);
  controls.appendChild(input);
  modeBadge.appendChild(textSpan);
  modeBadge.appendChild(controls);
  document.body.appendChild(modeBadge);
}

function removeModeBadge() {
  if (modeBadge) {
    modeBadge.classList.add('datalens-badge-exit');
    const badge = modeBadge;
    setTimeout(() => badge.remove(), 250);
    modeBadge = null;
  }
}
