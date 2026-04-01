import { getInventoryItemById, updateInventoryItem, deleteInventoryItem } from '../backend/inventoryService.js';
import { SECTIONS } from '../config/propertyFields.js';

const VIDEO_FILE_RE = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i;
const PDF_FILE_RE = /\.pdf(\?|$)/i;

function isVideoUrl(url) {
  return VIDEO_FILE_RE.test(String(url || ''));
}

function isPdfUrl(url) {
  return PDF_FILE_RE.test(String(url || ''));
}

function getDisplayLocation(item) {
  const manualLocation = String(item.location || '').trim();
  if (manualLocation) return manualLocation;

  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `Pinned: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  return '';
}

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
    const item = await getInventoryItemById(id, (newItem) => {
      import('../utils/ui.js').then(({ showToast }) => {
        showToast('Updated data available', 'info', {
          text: 'Refresh',
          onClick: () => renderPropertyDetail(container, id)
        });
      });
    });

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

      let fieldsHtml = section.fields.map(field => {
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

        if (field.type === 'facilityPhoto') return ''; // Legacy: handled within toggle above

        if (!value) return '';

        return `
          <div class="detail-item">
            <span class="text-label">${field.label}</span>
            <span class="text-body">${field.type === 'number' && field.name === 'price' ? '₹' + Number(value).toLocaleString('en-IN') : value}${field.name === 'size' ? ' sqft' : ''}${field.name === 'mezzanineSize' ? ' sqft' : ''}</span>
          </div>
        `;
      }).join('');

      // Auto-calculate Effective Rent
      if (section.id === 'specs' && item.size && item.price) {
        const rent = Number(item.size) * Number(item.price);
        fieldsHtml = `
          <div class="detail-item" style="background: var(--surface-hover); padding: var(--space-xs) var(--space-sm); border-radius: var(--radius-sm);">
            <span class="text-label" style="color: var(--accent-green); font-weight: 600;">Effective Rent</span>
            <span class="text-body" style="font-weight: 700;">₹${rent.toLocaleString('en-IN')} / month</span>
          </div>
        ` + fieldsHtml;
      }

      if (!fieldsHtml) return '';

      return `
        <div class="card animate-enter" style="margin-bottom: var(--space-md)">
          <div class="card-header">
            <h3 class="text-subheading" style="color: var(--accent-green)">${section.title}</h3>
          </div>
          <div class="card-body detail-grid">
            ${fieldsHtml}
            ${section.id === 'property-info' && item.latitude && item.longitude ? `
              <div class="detail-item" style="grid-column: 1 / -1">
                <span class="text-label" style="margin-bottom: var(--space-xs)">Pinned Location</span>
                <div id="static-map" class="static-map-preview"></div>
              </div>
            ` : ''}

          </div>

        </div>
      `;
    }).join('');

    // ─── Phase 9: Prepare Slider Media ───
    const mediaOrder = ['buildingFacade', 'unitFacade', 'interior', 'signage', 'floorPlan'];
    const allMedia = [];
    mediaOrder.forEach(key => {
      const urls = item.images?.[key] || [];
      urls.forEach(url => allMedia.push({ url, category: key }));
    });


    // ─── Render Page ───
    container.innerHTML = `
      <div class="slider-container animate-enter">
        <div class="slider-wrapper" id="detail-slider">
          ${allMedia.length > 0 
            ? allMedia.map(m => `
                <div class="slider-item" onclick="window.openLightbox('${m.url}')">
                  ${isVideoUrl(m.url)
                    ? `<video src="${m.url}" muted preload="metadata" style="pointer-events:none"></video>`
                    : isPdfUrl(m.url)
                      ? `<div style="height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; background:var(--bg-raised); gap:var(--space-md)">
                           <svg width="48" height="48" fill="none" stroke="var(--text-tertiary)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                           <span class="text-label">PDF Document</span>
                           <span class="text-caption">Tap to open PDF</span>
                         </div>`
                      : `<img src="${m.url}" loading="eager" />`
                  }
                </div>
              `).join('')
            : `<div class="slider-item" style="display:flex; align-items:center; justify-content:center; background:var(--bg-raised); color:var(--text-tertiary)">
                 No Photos Available
               </div>`
          }
        </div>
        ${allMedia.length > 1 ? `
          <button class="slider-nav-btn slider-nav-prev" id="slider-prev" aria-label="Previous">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
          </button>
          <button class="slider-nav-btn slider-nav-next" id="slider-next" aria-label="Next">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
          </button>
          <div class="slider-dots" id="slider-dots">
            ${allMedia.map((_, i) => `<div class="slider-dot ${i === 0 ? 'active' : ''}"></div>`).join('')}
          </div>
        ` : ''}
      </div>


      <div class="page-header animate-enter">
        <div style="display:flex; justify-content:space-between; align-items:flex-start">
          <div>
            <h1 class="text-display">${item.name}</h1>
            <p class="text-label">${getDisplayLocation(item) || 'No location'}</p>
          </div>
          <div class="status-select-wrapper" style="position:relative">
            <select id="status-select" class="badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}" style="text-transform: capitalize; border: 1px solid var(--border-default); cursor: pointer; appearance: none; padding-right: 24px; background: var(--bg-input);">
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

    // ─── Slider pagination & nav logic ───
    const slider = document.getElementById('detail-slider');
    const dots = document.querySelectorAll('.slider-dot');
    if (slider) {
      if (dots.length > 0) {
        slider.onscroll = () => {
          const index = Math.round(slider.scrollLeft / slider.offsetWidth);
          dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
        };
      }
      
      const prevBtn = document.getElementById('slider-prev');
      const nextBtn = document.getElementById('slider-next');
      if (prevBtn) prevBtn.onclick = () => slider.scrollBy({ left: -slider.offsetWidth, behavior: 'smooth' });
      if (nextBtn) nextBtn.onclick = () => slider.scrollBy({ left: slider.offsetWidth, behavior: 'smooth' });
    }

    // ─── Phase 9: Initialize Detail Map ───
    if (item.latitude && item.longitude) {
      setTimeout(() => {
        const mapEl = document.getElementById('static-map');
        if (!mapEl || !L) return;
        const smap = L.map('static-map', { 
          zoomControl: false, 
          dragging: false, 
          touchZoom: false, 
          scrollWheelZoom: false,
          doubleClickZoom: false,
          boxZoom: false
        }).setView([item.latitude, item.longitude], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(smap);
        L.marker([item.latitude, item.longitude]).addTo(smap);
      }, 500);
    }


    // ─── Lightbox logic ───

    window.openLightbox = (src) => {
      if (isPdfUrl(src)) {
        window.open(src, '_blank', 'noopener');
        return;
      }

      const overlay = document.createElement('div');
      overlay.className = 'lightbox-overlay active';
      const isVideo = isVideoUrl(src);
      overlay.innerHTML = `
        ${isVideo 
          ? `<video src="${src}" class="lightbox-img" controls autoplay style="max-width:90%;max-height:90%"></video>`
          : `<img src="${src}" class="lightbox-img" />`
        }
        <button class="lightbox-close">&times;</button>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector('.lightbox-close').onclick = () => {
        const vid = overlay.querySelector('video');
        if (vid) vid.pause();
        overlay.remove();
      };
      overlay.onclick = (e) => { 
        if(e.target === overlay) {
          const vid = overlay.querySelector('video');
          if (vid) vid.pause();
          overlay.remove(); 
        }
      };
    };

    // ─── Status update handler ───
    const statusSelect = document.getElementById('status-select');
    statusSelect.onchange = async () => {
      const newStatus = statusSelect.value;
      const { showToast } = await import('../utils/ui.js');
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
      const { showToast } = await import('../utils/ui.js');
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
      <div style="margin-bottom: var(--space-md)">
        <p class="text-label" style="margin-bottom: var(--space-xs); font-weight: 600; color: var(--text-secondary)">${cat.label}</p>
        <div class="photo-scroll-row">
          ${urls.map(url => `
            <div class="photo-row-item" onclick="window.openLightbox('${url}')">
              ${isVideoUrl(url)
                ? `<video src="${url}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>`
                : isPdfUrl(url)
                  ? `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--bg-raised)"><svg width="24" height="24" fill="none" stroke="var(--text-tertiary)" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>`
                  : `<img src="${url}" loading="lazy" />`
              }
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
        <h3 class="text-subheading" style="color: var(--accent-green)">Media Explorer</h3>
      </div>
      <div class="card-body">
        ${categoriesHtml}
      </div>
    </div>
  `;
}
