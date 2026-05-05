import { getInventoryItems, deleteInventoryItem, updateInventoryItem } from '../backend/inventoryService.js';
import { getProjects } from '../backend/projectService.js';
import { SECTIONS } from '../config/propertyFields.js';
import { getAllUsers } from '../backend/userRoleService.js';
import {
  getFileExtensionLabel,
  getFileKindLabel,
  isVideoUrl,
  isVisualMediaUrl,
} from '../utils/media.js';
import {
  applyFilters,
  createEmptyFilterState,
  extractFacets,
  hasActiveFilters,
  countActiveFilters,
  SORT_OPTIONS,
} from '../utils/filterEngine.js';
import { initCreatableSelect } from '../utils/creatableSelect.js';

// ─── Module-Level State ───
let cachedItems = null;       // Raw data cache (replaces homeCacheHtml)
let cachedProjects = null;    // Projects cache
let cachedUserNameMap = {};
let cachedUserRoleMap = {};
let filterState = createEmptyFilterState();
let filterTypeMode = 'all'; // 'all' | 'properties' | 'projects'
const stalePendingHandled = new Set();

// ─── Selection State ───
let isSelectionMode = false;
let selectedPropertyIds = new Set();

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

function getNormalizedGoogleMapLink(item) {
  const googleMapsLink = String(item.googleMapsLink || '').trim();
  if (!googleMapsLink) return '';
  return /^https?:\/\//i.test(googleMapsLink) ? googleMapsLink : `https://${googleMapsLink}`;
}

