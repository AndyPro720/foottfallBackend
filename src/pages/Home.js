import { getInventoryItems, updateInventoryItem } from '../backend/inventoryService.js';
import { getAllUsers } from '../backend/userRoleService.js';

let homeCacheHtml = '';
const stalePendingHandled = new Set();

function getTimestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const num = Number(ts);
  return Number.isFinite(num) ? num : 0;
}

function renderCachedHome(container, preserveScroll = false) {
  const currentScroll = window.scrollY || 0;
  container.innerHTML = homeCacheHtml;
  attachHomeInteractions(container);
  if (preserveScroll) {
    requestAnimationFrame(() => {
      window.scrollTo({ top: currentScroll, left: 0, behavior: 'auto' });
    });
  }
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

function attachHomeInteractions(container) {
  container.querySelectorAll('.card-location-link').forEach((locationEl) => {
    locationEl.addEventListener('click', (event) => {
      const mapLink = locationEl.dataset.mapLink;
      if (!mapLink) return;
      event.preventDefault();
      event.stopPropagation();
      window.open(mapLink, '_blank', 'noopener');
    });
  });

  container.querySelectorAll('.property-card-link').forEach((cardEl) => {
    cardEl.addEventListener('click', () => {
      sessionStorage.setItem('home-scroll-y', String(window.scrollY || 0));
    });
  });

  const exportBtn = document.getElementById('export-trigger');
  if (!exportBtn) return;

  exportBtn.onclick = async () => {
    const btn = document.getElementById('export-trigger');
    const { showToast } = await import('../utils/ui.js');
    btn.disabled = true;
    btn.textContent = 'Exporting...';

    try {
      const response = await fetch('https://asia-south1-footfall-inventory.cloudfunctions.net/exportInventoryToJSON');
      if (response.ok) {
        showToast('Website inventory updated!', 'success');
      } else {
        showToast('Export failed. Check logic or permissions.', 'error');
      }
    } catch (err) {
      showToast('Export failed. Check internet connection.', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
        Export to Website
      `;
    }
  };
}

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

  return `
    <a href="#property/${item.id}" class="card card-interactive animate-enter property-card-link" style="--delay:${(i + 1) * 60}ms; text-decoration: none; display: block; color: inherit;">
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
        <span class="status-dot status-active"></span>
        <span class="text-caption">${footerMeta}</span>
        ${window.userProfile?.role === 'admin' ? `
          <span class="text-caption" style="margin-left:auto; opacity:0.6; font-style:italic;">by ${item.creatorName || item.creatorEmail?.split('@')[0] || userNameMap[item.createdBy] || 'Unknown Agent'}</span>
        ` : ''}
      </div>
    </a>
  `;
}

export const invalidateHomeCache = () => {
  homeCacheHtml = '';
};

window.__invalidateHomeCache = invalidateHomeCache;
window.__hasHomeCache = () => Boolean(homeCacheHtml);

export const renderHome = async (container, options = {}) => {
  const useCache = options.useCache !== false;
  const forceRefresh = options.forceRefresh === true;
  const preserveScroll = options.preserveScroll === true;
  const silent = options.silent === true;

  if (useCache && !forceRefresh && homeCacheHtml) {
    renderCachedHome(container, preserveScroll);
    // Always refresh in background so sync/media badges do not get stale.
    setTimeout(() => {
      renderHome(container, { useCache: false, forceRefresh: true, preserveScroll: true, silent: true }).catch((err) => {
        console.warn('Silent home refresh failed:', err);
      });
    }, 0);
    return;
  }

  const currentScroll = window.scrollY || 0;
  if (!(silent && homeCacheHtml)) {
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
    const items = await getInventoryItems({}, (newItems) => {
      if (!Array.isArray(newItems)) return;
      // Auto-refresh to latest while preserving user scroll.
      renderHome(container, { useCache: false, forceRefresh: true, preserveScroll: true, silent: true }).catch(() => {});
    });
    const isOffline = !navigator.onLine;

    if (!isOffline) {
      const now = Date.now();
      const stalePendingItems = items.filter((item) => {
        if (!item?.id) return false;
        if (!item.mediaUploadPending) return false;
        if (item.syncPending) return false;
        if (stalePendingHandled.has(item.id)) return false;
        const updatedAt = getTimestampMillis(item.updated_at) || getTimestampMillis(item.created_at);
        if (!updatedAt) return false;
        return (now - updatedAt) > (2 * 60 * 1000);
      });

      if (stalePendingItems.length > 0) {
        stalePendingItems.forEach((item) => stalePendingHandled.add(item.id));
        Promise.allSettled(
          stalePendingItems.map((item) => updateInventoryItem(item.id, { mediaUploadPending: false }))
        ).then(() => {
          if (typeof window.__invalidateHomeCache === 'function') {
            window.__invalidateHomeCache();
          }
          renderHome(container, { useCache: false, forceRefresh: true, preserveScroll: true, silent: true }).catch(() => {});
        }).catch(() => {});
      }
    }

    let userNameMap = {};
    if (window.userProfile?.role === 'admin') {
      try {
        const users = await getAllUsers();
        users.forEach(u => {
          userNameMap[u.id] = u.displayName || u.email?.split('@')[0] || 'Unknown';
        });
      } catch (e) {
        // non-critical
      }
    }

    if (!items || items.length === 0) {
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
      homeCacheHtml = container.innerHTML;
      attachHomeInteractions(container);
      return;
    }

    const cardsHtml = items.map((item, i) => buildCardHtml(item, i, userNameMap)).join('');

    container.innerHTML = `
      <div class="page-header animate-enter">
        <div style="display:flex; justify-content:space-between; align-items:flex-start">
          <div>
            <h1 class="text-display">Your Properties</h1>
            <div style="display:flex; align-items:center; gap:var(--space-sm)">
              <p class="text-label">${items.length} propert${items.length === 1 ? 'y' : 'ies'} in your portfolio</p>
              ${isOffline ? '<span class="badge" style="background:var(--destructive-dim); color:white; border:none; font-size:10px">Offline: Cached</span>' : ''}
            </div>
          </div>
          <button class="btn-secondary dashboard-export-btn" id="export-trigger">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Export to Website
          </button>
        </div>
      </div>
      <div class="page-content">
        ${cardsHtml}
      </div>
    `;

    homeCacheHtml = container.innerHTML;
    attachHomeInteractions(container);
  } catch (err) {
    console.error('Dashboard error:', err);
    container.innerHTML = `
      <div class="page-header animate-enter">
        <h1 class="text-display">Your Properties</h1>
      </div>
      <div class="card card-error animate-enter" style="--delay:100ms">
        <div class="card-header">
          <h3 class="text-subheading">Connection Error</h3>
        </div>
        <div class="card-body">
          <p class="text-body">Unable to connect to backend. Please check your connection.</p>
        </div>
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
    requestAnimationFrame(() => {
      window.scrollTo({ top: currentScroll, left: 0, behavior: 'auto' });
    });
  }
};
