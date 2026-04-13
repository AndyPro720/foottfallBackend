// ─── Creatable Select Component ───
// Transforms a plain <input> into a searchable dropdown that also allows custom values.
// Used for City and Trade Area fields across the app.

/**
 * Initialize a creatable-select dropdown on an input element.
 * @param {HTMLInputElement} input - The target input
 * @param {string[]} options - Array of suggestion strings
 * @param {Object} [config]
 * @param {function(string):void} [config.onChange] - Called when a value is picked/created
 * @returns {{ setOptions(opts: string[]): void, destroy(): void, getValue(): string }}
 */
export function initCreatableSelect(input, options = [], config = {}) {
  // ── Build wrapper around the input ──
  const wrapper = document.createElement('div');
  wrapper.className = 'cs-wrap';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  input.classList.add('cs-input');
  input.setAttribute('autocomplete', 'off');

  // Dropdown arrow
  const arrow = document.createElement('div');
  arrow.className = 'cs-arrow';
  arrow.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
  wrapper.appendChild(arrow);

  // Dropdown panel
  const dropdown = document.createElement('div');
  dropdown.className = 'cs-dropdown';
  wrapper.appendChild(dropdown);

  let currentOptions = [...options];
  let highlightIdx = -1;
  let isOpen = false;

  function getFilteredItems(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return currentOptions.slice(); // show all
    return currentOptions.filter(o => o.toLowerCase().includes(q));
  }

  function render(query) {
    const q = (query || '').trim();
    const filtered = getFilteredItems(q);
    const exactMatch = currentOptions.some(o => o.toLowerCase() === q.toLowerCase());

    let html = '';
    filtered.forEach((opt, i) => {
      const cls = i === highlightIdx ? 'cs-opt cs-hl' : 'cs-opt';
      // Highlight matching substring
      let label = opt;
      if (q) {
        const idx = opt.toLowerCase().indexOf(q.toLowerCase());
        if (idx >= 0) {
          label = opt.slice(0, idx) + '<strong>' + opt.slice(idx, idx + q.length) + '</strong>' + opt.slice(idx + q.length);
        }
      }
      html += `<div class="${cls}" data-value="${opt}">${label}</div>`;
    });

    // "Create new" option
    if (q && !exactMatch) {
      const cls = filtered.length === highlightIdx ? 'cs-opt cs-create cs-hl' : 'cs-opt cs-create';
      html += `<div class="${cls}" data-value="${q}">+ Add "<em>${q}</em>"</div>`;
    }

    if (!html) {
      html = '<div class="cs-empty">Start typing…</div>';
    }

    dropdown.innerHTML = html;
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    highlightIdx = -1;
    render(input.value);
    dropdown.classList.add('cs-open');
    wrapper.classList.add('cs-active');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    dropdown.classList.remove('cs-open');
    wrapper.classList.remove('cs-active');
    highlightIdx = -1;
  }

  function selectValue(val) {
    input.value = val;
    close();
    if (config.onChange) config.onChange(val);
    // Fire standard events so other listeners (e.g. city→tradeArea dependency) work
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ── Events ──

  function onInputFocus() { open(); }

  function onInputInput() {
    highlightIdx = -1;
    if (!isOpen) open();
    render(input.value);
  }

  function onArrowClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) { close(); input.blur(); }
    else { input.focus(); }
  }

  function onDropdownMousedown(e) {
    e.preventDefault(); // prevent blur
    const opt = e.target.closest('.cs-opt');
    if (opt && opt.dataset.value !== undefined) {
      selectValue(opt.dataset.value);
    }
  }

  function onInputKeydown(e) {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        open();
      }
      return;
    }

    const items = dropdown.querySelectorAll('.cs-opt');
    const count = items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, count - 1);
      applyHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, -1);
      applyHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIdx >= 0 && items[highlightIdx]) {
        selectValue(items[highlightIdx].dataset.value);
      } else if (input.value.trim()) {
        selectValue(input.value.trim());
      }
    } else if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  }

  function applyHighlight(items) {
    items.forEach((el, i) => el.classList.toggle('cs-hl', i === highlightIdx));
    if (highlightIdx >= 0 && items[highlightIdx]) {
      items[highlightIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function onDocClick(e) {
    if (!wrapper.contains(e.target)) close();
  }

  // Attach
  input.addEventListener('focus', onInputFocus);
  input.addEventListener('input', onInputInput);
  input.addEventListener('keydown', onInputKeydown);
  arrow.addEventListener('mousedown', onArrowClick);
  dropdown.addEventListener('mousedown', onDropdownMousedown);
  document.addEventListener('mousedown', onDocClick);

  return {
    setOptions(newOpts) {
      currentOptions = [...newOpts];
      if (isOpen) render(input.value);
    },
    getValue() { return input.value; },
    destroy() {
      input.removeEventListener('focus', onInputFocus);
      input.removeEventListener('input', onInputInput);
      input.removeEventListener('keydown', onInputKeydown);
      arrow.removeEventListener('mousedown', onArrowClick);
      dropdown.removeEventListener('mousedown', onDropdownMousedown);
      document.removeEventListener('mousedown', onDocClick);
      wrapper.parentNode.insertBefore(input, wrapper);
      wrapper.remove();
      input.classList.remove('cs-input');
    }
  };
}