function hasPinnedCoordinates(item) {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

function formatCoordinates(item) {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function getCardLocationSummary(item) {
  const tradeArea = String(item.tradeArea || '').trim();
  const city = String(item.city || '').trim();
  const areaParts = [tradeArea, city].filter(Boolean);
  if (areaParts.length > 0) {
    return areaParts.join(', ');
  }

  const manualLocation = String(item.location || '').trim();
  if (manualLocation) return manualLocation;

  const pinLabel = formatCoordinates(item);
  if (pinLabel) return pinLabel;

  const googleMapsLink = getNormalizedGoogleMapLink(item);
  if (googleMapsLink) return 'Open Google Map';

  return '';
}

function getPrimaryLocationLink(item) {
  const googleMapsLink = getNormalizedGoogleMapLink(item);
  if (googleMapsLink) return googleMapsLink;

  if (hasPinnedCoordinates(item)) {
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  const manualLocation = String(item.location || '').trim();
  if (manualLocation) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(manualLocation)}`;
  }

  return '';
}

const CARD_MEDIA_CATEGORIES = [
  'entryToBuilding',
  'buildingFacade',
  'unitFacade',
  'interior',
  'signage',
  'floorPlan',
  'presentationFile',
  'cadFiles',
];

function getCardMediaSummary(item) {
  let totalMedia = 0;
  let firstVisualUrl = '';
  let firstFallbackUrl = '';

  CARD_MEDIA_CATEGORIES.forEach((category) => {
    const urls = Array.isArray(item.images?.[category]) ? item.images[category] : [];
    totalMedia += urls.length;

    urls.forEach((url) => {
      if (!firstFallbackUrl) firstFallbackUrl = url;
      if (!firstVisualUrl && isVisualMediaUrl(url)) {
        firstVisualUrl = url;
      }
    });
  });

  return {
    totalMedia,
    firstVisualUrl,
    firstFallbackUrl,
  };
}

function renderCardThumbnail(item, visualUrl, fallbackUrl) {
  if (visualUrl) {
    if (isVideoUrl(visualUrl)) {
      return `<video src="${visualUrl}" class="card-thumbnail" muted playsinline preload="metadata"></video>`;
    }
    return `<img src="${visualUrl}" class="card-thumbnail" alt="${item.name}" loading="lazy" />`;
  }

  if (fallbackUrl) {
    return `
      <div class="card-thumbnail-file" aria-label="${getFileKindLabel(fallbackUrl)} file">
        <span class="card-thumbnail-file-ext">${getFileExtensionLabel(fallbackUrl)}</span>
        <span class="card-thumbnail-file-kind">${getFileKindLabel(fallbackUrl)}</span>
      </div>
    `;
  }

  return `
    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary)">
      <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
    </div>
  `;
}

// ─── Card Builder ───

function buildCardHtml(item, i) {
  const { totalMedia, firstVisualUrl, firstFallbackUrl } = getCardMediaSummary(item);
  const locationSummary = getCardLocationSummary(item);
  const primaryLocationLink = getPrimaryLocationLink(item);
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

  // Property occupancy status (separate from listing status)
  const propStatus = String(item.propertyStatus || '').trim();
  const isOccupied = propStatus === 'Occupied';
  const isUnderConstruction = propStatus === 'Under Construction';
  const propStatusClass = isOccupied ? 'card-occupied' : isUnderConstruction ? 'card-construction' : '';
  const isMergeable = item.mergable === true || String(item.mergable || '').toLowerCase() === 'yes';
  const isAdminViewer = ['admin', 'superadmin'].includes(window.userProfile?.role);
  const creatorRole = cachedUserRoleMap[item.createdBy] || '';
  const isAgentAdded = isAdminViewer && creatorRole === 'agent';
  const locationHtml = locationSummary
    ? `<p class="text-label ${primaryLocationLink ? 'card-location-link' : ''}" ${primaryLocationLink ? `data-map-link="${primaryLocationLink}"` : ''} style="margin-top:var(--space-xs)">${locationSummary}</p>`
    : '<p class="text-label" style="margin-top:var(--space-xs)">No location</p>';

  return `
    <div class="card card-interactive animate-enter property-card-link ${propStatusClass} ${isSelectionMode && selectedPropertyIds.has(item.id) ? 'card-selected' : ''}" data-property-id="${item.id}" style="--delay:${(i + 1) * 40}ms; position: relative; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;">
      ${isSelectionMode ? `<div class="card-check-circle ${selectedPropertyIds.has(item.id) ? 'checked' : ''}"><svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg></div>` : ''}
      <a href="#property/${item.id}" class="card-inner-link ${isSelectionMode ? 'link-disabled' : ''}" style="text-decoration: none; display: block; color: inherit;">
        <div class="card-header" style="display:flex; gap:var(--space-md); align-items:flex-start">
          <div class="card-thumbnail-wrapper property-card-thumbnail">
          ${renderCardThumbnail(item, firstVisualUrl, firstFallbackUrl)}
          ${isAgentAdded ? '<div class="agent-source-marker" title="Added by agent" aria-label="Added by agent">A</div>' : ''}
          ${isMergeable ? `
            <div class="mergeable-badge" title="Mergeable Unit" aria-label="Mergeable Unit">
              <svg class="mergeable-icon" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="10" width="38" height="30" rx="4" stroke="currentColor" stroke-width="4"/>
                <path d="M40 25H50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M45 20V30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <rect x="50" y="10" width="38" height="30" rx="4" stroke="currentColor" stroke-width="4"/>
                <path d="M92 25H114" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
                <path d="M106 17L114 25L106 33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
          ` : ''}
          ${totalMedia > 0 ? `<div class="card-photo-badge">${totalMedia}</div>` : ''}
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
          ${locationHtml}
        </div>
      </div>
      <div class="card-footer" style="display:flex;align-items:center;gap:var(--space-sm)">
        <span class="status-dot ${statusClass}"></span>
        ${isOccupied ? '<span class="badge badge-occupied">Occupied</span>' : ''}
        ${isUnderConstruction ? '<span class="badge badge-construction">Under Construction</span>' : ''}
        <span class="text-caption">${footerMeta}</span>
      </div>
      </a>
    </div>
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

// ─── Batch Action Bar HTML ───

function renderBatchActionBar(filteredItemsCount) {
  if (!isSelectionMode) return '';
  const count = selectedPropertyIds.size;
  const dis = count === 0 ? 'disabled' : '';

  return `
    <div class="selection-action-bar" id="selection-action-bar">
      <div class="sab-top">
        <span class="sab-count"><strong>${count}</strong> selected</span>
        <button class="sab-close" id="sab-exit-btn" title="Exit selection">&times;</button>
      </div>
      <div class="sab-actions">
        <button class="sab-btn" id="btn-batch-status" ${dis} title="Change Status">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"></path></svg>
          <span>Status</span>
        </button>
        <button class="sab-btn" id="btn-batch-copy" ${dis} title="Copy Summary">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
          <span>Copy</span>
        </button>
        <button class="sab-btn" id="btn-batch-share" ${dis} title="Share">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
          <span>Share</span>
        </button>
        <button class="sab-btn sab-btn-danger" id="btn-batch-delete" ${dis} title="Delete">
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          <span>Delete</span>
        </button>
      </div>
      <div class="batch-status-menu" id="batch-status-menu">
        <button class="batch-status-opt" data-status="active"><span class="status-dot status-active"></span> Active</button>
        <button class="batch-status-opt" data-status="pending"><span class="status-dot status-pending"></span> Pending</button>
        <button class="batch-status-opt" data-status="inactive"><span class="status-dot status-inactive"></span> Inactive</button>
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

  // Type filter chips (All / Properties / Projects)
  const projectCount = (cachedProjects || []).length;
  if (projectCount > 0) {
    html += `<button class="chip ${filterTypeMode === 'all' ? 'chip-active' : ''}" data-chip-type="typeMode" data-chip-value="all">All</button>`;
    html += `<button class="chip ${filterTypeMode === 'properties' ? 'chip-active' : ''}" data-chip-type="typeMode" data-chip-value="properties">Properties</button>`;
    html += `<button class="chip ${filterTypeMode === 'projects' ? 'chip-active' : ''}" data-chip-type="typeMode" data-chip-value="projects">Projects (${projectCount})</button>`;
  }

  // City chips
  facets.cities.forEach(c => {
    const isActive = filterState.cities.includes(c);
    html += `<button class="chip ${isActive ? 'chip-active' : ''}" data-chip-type="city" data-chip-value="${c}">${c}</button>`;
  });

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
  const isAdmin = ['admin', 'superadmin'].includes(window.userProfile?.role);

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
          <label class="filter-section-label">City</label>
          <div class="filter-add-row">
            <input type="text" id="adv-city-input" class="form-input" placeholder="Search or add city..." autocomplete="off" />
            <button class="filter-add-btn" id="adv-add-city">+ Add</button>
          </div>
          <div class="filter-chip-group filter-chip-group-wrap">
            ${s.cities.map(c => `<button class="chip chip-active" data-adv-type="city" data-adv-value="${c}">${c} &times;</button>`).join('')}
            ${s.cities.length === 0 ? '<span class="text-caption" style="opacity:0.4">No city filter active</span>' : ''}
          </div>
        </div>

        <div class="filter-section">
          <label class="filter-section-label">Trade Area</label>
          <div class="filter-add-row">
            <input type="text" id="adv-trade-input" class="form-input" placeholder="Search or add trade area..." autocomplete="off" />
            <button class="filter-add-btn" id="adv-add-trade">+ Add</button>
          </div>
          <div class="filter-chip-group filter-chip-group-wrap">
            ${s.tradeAreas.map(ta => `<button class="chip chip-sm chip-active" data-adv-type="tradeArea" data-adv-value="${ta}">${ta} &times;</button>`).join('')}
            ${s.tradeAreas.length === 0 ? '<span class="text-caption" style="opacity:0.4">No trade area filter active</span>' : ''}
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

  // ─── Exit selection helper ───
  function exitSelectionMode() {
    isSelectionMode = false;
    selectedPropertyIds.clear();
    renderFn();
  }

  // ─── Smooth DOM-only update (no full re-render) ───
  function syncCardUI() {
    const listEl = document.getElementById('property-list');
    if (!listEl) return;
    listEl.querySelectorAll('.property-card-link').forEach(el => {
      const id = el.dataset.propertyId;
      const selected = selectedPropertyIds.has(id);
      el.classList.toggle('card-selected', selected);
      const chk = el.querySelector('.card-check-circle');
      if (chk) chk.classList.toggle('checked', selected);
    });
    // Update counter text
    const cnt = document.querySelector('.sab-count');
    if (cnt) cnt.innerHTML = `<strong>${selectedPropertyIds.size}</strong> selected`;
    // Enable/disable action buttons
    document.querySelectorAll('.sab-btn').forEach(btn => {
      btn.disabled = selectedPropertyIds.size === 0;
    });
  }

  // ─── Header Select button: enters selection mode ───
  const toggleBtn = document.getElementById('toggle-selection-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      if (isSelectionMode) {
        exitSelectionMode();
      } else {
        isSelectionMode = true;
        renderFn();
      }
    };
  }

  // ─── Exit button inside action bar ───
  const sabExitBtn = document.getElementById('sab-exit-btn');
  if (sabExitBtn) sabExitBtn.onclick = exitSelectionMode;

  // ─── Select All / Deselect All in header (when in selection mode) ───
  const selectAllBtn = document.getElementById('sab-toggle-all-btn');
  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      const listEl = document.getElementById('property-list');
      const allIds = listEl ? Array.from(listEl.querySelectorAll('.property-card-link')).map(c => c.dataset.propertyId) : [];
      const allSelected = allIds.length > 0 && selectedPropertyIds.size === allIds.length;
      if (allSelected) {
        selectedPropertyIds.clear();
      } else {
        allIds.forEach(id => selectedPropertyIds.add(id));
      }
      syncCardUI();
      // Update the toggle label
      const newAllSelected = allIds.length > 0 && selectedPropertyIds.size === allIds.length;
      selectAllBtn.textContent = newAllSelected ? 'Deselect All' : 'Select All';
    };
  }

  // ─── Card interaction: long-press to enter + tap to toggle ───
  container.querySelectorAll('.property-card-link').forEach(el => {
    let pressTimer = null;
    let longPressFired = false;
    let startX = 0, startY = 0;

    el.addEventListener('touchstart', (e) => {
      if (isSelectionMode) return;
      longPressFired = false;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      pressTimer = setTimeout(() => {
        longPressFired = true;
        isSelectionMode = true;
        selectedPropertyIds.add(el.dataset.propertyId);
        if (navigator.vibrate) navigator.vibrate(30);
        renderFn();
      }, 500);
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (!pressTimer) return;
      const touch = e.touches[0];
      if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    }, { passive: true });

    el.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    });
    el.addEventListener('touchcancel', () => {
      clearTimeout(pressTimer);
      pressTimer = null;
    });

    // Suppress browser context menu on long-press
    el.addEventListener('contextmenu', (e) => {
      if (longPressFired || isSelectionMode) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Click handler — the <a> is disabled via CSS pointer-events in selection mode,
    // so clicks bubble directly to this div.
    el.addEventListener('click', (e) => {
      if (longPressFired) {
        e.preventDefault();
        e.stopImmediatePropagation();
        longPressFired = false;
        return;
      }
      if (isSelectionMode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const id = el.dataset.propertyId;
        if (selectedPropertyIds.has(id)) selectedPropertyIds.delete(id);
        else selectedPropertyIds.add(id);
        syncCardUI();
        const listEl = document.getElementById('property-list');
        const allIds = listEl ? Array.from(listEl.querySelectorAll('.property-card-link')).map(c => c.dataset.propertyId) : [];
        const saBtn = document.getElementById('sab-toggle-all-btn');
        if (saBtn) saBtn.textContent = (allIds.length > 0 && selectedPropertyIds.size === allIds.length) ? 'Deselect All' : 'Select All';
        if (selectedPropertyIds.size === 0) exitSelectionMode();
      } else {
        sessionStorage.setItem('home-scroll-y', String(window.scrollY || 0));
      }
    });
  });

  // ─── Block location link clicks in selection mode ───
  container.querySelectorAll('.card-location-link').forEach(el => {
    el.addEventListener('click', (event) => {
      if (isSelectionMode) { event.preventDefault(); event.stopPropagation(); return; }
      const mapLink = el.dataset.mapLink;
      if (!mapLink) return;
      event.preventDefault();
      event.stopPropagation();
      window.open(mapLink, '_blank', 'noopener');
    });
  });

  // ─── Batch Status ───
  const btnStatus = document.getElementById('btn-batch-status');
  if (btnStatus) {
    btnStatus.onclick = (e) => {
      e.stopPropagation();
      document.getElementById('batch-status-menu')?.classList.toggle('visible');
    };
  }
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('batch-status-menu');
    if (menu && menu.classList.contains('visible') && !e.target.closest('#selection-action-bar')) {
      menu.classList.remove('visible');
    }
  });
  document.querySelectorAll('.batch-status-opt').forEach(btn => {
    btn.onclick = async () => {
      const status = btn.dataset.status;
      if (selectedPropertyIds.size === 0) return;
      const ids = Array.from(selectedPropertyIds);
      import('../utils/ui.js').then(async ({ showToast }) => {
        showToast(`Updating ${ids.length} properties…`, 'info');
        exitSelectionMode();
        try {
          await Promise.all(ids.map(id => updateInventoryItem(id, { status })));
          showToast(`Updated ${ids.length} properties`, 'success');
          invalidateHomeCache();
          renderHome(container, { forceRefresh: true, preserveScroll: true, silent: true }).catch(() => {});
        } catch (err) {
          showToast('Update failed: ' + err.message, 'error');
        }
      });
    };
  });

  // ─── Batch Delete ───
  const btnDelete = document.getElementById('btn-batch-delete');
  if (btnDelete) {
    btnDelete.onclick = async () => {
      if (selectedPropertyIds.size === 0) return;
      const ids = Array.from(selectedPropertyIds);
      const uid = window.userProfile?.uid;
      const isAdmin = ['admin', 'superadmin'].includes(window.userProfile?.role);
      const unauthorized = cachedItems.filter(i => selectedPropertyIds.has(i.id) && i.createdBy !== uid && !isAdmin);
      if (unauthorized.length > 0) {
        import('../utils/ui.js').then(({ showToast }) => showToast(`No permission to delete ${unauthorized.length} properties`, 'error'));
        return;
      }
      if (!confirm(`Permanently delete ${ids.length} propert${ids.length === 1 ? 'y' : 'ies'}?`)) return;
      import('../utils/ui.js').then(async ({ showToast }) => {
        showToast(`Deleting ${ids.length} properties…`, 'info');
        cachedItems = cachedItems.filter(i => !ids.includes(i.id));
        exitSelectionMode();
        try {
          await Promise.all(ids.map(id => deleteInventoryItem(id)));
          showToast(`Deleted ${ids.length} properties`, 'success');
        } catch (err) {
          showToast('Delete failed: ' + err.message, 'error');
        }
      });
    };
  }

  // ─── Share text (matches individual property share button format) ───
  function buildShareText(item) {
    const googleMapsLink = String(item.googleMapsLink || '').trim();
    const locationValue = googleMapsLink && /^https?:\/\//i.test(googleMapsLink)
      ? googleMapsLink
      : googleMapsLink
        ? `https://${googleMapsLink}`
        : String(item.location || 'Location unavailable').trim();
    const area = item.tradeArea || 'Trade area not specified';
    const sqft = item.size ? `${item.size} sqft` : 'Size N/A';
    const rate = item.price ? `₹${item.price}/sqft` : 'Rate N/A';
    const link = `${window.location.origin}/#property/${item.id}`;
    return [
      `Property: ${item.name || 'Unnamed Property'}`,
      `Trade Area: ${area}`,
      `Location: ${locationValue}`,
      `Size: ${sqft}`,
      `Rate: ${rate}`,
      link
    ].join('\n');
  }

  // ─── Copy Summary text (matches individual property copy summary format) ───
  function buildCopySummary(item) {
    const propertySection = SECTIONS.find(s => s.id === 'property-info');
    if (!propertySection) {
      return `${item.name || 'Unnamed Property'}`;
    }

    const googleMapsLink = String(item.googleMapsLink || '').trim();
    const locationValue = googleMapsLink && /^https?:\/\//i.test(googleMapsLink)
      ? googleMapsLink
      : googleMapsLink
        ? `https://${googleMapsLink}`
        : String(item.location || '').trim() || 'N/A';

    const lines = [];
    propertySection.fields.forEach(field => {
      if (field.name === 'googleMapsLink' || field.name === 'location') return;

      if (field.type === 'file') {
        const files = item.images?.[field.name] || [];
        if (files.length > 0) {
          lines.push(`${field.label}: ${files.length} file(s)`);
        }
        return;
      }

      const rawValue = item[field.name];
      if (rawValue === undefined || rawValue === null || rawValue === '') return;

      let value = rawValue;
      if (field.type === 'number') {
        const num = Number(rawValue);
        value = Number.isFinite(num) ? num.toLocaleString('en-IN') : rawValue;
      }
      if (field.type === 'toggle') value = rawValue === 'yes' ? 'true' : 'false';

      const suffix = field.name === 'size' ? ' sqft' : '';
      lines.push(`${field.label}: ${value}${suffix}`);
    });

    lines.push(`Location Details: ${locationValue}`);

    const header = item.name || 'Unnamed Property';
    return `${header}\n\n${lines.join('\n')}`;
  }

  const btnCopy = document.getElementById('btn-batch-copy');
  if (btnCopy) {
    btnCopy.onclick = async () => {
      if (selectedPropertyIds.size === 0) return;
      const items = cachedItems.filter(i => selectedPropertyIds.has(i.id));
      const text = items.map(buildCopySummary).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
      import('../utils/ui.js').then(async ({ showToast }) => {
        try {
          await navigator.clipboard.writeText(text);
          showToast(`Copied ${items.length} propert${items.length === 1 ? 'y' : 'ies'}`, 'success');
          exitSelectionMode();
        } catch { showToast('Copy failed', 'error'); }
      });
    };
  }

  // ─── Share ───
  const btnShare = document.getElementById('btn-batch-share');
  if (btnShare) {
    btnShare.onclick = async () => {
      if (selectedPropertyIds.size === 0) return;
      const items = cachedItems.filter(i => selectedPropertyIds.has(i.id));
      const text = items.map(buildShareText).join('\n\n---\n\n');
      import('../utils/ui.js').then(async ({ showToast }) => {
        try {
          if (navigator.share) {
            await navigator.share({ title: `Footfall Properties (${items.length})`, text });
            exitSelectionMode();
          } else {
            await navigator.clipboard.writeText(text);
            showToast('Copied (share not supported)', 'success');
            exitSelectionMode();
          }
        } catch (err) {
          if (err.name !== 'AbortError') showToast('Share failed', 'error');
        }
      });
    };
  }

  // Save scroll on card click (non-selection mode handled above)
  container.querySelectorAll('.property-card-link').forEach(el => {
    el.addEventListener('click', () => {
      if (!isSelectionMode) sessionStorage.setItem('home-scroll-y', String(window.scrollY || 0));
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

  // ── Advanced Filter: City & Trade Area dropdowns ──
  let advCityCS = null;
  let advTradeCS = null;

  const advCityInput = document.getElementById('adv-city-input');
  const advTradeInput = document.getElementById('adv-trade-input');

  // Compute which trade area options to show based on currently filtered cities
  function getFilteredTradeOptions() {
    if (!cachedItems) return [];
    const rf = extractFacets(cachedItems);
    if (filterState.cities.length > 0) {
      return Array.from(new Set(filterState.cities.flatMap(c => rf.cityTradeAreaMap?.[c] || [])));
    }
    return rf.tradeAreas || [];
  }

  if (advCityInput) {
    const rf = extractFacets(cachedItems || []);
    advCityCS = initCreatableSelect(advCityInput, rf.cities || [], {
      onChange(val) {
        if (!val || filterState.cities.includes(val)) return;
        filterState.cities.push(val);
        advCityInput.value = '';
        // Update trade area dropdown with filtered options
        if (advTradeCS) advTradeCS.setOptions(getFilteredTradeOptions());
        syncAdvancedInputsToState();
        renderFn();
        openFilterPanel();
      }
    });
  }

  if (advTradeInput) {
    advTradeCS = initCreatableSelect(advTradeInput, getFilteredTradeOptions(), {
      onChange(val) {
        if (!val || filterState.tradeAreas.includes(val)) return;
        filterState.tradeAreas.push(val);
        advTradeInput.value = '';
        syncAdvancedInputsToState();
        renderFn();
        openFilterPanel();
      }
    });
  }

  // Add buttons (fallback for explicit click on "+Add")
  const bindAdvAdd = (btnId, inputId, facetKey) => {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.onclick = () => {
      const val = input.value.trim();
      if (!val || filterState[facetKey].includes(val)) return;
      filterState[facetKey].push(val);
      input.value = '';
      if (facetKey === 'cities' && advTradeCS) {
        advTradeCS.setOptions(getFilteredTradeOptions());
      }
      syncAdvancedInputsToState();
      renderFn();
      openFilterPanel();
    };
  };

  bindAdvAdd('adv-add-city', 'adv-city-input', 'cities');
  bindAdvAdd('adv-add-trade', 'adv-trade-input', 'tradeAreas');

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
      
      if (type === 'city' || type === 'tradeArea') {
        syncAdvancedInputsToState();
        renderFn();
        openFilterPanel();
      } else {
        refreshAdvancedChipStates(container);
        updateFilterResultCount();
      }
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
  // Type mode is exclusive (radio), not toggle
  if (type === 'typeMode') {
    filterTypeMode = value;
    return;
  }
  const map = {
    city: 'cities',
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

// ─── Project Card Builder ───

function buildProjectCardHtml(project, index) {
  const location = [project.tradeArea, project.city].filter(Boolean).join(', ');
  const typeBadge = project.buildingType ? `<span style="font-size:10px;padding:2px 6px;border-radius:var(--radius-sm);background:var(--bg-overlay);color:var(--text-secondary)">${project.buildingType}</span>` : '';
  const unitCount = project.unitCount || 0;
  
  // Thumbnail from building facade
  let thumbHtml = `
    <div class="card-thumbnail-wrapper">
      <div class="card-thumbnail-file">
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"/>
        </svg>
      </div>
    </div>
  `;
  const facadeImages = project.images?.buildingFacade || [];
  if (facadeImages.length > 0) {
    const first = facadeImages[0];
    const url = typeof first === 'string' ? first : first.url;
    if (url) {
      thumbHtml = `
        <div class="card-thumbnail-wrapper">
          <span class="project-badge">PROJECT</span>
          <img class="card-thumbnail" src="${url}" alt="${project.name || ''}" loading="lazy">
        </div>
      `;
    }
  } else {
    thumbHtml = `
      <div class="card-thumbnail-wrapper">
        <span class="project-badge">PROJECT</span>
        <div class="card-thumbnail-file">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"/>
          </svg>
        </div>
      </div>
    `;
  }

  return `
    <a href="#project/${project.id}" class="card card-interactive project-card animate-enter" style="--delay:${index * 60}ms; display:flex; gap:var(--space-md); align-items:center; padding:var(--space-md); text-decoration:none; cursor:pointer; position:relative; margin-bottom:var(--space-sm)">
      ${thumbHtml}
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:var(--text-sm);margin-bottom:2px">${project.name || 'Unnamed Project'}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${location || 'No location set'}</div>
        <div style="display:flex;align-items:center;gap:var(--space-sm);margin-top:4px">
          <span class="project-unit-count">${unitCount} unit${unitCount !== 1 ? 's' : ''}</span>
          ${typeBadge}
        </div>
      </div>
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="flex-shrink:0;color:var(--text-tertiary)">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </a>
  `;
}

// Merge projects into the unified feed as virtual items
function buildUnifiedFeed(standaloneFiltered, projects, filterType) {
  // Build unified list
  let unified = [];
  
  if (filterType !== 'projects') {
    unified.push(...standaloneFiltered.map(item => ({ ...item, _type: 'property' })));
  }
  
  if (filterType !== 'properties' && projects && projects.length > 0) {
    unified.push(...projects.map(p => ({ ...p, _type: 'project' })));
  }
  
  // Sort by newest first (created_at)
  unified.sort((a, b) => {
    const ta = getTimestampMillis(a.created_at);
    const tb = getTimestampMillis(b.created_at);
    return tb - ta;
  });
  
  return unified;
}

function buildUnifiedCardHtml(item, index) {
  if (item._type === 'project') return buildProjectCardHtml(item, index);
  return buildCardHtml(item, index);
}

export const invalidateHomeCache = () => {
  cachedItems = null;
  cachedProjects = null;
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

      // Dynamic facets - updated to sort by count for "Top" pills
      const rawFacets = extractFacets(visibleItems);
      const tradeAreaCounts = {};
      visibleItems.forEach(item => {
        const ta = String(item.tradeArea || '').trim();
        if (ta) tradeAreaCounts[ta] = (tradeAreaCounts[ta] || 0) + 1;
      });
      const topTradeAreas = Object.entries(tradeAreaCounts)
        .sort((a,b) => b[1] - a[1]) // highest first
        .slice(0, 6)
        .map(entry => entry[0]);

      const filtered = applyFilters(visibleItems, filterState);
      // Filter out items that belong to a project (they appear under their project card)
      const standaloneFiltered = filtered.filter(item => !item.projectId);
      const hasFilters = hasActiveFilters(filterState) || filterState.searchText || filterTypeMode !== 'all';
      
      // Build unified feed (projects + standalone properties merged by date)
      const unified = buildUnifiedFeed(standaloneFiltered, cachedProjects || [], filterTypeMode);
      const cardsHtml = unified.map((item, i) => buildUnifiedCardHtml(item, i)).join('');

      // Focus Protection: If search input is active, only update list and chips
      const searchInput = document.getElementById('home-search-input');
      const isSearching = document.activeElement === searchInput;

      if (isSearching && searchInput) {
        // Partial Update: Only update the bits that change
        const listContainer = document.getElementById('property-list');
        if (listContainer) {
          listContainer.innerHTML = unified.length > 0 ? cardsHtml : `
            <div class="empty-state animate-enter" style="--delay:100ms; padding: var(--space-xl) 0">
              <svg class="empty-state-icon" width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity:0.4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
              <h2 class="text-heading" style="font-size:16px; margin-top:var(--space-md)">No results match</h2>
              <p class="text-label" style="margin-top:var(--space-xs)">Try adjusting your search or filters</p>
              ${hasFilters ? '<button class="btn-secondary btn-sm" id="clear-all-inline" style="margin-top:var(--space-md)">Clear All Filters</button>' : ''}
            </div>
          `;
        }

        // Update result count label
        const resultLabel = container.querySelector('.text-label');
        if (resultLabel) {
          const totalShown = unified.length;
          resultLabel.textContent = `${totalShown} result${totalShown !== 1 ? 's' : ''}${hasFilters ? ` (filtered)` : ''}`;
        }

        // Update clear button visibility
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) {
          clearBtn.style.display = filterState.searchText ? 'block' : 'none';
        } else if (filterState.searchText) {
          // If clear btn was missing but needed, we might need a fuller header update or just let it be
        }

        // Update filter badge
        const filterBadge = document.querySelector('.filter-badge');
        const activeCount = countActiveFilters(filterState);
        if (filterBadge) {
          if (activeCount > 0) filterBadge.textContent = activeCount;
          else filterBadge.remove();
        } else if (activeCount > 0) {
          const filterBtn = document.getElementById('filter-panel-toggle');
          if (filterBtn) filterBtn.insertAdjacentHTML('beforeend', `<span class="filter-badge">${activeCount}</span>`);
        }

        // We skip updating the Chip Bar during active typing to avoid layout shifts / focus theft
        // but we'll attach interactions to the new cards
        
        // Update batch action bar dynamically
        const batchBar = container.querySelector('.selection-action-bar');
        if (batchBar) batchBar.remove();
        if (isSelectionMode && listContainer) {
           listContainer.insertAdjacentHTML('afterend', renderBatchActionBar(filtered.length));
        }

        attachHomeInteractions(container, reRenderFromCache);
      } else {
        // Full Render: Not currently typing, safe to overwrite
        container.innerHTML = `
          <div class="page-header animate-enter">
            <div style="display:flex; justify-content:space-between; align-items:flex-start">
              <div>
                <h1 class="text-display">Your Properties</h1>
                <div style="display:flex; align-items:center; gap:var(--space-sm)">
                  <p class="text-label">${unified.length} result${unified.length !== 1 ? 's' : ''}${hasFilters ? ' (filtered)' : ''}</p>
                  ${isOffline ? '<span class="badge" style="background:var(--destructive-dim); color:white; border:none; font-size:10px">Offline: Cached</span>' : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                ${isSelectionMode 
                  ? `<button id="sab-toggle-all-btn" class="header-select-btn">Select All</button>
                     <button id="toggle-selection-btn" class="header-select-btn header-cancel-btn">Cancel</button>`
                  : `<button id="toggle-selection-btn" class="header-select-btn">Select</button>`}
                <button class="btn-secondary dashboard-export-btn" id="export-trigger">
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                  Export
                </button>
              </div>
            </div>
            ${renderSearchBar()}
            ${renderChipBar({ ...rawFacets, tradeAreas: topTradeAreas })}
          </div>
          <div class="page-content" id="property-list">
            ${unified.length > 0 ? cardsHtml : `
              <div class="empty-state animate-enter" style="--delay:100ms; padding: var(--space-xl) 0">
                <svg class="empty-state-icon" width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="opacity:0.4"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                <h2 class="text-heading" style="font-size:16px; margin-top:var(--space-md)">No results match</h2>
                <p class="text-label" style="margin-top:var(--space-xs)">Try adjusting your search or filters</p>
                ${hasFilters ? '<button class="btn-secondary btn-sm" id="clear-all-inline" style="margin-top:var(--space-md)">Clear All Filters</button>' : ''}
              </div>
            `}
          </div>
          ${renderBatchActionBar(filtered.length)}
          ${renderAdvancedFilterPanel(rawFacets)}
        `;

        attachHomeInteractions(container, reRenderFromCache);
      }

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
    const [items, projects] = await Promise.all([
      getInventoryItems({}, () => {
        renderHome(container, { forceRefresh: true, preserveScroll: true, silent: true }).catch(() => {});
      }),
      getProjects().catch(() => [])
    ]);
    const allItems = Array.isArray(items) ? items : [];
    cachedItems = allItems;
    cachedProjects = Array.isArray(projects) ? projects : [];

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
    if (['admin', 'superadmin'].includes(window.userProfile?.role)) {
      try {
        const users = await getAllUsers();
        cachedUserNameMap = {};
        cachedUserRoleMap = {};
        users.forEach(u => {
          cachedUserNameMap[u.id] = u.displayName || u.email?.split('@')[0] || 'Unknown';
          cachedUserRoleMap[u.id] = u.role || '';
        });
      } catch { /* non-critical */ }
    } else {
      cachedUserRoleMap = {};
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
