import { getInventoryItems, updateInventoryItem } from '../backend/inventoryService.js';
import { getAllUsers } from '../backend/userRoleService.js';
import {
  applyFilters,
  createEmptyFilterState,
  extractFacets,
  hasActiveFilters,
  countActiveFilters,
  SORT_OPTIONS,
} from '../utils/filterEngine.js';

// ─── Module-Level State ───
let cachedItems = null;       // Raw data cache (replaces homeCacheHtml)
let cachedUserNameMap = {};
let filterState = createEmptyFilterState();
const stalePendingHandled = new Set();

function getTimestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const num = Number(ts);
  return Number.isFinite(num) ? num : 0;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatINR(value) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function getDisplayLocation(item) {
  const tradeArea = String(item.tradeArea || '').trim();
  if (tradeArea) return tradeArea;
  return '';
}

function getMapLink(item) {
  const googleMapsLink = String(item.googleMapsLink || '').trim();
  if (googleMapsLink) {
    return /^https?:\/\//i.test(googleMapsLink) ? googleMapsLink : `https://${googleMapsLink}`;
  }
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }
  const locationText = String(item.location || '').trim();
  if (locationText) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText)}`;
  }
  return '';
}

// ─── Card Builder ───

function buildCardHtml(item, i, userNameMap) {
  const categories = ['buildingFacade', 'unitFacade', 'interior', 'signage', 'floorPlan'];
  let totalPhotos = 0;
  let firstThumb = null;

  if (item.images) {
    categories.forEach(cat => {
      if (Array.from(item.images[cat] || []).length > 0) {
        totalPhotos += item.images[cat].length;
        if (!firstThumb) firstThumb = item.images[cat][0];
      }
    });
  }

  const displayLocation = getDisplayLocation(item);
  const mapLink = getMapLink(item);
  const size = toFiniteNumber(item.size);
  const perSqft = toFiniteNumber(item.price);
  const hasSize = size !== null && size > 0;
  const hasPerSqft = perSqft !== null && perSqft > 0;
  const totalRent = hasSize && hasPerSqft ? size * perSqft : null;
  const sizeLabel = hasSize ? `${size} sqft` : 'Size N/A';
  const floorText = String(item.floor || '').trim();
  const floorLabel = floorText ? `Floor ${floorText}` : 'Floor N/A';
  const rateLabel = hasPerSqft ? `${formatINR(perSqft)}/sqft` : 'Rate N/A';
  const footerMeta = [sizeLabel, floorLabel, rateLabel].join(' · ');
  const hasBackgroundUpload = Boolean(item.mediaUploadPending);
  const hasOfflineSync = Boolean(item.syncPending) && !navigator.onLine;
  const normalizedStatus = String(item.status || 'active').toLowerCase();
  const statusClass = normalizedStatus === 'active'
    ? 'status-active'
    : normalizedStatus === 'pending'
      ? 'status-pending'
      : 'status-inactive';

  return `
    <a href="#property/${item.id}" class="card card-interactive animate-enter property-card-link" style="--delay:${(i + 1) * 40}ms; text-decoration: none; display: block; color: inherit;">
      <div class="card-header" style="display:flex; gap:var(--space-md); align-items:flex-start">
        <div class="card-thumbnail-wrapper property-card-thumbnail">
          ${firstThumb ? `
            <img src="${firstThumb}" class="card-thumbnail" alt="${item.name}" loading="lazy" />
          ` : `
            <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary)">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
          `}
          ${totalPhotos > 0 ? `<div class="card-photo-badge">${totalPhotos}</div>` : ''}
        </div>
        <div style="flex:1">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap: 8px;">
            <h3 class="text-subheading">${item.name || 'Unnamed Property'}</h3>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap: var(--space-xs);">
              ${totalRent ? `<span class="badge badge-rent">${formatINR(totalRent)}</span>` : ''}
              ${!totalRent && hasPerSqft ? `<span class="badge">${formatINR(perSqft)}/sqft</span>` : ''}
              ${hasBackgroundUpload ? `<span class="badge badge-sync">Media Pending</span>` : ''}
              ${!hasBackgroundUpload && hasOfflineSync ? `<span class="badge badge-sync">Sync Pending</span>` : ''}
            </div>
          </div>
          ${displayLocation
            ? `<p class="text-label ${mapLink ? 'card-location-link' : ''}" ${mapLink ? `data-map-link="${mapLink}"` : ''} style="margin-top:var(--space-xs)">${displayLocation}</p>`
            : '<p class="text-label" style="margin-top:var(--space-xs)">No location</p>'
          }
        </div>
      </div>
      <div class="card-footer" style="display:flex;align-items:center;gap:var(--space-sm)">
        <span class="status-dot ${statusClass}"></span>
        <span class="text-caption">${footerMeta}</span>
        ${window.userProfile?.role === 'admin' ? `
          <span class="text-caption" style="margin-left:auto; opacity:0.6; font-style:italic;">by ${item.creatorName || item.creatorEmail?.split('@')[0] || userNameMap[item.createdBy] || 'Unknown Agent'}</span>
        ` : ''}
      </div>
    </a>
  `;
}

// ─── Search Bar HTML ───

function renderSearchBar() {
  const activeCount = countActiveFilters(filterState);
  return `
    <div class="search-bar-container">
      <div class="search-bar">
        <svg class="search-bar-icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
        <input type="text" class="search-bar-input" id="home-search-input" placeholder="Search properties..." value="${filterState.searchText}" autocomplete="off" />
        ${filterState.searchText ? `<button class="search-bar-clear" id="search-clear-btn" type="button">&times;</button>` : ''}
        <button class="search-bar-filter-btn" id="filter-panel-toggle" type="button">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
          ${activeCount > 0 ? `<span class="filter-badge">${activeCount}</span>` : ''}
        </button>
      </div>
    </div>
  `;
}

// ─── Chip Bar HTML ───

function renderChipBar(facets) {
  const currentSort = SORT_OPTIONS.find(o => o.key === filterState.sortKey) || SORT_OPTIONS[0];

  // Sort pill
  let html = `<div class="chip-bar-container"><div class="chip-bar" id="chip-bar">`;
  html += `<button class="chip chip-sort" id="sort-pill">
    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12"></path></svg>
    ${currentSort.label}
  </button>`;

  // Sort dropdown (hidden by default)
  html += `<div class="sort-dropdown" id="sort-dropdown">`;
  SORT_OPTIONS.forEach(opt => {
    html += `<button class="sort-option ${opt.key === filterState.sortKey ? 'active' : ''}" data-sort-key="${opt.key}">${opt.label}</button>`;
  });
  html += `</div>`;

  // Building Type chips
  facets.buildingTypes.forEach(bt => {
    const isActive = filterState.buildingTypes.includes(bt);
    html += `<button class="chip ${isActive ? 'chip-active' : ''}" data-chip-type="buildingType" data-chip-value="${bt}">${bt}</button>`;
  });

  // Property Status chips
  facets.propertyStatuses.forEach(ps => {
    const isActive = filterState.propertyStatuses.includes(ps);
    html += `<button class="chip ${isActive ? 'chip-active' : ''}" data-chip-type="propertyStatus" data-chip-value="${ps}">${ps}</button>`;
  });

  // Trade Area chips (show first 5 to avoid overflow)
  facets.tradeAreas.slice(0, 6).forEach(ta => {
    const isActive = filterState.tradeAreas.includes(ta);
    html += `<button class="chip ${isActive ? 'chip-active' : ''}" data-chip-type="tradeArea" data-chip-value="${ta}">${ta}</button>`;
  });

  html += `</div></div>`;
  return html;
}

// ─── Advanced Filter Bottom Sheet ───

function renderAdvancedFilterPanel(facets) {
  const s = filterState;
  const isAdmin = window.userProfile?.role === 'admin';

  return `
    <div class="filter-overlay" id="filter-overlay"></div>
    <div class="filter-panel" id="filter-panel">
      <div class="filter-panel-header">
        <h3 class="text-subheading">Advanced Filters</h3>
        <button class="filter-panel-close" id="filter-panel-close">&times;</button>
      </div>
      <div class="filter-panel-body">

        <div class="filter-section">
          <label class="filter-section-label">Building Type</label>
          <div class="filter-chip-group">
            ${['Mall', 'Standalone', 'High Street'].map(bt => `
              <button class="chip ${s.buildingTypes.includes(bt) ? 'chip-active' : ''}" data-adv-type="buildingType" data-adv-value="${bt}">${bt}</button>
            `).join('')}
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Property Status</label>
          <div class="filter-chip-group">
            ${['Occupied', 'Available', 'Under Construction'].map(ps => `
              <button class="chip ${s.propertyStatuses.includes(ps) ? 'chip-active' : ''}" data-adv-type="propertyStatus" data-adv-value="${ps}">${ps}</button>
            `).join('')}
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Trade Area</label>
          <div class="filter-chip-group filter-chip-group-wrap">
            ${facets.tradeAreas.map(ta => `
              <button class="chip chip-sm ${s.tradeAreas.includes(ta) ? 'chip-active' : ''}" data-adv-type="tradeArea" data-adv-value="${ta}">${ta}</button>
            `).join('')}
            ${facets.tradeAreas.length === 0 ? '<span class="text-caption" style="opacity:0.5">No trade areas found</span>' : ''}
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Price Range (₹/sqft)</label>
          <div class="filter-range-row">
            <input type="number" class="form-input filter-range-input" id="adv-price-min" placeholder="Min" value="${s.priceMin ?? ''}" />
            <span class="text-caption">to</span>
            <input type="number" class="form-input filter-range-input" id="adv-price-max" placeholder="Max" value="${s.priceMax ?? ''}" />
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Size Range (sqft)</label>
          <div class="filter-range-row">
            <input type="number" class="form-input filter-range-input" id="adv-size-min" placeholder="Min" value="${s.sizeMin ?? ''}" />
            <span class="text-caption">to</span>
            <input type="number" class="form-input filter-range-input" id="adv-size-max" placeholder="Max" value="${s.sizeMax ?? ''}" />
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Floor</label>
          <input type="text" class="form-input" id="adv-floor" placeholder="e.g., Ground, 1st" value="${s.floor}" />
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Suitable For</label>
          <input type="text" class="form-input" id="adv-suitable-for" placeholder="e.g., F&B, Retail" value="${s.suitableFor}" />
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Mezzanine</label>
          <div class="filter-chip-group">
            ${['any', 'yes', 'no'].map(v => `
              <button class="chip ${s.mezzanine === v ? 'chip-active' : ''}" data-adv-type="mezzanine" data-adv-value="${v}">${v === 'any' ? 'Any' : v === 'yes' ? 'Yes' : 'No'}</button>
            `).join('')}
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Has Photos</label>
          <div class="filter-chip-group">
            ${['any', 'yes', 'no'].map(v => `
              <button class="chip ${s.hasPhotos === v ? 'chip-active' : ''}" data-adv-type="hasPhotos" data-adv-value="${v}">${v === 'any' ? 'Any' : v === 'yes' ? 'Yes' : 'No'}</button>
            `).join('')}
          </div>
        </div>

        ${isAdmin ? `
          <div class="filter-section">
            <label class="filter-section-label">Created By</label>
            <div class="filter-chip-group filter-chip-group-wrap">
              ${Object.entries(cachedUserNameMap).map(([uid, name]) => `
                <button class="chip chip-sm ${s.createdByUids.includes(uid) ? 'chip-active' : ''}" data-adv-type="createdBy" data-adv-value="${uid}">${name}</button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div class="filter-panel-footer">
        <span class="text-caption filter-result-count" id="filter-result-count"></span>
        <div style="display:flex; gap:var(--space-sm)">
          <button class="btn-secondary btn-sm" id="filter-clear-all">Clear All</button>
          <button class="btn-primary btn-sm" id="filter-apply">Apply Filters</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Interaction Attachment ───

let debounceTimer = null;

function attachHomeInteractions(container, renderFn) {
  // Location link clicks
  container.querySelectorAll('.card-location-link').forEach(el => {
    el.addEventListener('click', (event) => {
      const mapLink = el.dataset.mapLink;
      if (!mapLink) return;
      event.preventDefault();
      event.stopPropagation();
      window.open(mapLink, '_blank', 'noopener');
    });
  });

  // Save scroll on card click
  container.querySelectorAll('.property-card-link').forEach(el => {
    el.addEventListener('click', () => {
      sessionStorage.setItem('home-scroll-y', String(window.scrollY || 0));
    });
  });

  // Export button
  const exportBtn = document.getElementById('export-trigger');
  if (exportBtn) {
    exportBtn.onclick = async () => {
      const { showToast } = await import('../utils/ui.js');
      exportBtn.disabled = true;
      exportBtn.textContent = 'Exporting...';
      try {
        const response = await fetch('https://asia-south1-footfall-inventory.cloudfunctions.net/exportInventoryToJSON');
        showToast(response.ok ? 'Website inventory updated!' : 'Export failed.', response.ok ? 'success' : 'error');
      } catch {
        showToast('Export failed. Check internet connection.', 'error');
      } finally {
        exportBtn.disabled = false;
        exportBtn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Export`;
      }
    };
  }

  // Search input
  const searchInput = document.getElementById('home-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        filterState.searchText = searchInput.value;
        renderFn();
      }, 150);
    });
    // Focus the search input if there's text (state restored)
    if (filterState.searchText) {
      requestAnimationFrame(() => {
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      });
    }
  }

  // Search clear
  const searchClearBtn = document.getElementById('search-clear-btn');
  if (searchClearBtn) {
    searchClearBtn.onclick = () => {
      filterState.searchText = '';
      renderFn();
    };
  }

  // Sort pill
  const sortPill = document.getElementById('sort-pill');
  const sortDropdown = document.getElementById('sort-dropdown');
  if (sortPill && sortDropdown) {
    sortPill.onclick = (e) => {
      e.stopPropagation();
      sortDropdown.classList.toggle('show');
    };
    sortDropdown.querySelectorAll('.sort-option').forEach(opt => {
      opt.onclick = (e) => {
        e.stopPropagation();
        filterState.sortKey = opt.dataset.sortKey;
        sortDropdown.classList.remove('show');
        renderFn();
      };
    });
    // Close sort dropdown on outside click
    document.addEventListener('click', () => sortDropdown.classList.remove('show'), { once: true });
  }

  // Quick-filter chips
  container.querySelectorAll('[data-chip-type]').forEach(chip => {
    chip.onclick = () => {
      const type = chip.dataset.chipType;
      const value = chip.dataset.chipValue;
      toggleChipFilter(type, value);
      renderFn();
    };
  });

  // Filter panel toggle
  const filterToggle = document.getElementById('filter-panel-toggle');
  const filterPanel = document.getElementById('filter-panel');
  const filterOverlay = document.getElementById('filter-overlay');
  if (filterToggle && filterPanel && filterOverlay) {
    filterToggle.onclick = () => openFilterPanel();
    filterOverlay.onclick = () => closeFilterPanel();
    document.getElementById('filter-panel-close').onclick = () => closeFilterPanel();
  }

  // Advanced filter chip clicks
  container.querySelectorAll('[data-adv-type]').forEach(chip => {
    chip.onclick = () => {
      const type = chip.dataset.advType;
      const value = chip.dataset.advValue;
      if (type === 'mezzanine' || type === 'hasPhotos') {
        // Single-select toggle
        if (type === 'mezzanine') filterState.mezzanine = value;
        if (type === 'hasPhotos') filterState.hasPhotos = value;
      } else if (type === 'createdBy') {
        toggleArrayFilter('createdByUids', value);
      } else {
        toggleChipFilter(type, value);
      }
      // Re-render just the panel chips to show active state
      refreshAdvancedChipStates(container);
      updateFilterResultCount();
    };
  });

  // Range inputs (update on change for live count)
  ['adv-price-min', 'adv-price-max', 'adv-size-min', 'adv-size-max', 'adv-floor', 'adv-suitable-for'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        syncAdvancedInputsToState();
        updateFilterResultCount();
      });
    }
  });

  // Clear All
  const clearAllBtn = document.getElementById('filter-clear-all');
  if (clearAllBtn) {
    clearAllBtn.onclick = () => {
      const searchText = filterState.searchText;
      const sortKey = filterState.sortKey;
      filterState = createEmptyFilterState();
      filterState.searchText = searchText;
      filterState.sortKey = sortKey;
      closeFilterPanel();
      renderFn();
    };
  }

  // Apply Filters
  const applyBtn = document.getElementById('filter-apply');
  if (applyBtn) {
    applyBtn.onclick = () => {
      syncAdvancedInputsToState();
      closeFilterPanel();
      renderFn();
    };
  }
}

function toggleChipFilter(type, value) {
  const map = {
    buildingType: 'buildingTypes',
    propertyStatus: 'propertyStatuses',
    tradeArea: 'tradeAreas',
  };
  const key = map[type];
  if (!key) return;
  const idx = filterState[key].indexOf(value);
  if (idx >= 0) {
    filterState[key].splice(idx, 1);
  } else {
    filterState[key].push(value);
  }
}

function toggleArrayFilter(key, value) {
  const idx = filterState[key].indexOf(value);
  if (idx >= 0) {
    filterState[key].splice(idx, 1);
  } else {
    filterState[key].push(value);
  }
}

function syncAdvancedInputsToState() {
  const priceMin = document.getElementById('adv-price-min')?.value;
  const priceMax = document.getElementById('adv-price-max')?.value;
  const sizeMin = document.getElementById('adv-size-min')?.value;
  const sizeMax = document.getElementById('adv-size-max')?.value;
  filterState.priceMin = priceMin ? Number(priceMin) : null;
  filterState.priceMax = priceMax ? Number(priceMax) : null;
  filterState.sizeMin = sizeMin ? Number(sizeMin) : null;
  filterState.sizeMax = sizeMax ? Number(sizeMax) : null;
  filterState.floor = document.getElementById('adv-floor')?.value || '';
  filterState.suitableFor = document.getElementById('adv-suitable-for')?.value || '';
}

function refreshAdvancedChipStates(container) {
  container.querySelectorAll('[data-adv-type]').forEach(chip => {
    const type = chip.dataset.advType;
    const value = chip.dataset.advValue;
    let isActive = false;
    if (type === 'mezzanine') isActive = filterState.mezzanine === value;
    else if (type === 'hasPhotos') isActive = filterState.hasPhotos === value;
    else if (type === 'createdBy') isActive = filterState.createdByUids.includes(value);
    else if (type === 'buildingType') isActive = filterState.buildingTypes.includes(value);
    else if (type === 'propertyStatus') isActive = filterState.propertyStatuses.includes(value);
    else if (type === 'tradeArea') isActive = filterState.tradeAreas.includes(value);
    chip.classList.toggle('chip-active', isActive);
  });
}

function updateFilterResultCount() {
  const el = document.getElementById('filter-result-count');
  if (!el || !cachedItems) return;
  const currentUid = window.userProfile?.uid || '';
  const visibleItems = cachedItems.filter(item => {
    const status = String(item.status || 'active').toLowerCase();
    if (status === 'active') return true;
    return Boolean(currentUid) && item.createdBy === currentUid;
  });
  const filtered = applyFilters(visibleItems, filterState);
  el.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
}

function openFilterPanel() {
  document.getElementById('filter-panel')?.classList.add('open');
  document.getElementById('filter-overlay')?.classList.add('open');
  document.body.style.overflow = 'hidden';
  updateFilterResultCount();
}

function closeFilterPanel() {
  document.getElementById('filter-panel')?.classList.remove('open');
  document.getElementById('filter-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Cache & Exports ───

export const invalidateHomeCache = () => {
  cachedItems = null;
};

window.__invalidateHomeCache = invalidateHomeCache;
window.__hasHomeCache = () => cachedItems !== null;

// ─── Main Render ───

export const renderHome = async (container, options = {}) => {
  const forceRefresh = options.forceRefresh === true;
  const preserveScroll = options.preserveScroll === true;
  const silent = options.silent === true;
  const currentScroll = window.scrollY || 0;

  // Fast re-render from data cache
  const reRenderFromCache = () => {
    if (!cachedItems) return;
    const currentUid = window.userProfile?.uid || '';
    const visibleItems = cachedItems.filter(item => {
      const status = String(item.status || 'active').toLowerCase();
      if (status === 'active') return true;
      return Boolean(currentUid) && item.createdBy === currentUid;
    });
    const isOffline = !navigator.onLine;
    const facets = extractFacets(visibleItems);
    const filtered = applyFilters(visibleItems, filterState);
    const hasFilters = hasActiveFilters(filterState) || filterState.searchText;
    const cardsHtml = filtered.map((item, i) => buildCardHtml(item, i, cachedUserNameMap)).join('');

    container.innerHTML = `
      <div class="page-header animate-enter">
        <div style="display:flex; justify-content:space-between; align-items:flex-start">
          <div>
            <h1 class="text-display">Your Properties</h1>
            <div style="display:flex; align-items:center; gap:var(--space-sm)">
              <p class="text-label">${filtered.length}${hasFilters ? ` of ${visibleItems.length}` : ''} propert${filtered.length === 1 ? 'y' : 'ies'}</p>
              ${isOffline ? '<span class="badge" style="background:var(--destructive-dim); color:white; border:none; font-size:10px">Offline: Cached</span>' : ''}
            </div>
          </div>
          <button class="btn-secondary dashboard-export-btn" id="export-trigger">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Export
          </button>
        </div>
        ${renderSearchBar()}
        ${renderChipBar(facets)}
      </div>
      <div class="page-content" id="property-list">
        ${filtered.length > 0 ? cardsHtml : `
          <div class="empty-state animate-enter" style="--delay:100ms; padding: var(--space-xl) 0">
            <svg class="empty-state-icon" width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity:0.4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            <h2 class="text-heading" style="font-size:16px; margin-top:var(--space-md)">No properties match</h2>
            <p class="text-label" style="margin-top:var(--space-xs)">Try adjusting your search or filters</p>
            ${hasFilters ? '<button class="btn-secondary btn-sm" id="clear-all-inline" style="margin-top:var(--space-md)">Clear All Filters</button>' : ''}
          </div>
        `}
      </div>
      ${renderAdvancedFilterPanel(facets)}
    `;

    attachHomeInteractions(container, reRenderFromCache);

    // Inline "Clear All" inside empty state
    const clearAllInline = document.getElementById('clear-all-inline');
    if (clearAllInline) {
      clearAllInline.onclick = () => {
        filterState = createEmptyFilterState();
        reRenderFromCache();
      };
    }
  };

  // If we have cached data and this is NOT a forced refresh, re-render immediately
  if (cachedItems && !forceRefresh) {
    reRenderFromCache();
    if (preserveScroll) {
      requestAnimationFrame(() => window.scrollTo({ top: currentScroll, left: 0, behavior: 'auto' }));
    }
    // Background refresh
    setTimeout(() => {
      renderHome(container, { forceRefresh: true, preserveScroll: true, silent: true }).catch(() => {});
    }, 0);
    return;
  }

  // Show skeleton only if no cached data
  if (!(silent && cachedItems)) {
    container.innerHTML = `
      <div class="page-header">
        <h1 class="text-display">Your Properties</h1>
        <p class="text-label">Loading inventory...</p>
      </div>
      <div class="page-content">
        ${[0, 1, 2].map(i => `<div class="skeleton skeleton-card animate-enter" style="--delay:${i * 80}ms"></div>`).join('')}
      </div>
    `;
  }

  try {
    const items = await getInventoryItems({}, () => {
      renderHome(container, { forceRefresh: true, preserveScroll: true, silent: true }).catch(() => {});
    });
    const allItems = Array.isArray(items) ? items : [];
    cachedItems = allItems;

    // Stale pending cleanup
    if (navigator.onLine) {
      const now = Date.now();
      const stalePendingItems = allItems.filter(item => {
        if (!item?.id || !item.mediaUploadPending || item.syncPending) return false;
        if (stalePendingHandled.has(item.id)) return false;
        const updatedAt = getTimestampMillis(item.updated_at) || getTimestampMillis(item.created_at);
        return updatedAt && (now - updatedAt) > (2 * 60 * 1000);
      });
      if (stalePendingItems.length > 0) {
        stalePendingItems.forEach(item => stalePendingHandled.add(item.id));
        Promise.allSettled(
          stalePendingItems.map(item => updateInventoryItem(item.id, { mediaUploadPending: false }))
        ).then(() => {
          invalidateHomeCache();
          renderHome(container, { forceRefresh: true, preserveScroll: true, silent: true }).catch(() => {});
        }).catch(() => {});
      }
    }

    // Admin user name map
    if (window.userProfile?.role === 'admin') {
      try {
        const users = await getAllUsers();
        users.forEach(u => {
          cachedUserNameMap[u.id] = u.displayName || u.email?.split('@')[0] || 'Unknown';
        });
      } catch { /* non-critical */ }
    }

    const currentUid = window.userProfile?.uid || '';
    const visibleItems = allItems.filter(item => {
      const status = String(item.status || 'active').toLowerCase();
      if (status === 'active') return true;
      return Boolean(currentUid) && item.createdBy === currentUid;
    });

    if (visibleItems.length === 0) {
      const isOffline = !navigator.onLine;
      container.innerHTML = `
        <div class="page-header animate-enter">
          <h1 class="text-display">Your Properties</h1>
          ${isOffline ? '<p class="text-label" style="color:var(--destructive)">Offline Mode: No cached data found.</p>' : '<p class="text-label">Welcome to Foottfall Inventory</p>'}
        </div>
        <div class="empty-state animate-enter" style="--delay:100ms">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
          </svg>
          <h2 class="text-heading">No Inventory Yet</h2>
          <p class="text-label" style="margin-top:var(--space-sm);margin-bottom:var(--space-lg)">Start building your retail property portfolio.<br>Tap below to register your first unit.</p>
          <a href="#add" class="btn-primary" style="width:auto;padding:14px 32px">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m-6-6h12"></path></svg>
            Register New Property
          </a>
        </div>
      `;
      return;
    }

    // Full render with search/filter/sort
    reRenderFromCache();

  } catch (err) {
    console.error('Dashboard error:', err);
    container.innerHTML = `
      <div class="page-header animate-enter">
        <h1 class="text-display">Your Properties</h1>
      </div>
      <div class="card card-error animate-enter" style="--delay:100ms">
        <div class="card-header"><h3 class="text-subheading">Connection Error</h3></div>
        <div class="card-body"><p class="text-body">Unable to connect to backend. Please check your connection.</p></div>
        <div class="card-footer">
          <button class="btn-secondary" onclick="window.location.reload()">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            Retry
          </button>
        </div>
      </div>
    `;
  }

  if (preserveScroll) {
    requestAnimationFrame(() => window.scrollTo({ top: currentScroll, left: 0, behavior: 'auto' }));
  }
};
