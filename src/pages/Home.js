import { getInventoryItems } from '../backend/inventoryService.js';

export const renderHome = async (container) => {
  // Show skeleton while loading
  container.innerHTML = `
    <div class="page-header">
      <h1 class="text-display">Your Properties</h1>
      <p class="text-label">Loading inventory...</p>
    </div>
    <div class="page-content">
      ${[0,1,2].map(i => `<div class="skeleton skeleton-card animate-enter" style="--delay:${i * 80}ms"></div>`).join('')}
    </div>
  `;

  try {
    const items = await getInventoryItems({}, (newItems) => {
      import('../utils/ui.js').then(({ showToast }) => {
        showToast('Updated data available', 'info', {
          text: 'Refresh',
          onClick: () => renderHome(container)
        });
      });
    });
    const isOffline = !navigator.onLine;

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
      return;
    }

    const cardsHtml = items.map((item, i) => {
      // Calculate total photos across all categories
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

      return `
        <a href="#property/${item.id}" class="card card-interactive animate-enter" style="--delay:${(i + 1) * 60}ms; text-decoration: none; display: block; color: inherit;">
          <div class="card-header" style="display:flex; gap:var(--space-md); align-items:flex-start">
            <div class="card-thumbnail-wrapper">
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
                  ${item.price ? `<span class="badge">₹${Number(item.price).toLocaleString('en-IN')}</span>` : ''}
                  ${item.syncPending ? `<span class="badge badge-sync">Sync Pending</span>` : ''}
                </div>
              </div>
              <p class="text-label" style="margin-top:var(--space-xs)">${item.location || 'No location'}</p>
            </div>
          </div>
          <div class="card-footer" style="display:flex;align-items:center;gap:var(--space-sm)">
            <span class="status-dot status-active"></span>
            <span class="text-caption">${item.buildingType || 'Property'} · ${item.size ? item.size + ' sqft' : 'Size N/A'}</span>
            ${window.userProfile?.role === 'admin' ? `
              <span class="text-caption" style="margin-left:auto; opacity:0.6; font-style:italic;">by ${item.creatorName || item.creatorEmail || item.createdBy || 'Unknown'}</span>
            ` : ''}
          </div>
        </a>
      `;
    }).join('');

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
          <button class="btn-secondary" id="export-trigger" style="width:auto; padding: 8px 16px; min-height:0; display:flex; gap: 8px; font-size: 13px;">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Export to Website
          </button>
        </div>
      </div>
      <div class="page-content">
        ${cardsHtml}
      </div>
    `;

    // ─── Export Trigger Handler ───
    document.getElementById('export-trigger').onclick = async () => {
      const btn = document.getElementById('export-trigger');
      const { showToast } = await import('../utils/ui.js');
      btn.disabled = true;
      btn.textContent = 'Exporting...';
      
      try {
        // Manual trigger Cloud Function
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
};
