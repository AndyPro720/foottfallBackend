import { getInventoryItemById, updateInventoryItem, deleteInventoryItem } from '../backend/inventoryService.js';
import { SECTIONS } from '../config/propertyFields.js';

export const renderPropertyDetail = async (container, id) => {
  // Show skeleton while loading
  container.innerHTML = `
    <div class="page-header">
      <div class="skeleton skeleton-text" style="width:60%;height:32px"></div>
      <div class="skeleton skeleton-text" style="width:30%;height:16px;margin-top:8px"></div>
    </div>
    <div class="page-content">
      ${[0, 1, 2, 3].map(i => `<div class="skeleton skeleton-card animate-enter" style="--delay:${i * 80}ms; height:120px"></div>`).join('')}
    </div>
  `;

  try {
    const item = await getInventoryItemById(id);

    if (!item) {
      container.innerHTML = `
        <div class="page-header animate-enter">
          <h1 class="text-display">404</h1>
          <p class="text-label">Property Not Found</p>
        </div>
        <div class="card card-error animate-enter" style="--delay:100ms">
          <div class="card-header">
            <h3 class="text-subheading">Missing Property</h3>
          </div>
          <div class="card-body">
            <p class="text-body">The property you are looking for doesn't exist or has been removed.</p>
          </div>
          <div class="card-footer">
            <a href="#" class="btn-secondary">Back to Dashboard</a>
          </div>
        </div>
      `;
      return;
    }

    // ─── Render Sections ───
    const sectionsHtml = SECTIONS.map(section => {
      if (section.id === 'photos') return renderPhotoGallery(item);

      const fieldsHtml = section.fields.map(field => {
        const value = item[field.name];
        
        if (field.type === 'toggle') {
          return `
            <div class="detail-item">
              <span class="text-label">${field.label}</span>
              <span class="badge ${value ? 'badge-success' : 'badge-neutral'}">${value ? 'Yes' : 'No'}</span>
              ${field.hasCount && value && item[`${field.name}Count`] ? `
                <span class="text-caption">(${item[`${field.name}Count`]} spots)</span>
              ` : ''}
              ${field.hasPhoto && value && item[`${field.name}Photo`] ? `
                <div class="facility-photo-mini" onclick="window.openLightbox('${item[`${field.name}Photo`]}')">
                  <img src="${item[`${field.name}Photo`]}" alt="${field.label}" />
                </div>
              ` : ''}
            </div>
          `;
        }

        if (field.type === 'facilityPhoto') return ''; // Handled within toggle above

        if (!value) return '';

        return `
          <div class="detail-item">
            <span class="text-label">${field.label}</span>
            <span class="text-body">${field.type === 'number' && field.name === 'price' ? '₹' + Number(value).toLocaleString('en-IN') : value}${field.name === 'size' ? ' sqft' : ''}</span>
          </div>
        `;
      }).join('');

      if (!fieldsHtml) return '';

      return `
        <div class="card animate-enter" style="margin-bottom: var(--space-md)">
          <div class="card-header">
            <h3 class="text-subheading" style="color: var(--accent-green)">${section.title}</h3>
          </div>
          <div class="card-body detail-grid">
            ${fieldsHtml}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="page-header animate-enter">
        <div style="display:flex; justify-content:space-between; align-items:flex-start">
          <div>
            <h1 class="text-display">${item.name}</h1>
            <p class="text-label">${item.location}</p>
          </div>
          <div class="status-select-wrapper">
            <select id="status-select" class="badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}" style="text-transform: capitalize; border: 1px solid var(--border-default); cursor: pointer; appearance: none; padding-right: 24px;">
              <option value="active" ${item.status === 'active' ? 'selected' : ''}>Active</option>
              <option value="pending" ${(item.status === 'pending' || !item.status) ? 'selected' : ''}>Pending</option>
              <option value="inactive" ${item.status === 'inactive' ? 'selected' : ''}>Inactive</option>
            </select>
            <svg class="select-chevron" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; width: 12px; height: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
          </div>
        </div>
        <div style="margin-top: var(--space-md)">
          <a href="#" class="btn-secondary" style="width:auto; padding: 8px 16px; min-height: 0;">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            Back
          </a>
        </div>
      </div>
      <div class="page-content">
        ${sectionsHtml}
        
        <div style="margin-top: var(--space-xl); display: flex; gap: var(--space-md)">
           <a href="#edit/${item.id}" class="btn-secondary" style="flex:1">Edit Details</a>
           <button class="btn-secondary destructive" style="flex:1; border-color: var(--destructive); color: var(--destructive)" id="delete-btn">Delete Property</button>
        </div>
      </div>
    `;

    // ─── Lightbox logic ───
    window.openLightbox = (src) => {
      const overlay = document.createElement('div');
      overlay.className = 'lightbox-overlay active';
      overlay.innerHTML = `
        <img src="${src}" class="lightbox-img" />
        <button class="lightbox-close">&times;</button>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('.lightbox-close').onclick = () => overlay.remove();
      overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
    };

    // ─── Status update handler ───
    const statusSelect = document.getElementById('status-select');
    statusSelect.onchange = async () => {
      const newStatus = statusSelect.value;
      const { showToast } = await import('../main.js');
      try {
        await updateInventoryItem(id, { status: newStatus });
        showToast(`Status updated to ${newStatus}`, 'success');
        // Update badge class
        statusSelect.className = `badge ${newStatus === 'active' ? 'badge-success' : 'badge-neutral'}`;
      } catch (err) {
        showToast('Failed to update status', 'error');
      }
    };

    // ─── Delete handler ───
    document.getElementById('delete-btn').onclick = async () => {
      const { showToast } = await import('../main.js');
      if (confirm('Are you sure you want to delete this property? This action is permanent.')) {
        try {
          await deleteInventoryItem(id);
          showToast('Property deleted successfully', 'success');
          window.location.hash = '#';
        } catch (err) {
          showToast('Failed to delete property', 'error');
        }
      }
    };

  } catch (err) {
    console.error('Detail view error:', err);
    container.innerHTML = `<div class="card card-error">Error loading details.</div>`;
  }
};

function renderPhotoGallery(item) {
  const photoCategories = [
    { key: 'buildingFacade', label: 'Building Facade' },
    { key: 'unitFacade', label: 'Unit Facade' },
    { key: 'interior', label: 'Interior' },
    { key: 'signage', label: 'Signage' },
    { key: 'floorPlan', label: 'Floor Plan' }
  ];

  const categoriesHtml = photoCategories.map(cat => {
    const urls = item.images?.[cat.key] || [];
    if (urls.length === 0) return '';

    return `
      <div style="margin-bottom: var(--space-lg)">
        <p class="text-label" style="margin-bottom: var(--space-sm)">${cat.label}</p>
        <div class="photo-scroll-row">
          ${urls.map(url => `
            <div class="photo-row-item" onclick="window.openLightbox('${url}')">
              <img src="${url}" loading="lazy" />
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  if (!categoriesHtml) return '';

  return `
    <div class="card animate-enter" style="margin-bottom: var(--space-md)">
      <div class="card-header">
        <h3 class="text-subheading" style="color: var(--accent-green)">Photos & Documents</h3>
      </div>
      <div class="card-body">
        ${categoriesHtml}
      </div>
    </div>
  `;
}
