import { getInventoryItemById, updateInventoryItem, deleteInventoryItem, createInventoryItem } from '../backend/inventoryService.js';
import { getProjectById } from '../backend/projectService.js';
import { SECTIONS } from '../config/propertyFields.js';
import {
  getFileExtensionLabel,
  getFileKindLabel,
  isCadUrl,
  isDocUrl,
  isPdfUrl,
  isVideoUrl,
} from '../utils/media.js';

function getNormalizedGoogleMapLink(item) {
  const rawLink = String(item.googleMapsLink || '').trim();
  if (!rawLink) return '';
  return /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
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

function getPriorityLocationValue(item) {
  const googleMapsLink = getNormalizedGoogleMapLink(item);
  if (googleMapsLink) return googleMapsLink;

  if (hasPinnedCoordinates(item)) {
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  const manualLocation = String(item.location || '').trim();
  if (manualLocation) return manualLocation;

  return '';
}

function getPriorityMapLink(item) {
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

function getPriorityLocationLabel(item) {
  const tradeArea = String(item.tradeArea || '').trim();
  const city = String(item.city || '').trim();
  const parts = [];
  if (tradeArea) parts.push(tradeArea);
  if (city) parts.push(city);
  if (parts.length > 0) return parts.join(', ');

  const manualLocation = String(item.location || '').trim();
  if (manualLocation && !/^https?:\/\//i.test(manualLocation)) return manualLocation;

  if (hasPinnedCoordinates(item)) {
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  const googleMapsLink = getNormalizedGoogleMapLink(item);
  if (googleMapsLink) return 'Open Google Map';

  return '';
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getAddedDateLabel(item) {
  const created = toDate(item.created_at);
  if (!created) return '';
  return created.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAddedByLabel(item) {
  return item.creatorName || item.creatorEmail || item.createdBy || 'Unknown user';
}

function getAllLocationDetails(item) {
  const details = [];
  const tradeArea = String(item.tradeArea || '').trim();
  const city = String(item.city || '').trim();
  const manualLocation = String(item.location || '').trim();
  const googleMapsLink = getNormalizedGoogleMapLink(item);

  if (tradeArea) {
    details.push({ label: 'Trade Area', value: tradeArea, type: 'text' });
  }

  if (city) {
    details.push({ label: 'City', value: city, type: 'text' });
  }

  if (manualLocation) {
    details.push({ label: 'Exact Address', value: manualLocation, type: 'text' });
  }

  if (hasPinnedCoordinates(item)) {
    details.push({
      label: 'Pinned Map Location',
      value: formatCoordinates(item),
      type: 'pin',
    });
  }

  if (googleMapsLink) {
    details.push({
      label: 'Google Map Link',
      value: googleMapsLink,
      type: 'link',
    });
  }

  return details;
}

function renderFileTile(url, caption = '') {
  const kind = getFileKindLabel(url).toLowerCase();
  return `
    <div class="media-file-tile tile-${kind}">
      <span class="media-file-tile-ext">${getFileExtensionLabel(url)}</span>
      <span class="media-file-tile-kind">${getFileKindLabel(url)}</span>
      ${caption ? `<span class="text-caption media-file-tile-caption">${caption}</span>` : ''}
    </div>
  `;
}

function buildPropertyInformationSummary(item, priorityLocationValue) {
  const propertySection = SECTIONS.find((section) => section.id === 'property-info');
  if (!propertySection) {
    return `${item.name || 'Unnamed Property'}\nLocation Details: ${priorityLocationValue || 'N/A'}`;
  }

  const lines = [];
  propertySection.fields.forEach((field) => {
    if (field.name === 'googleMapsLink' || field.name === 'location' || field.name === 'city' || field.name === 'tradeArea') return;

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

    const suffix = field.name === 'size' ? ' sqft' : '';
    lines.push(`${field.label}: ${value}${suffix}`);
  });

  const locationDetails = getAllLocationDetails(item);
  if (locationDetails.length > 0) {
    lines.push('Location Details:');
    locationDetails.forEach((detail) => {
      lines.push(`${detail.label}: ${detail.value}`);
    });
  } else {
    lines.push(`Location Details: ${priorityLocationValue || 'N/A'}`);
  }
  return lines.join('\n');
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

    const currentUid = window.userProfile?.uid || '';
    const normalizedStatus = String(item.status || 'active').toLowerCase();
    if (normalizedStatus !== 'active' && item.createdBy !== currentUid) {
      container.innerHTML = `
        <div class="page-header animate-enter">
          <h1 class="text-display">Access Restricted</h1>
          <p class="text-label">This listing is not publicly visible.</p>
        </div>
        <div class="card animate-enter" style="--delay:100ms">
          <p class="text-body">Only the property creator can view or edit this pending/inactive listing.</p>
          <a href="#" class="btn-secondary" style="margin-top:var(--space-md); width:auto">Back to Dashboard</a>
        </div>
      `;
      return;
    }

    // ─── Render Sections ───
    const googleMapsLink = getNormalizedGoogleMapLink(item);
    const hasLeafletPin = hasPinnedCoordinates(item);
    const priorityLocationValue = getPriorityLocationValue(item);
    const priorityMapLink = getPriorityMapLink(item);
    const priorityLocationLabel = getPriorityLocationLabel(item);
    const addedDateLabel = getAddedDateLabel(item);
    const addedByLabel = getAddedByLabel(item);
    const allLocationDetails = getAllLocationDetails(item);

    // Fetch project data if this unit belongs to a project
    let project = null;
    if (item.projectId) {
      try { project = await getProjectById(item.projectId); } catch (e) { /* project may be deleted */ }
    }
    const projectBannerHtml = project ? `
      <a href="#project/${item.projectId}" class="project-context-banner animate-enter" style="text-decoration:none; margin-bottom:var(--space-md)">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
        </svg>
        <span>Part of: <strong>${project.name}</strong></span>
        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-left:auto">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
        </svg>
      </a>
    ` : '';

    const sectionsHtml = SECTIONS.map(section => {
      if (section.id === 'photos') return renderPhotoGallery(item);

      let fieldsHtml = section.fields.map(field => {
        if (section.id === 'property-info' && (field.name === 'googleMapsLink' || field.name === 'location' || field.name === 'city' || field.name === 'tradeArea')) {
          return '';
        }

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

        if (field.type === 'file') {
          const files = item.images?.[field.name] || [];
          if (files.length === 0) return '';
          return `
            <div class="detail-item">
              <span class="text-label">${field.label}</span>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${files.map((url, index) => `
                  <a href="${url}" target="_blank" rel="noopener" class="link-primary" style="font-size:13px">
                    Open File ${index + 1}
                  </a>
                `).join('')}
              </div>
            </div>
          `;
        }

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
            ${section.id === 'property-info' ? `
              <div class="detail-item location-detail-item" style="grid-column: 1 / -1">
                <span class="text-label" style="margin-bottom: var(--space-xs)">Location Details</span>

                ${allLocationDetails.length > 0 ? `
                  ${allLocationDetails.map((detail) => `
                    <div class="location-priority-box">
                      <span class="text-caption" style="display:block; margin-bottom:4px">${detail.label}</span>
                      ${detail.type === 'link'
                        ? `<a href="${detail.value}" target="_blank" rel="noopener" class="link-primary">Open Google Map</a>`
                        : detail.type === 'pin'
                          ? `
                            <p class="text-body" style="font-size:13px; margin:0">${detail.value}</p>
                            <button type="button" class="btn-secondary btn-sm" id="toggle-map-btn" style="width:auto; min-height:0; padding:4px 12px; font-size:11px; margin-top:var(--space-sm)">
                              View Interactive Map
                            </button>
                            <div id="static-map-container" style="display:none; margin-top:var(--space-sm)">
                              <div id="static-map" class="static-map-preview"></div>
                            </div>
                          `
                          : `<p class="text-body" style="font-size:13px; margin:0">${detail.value}</p>`
                      }
                    </div>
                  `).join('')}
                ` : `
                  <p class="text-caption">No location details available</p>
                `}
              </div>
            ` : ''}


          </div>

        </div>
      `;
    }).join('');

    // ─── Phase 9: Prepare Slider Media ───
    const mediaOrder = ['entryToBuilding', 'buildingFacade', 'unitFacade', 'interior', 'signage', 'floorPlan', 'presentationFile', 'cadFiles'];
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
                      ? renderFileTile(m.url, 'Tap to open')
                      : (isDocUrl(m.url) || isCadUrl(m.url))
                        ? renderFileTile(m.url, isCadUrl(m.url) ? 'Tap to open CAD' : 'Tap to open')
                        : `<img src="${m.url}" loading="eager" />`
                  }
                </div>
              `).join('')
            : `<div class="slider-item" style="display:flex; align-items:center; justify-content:center; background:var(--bg-raised); color:var(--text-tertiary)">
                 No Media Available
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


      ${projectBannerHtml}

      <div class="page-header animate-enter">
        <div style="display:flex; justify-content:space-between; align-items:flex-start">
          <div>
            <h1 class="text-display">${item.name}</h1>
            ${priorityMapLink
              ? `<a href="${priorityMapLink}" target="_blank" rel="noopener" class="text-label card-location-link">${priorityLocationLabel || 'Open location'}</a>`
              : `<p class="text-label">${priorityLocationLabel || 'No location'}</p>`
            }
            ${(item.vicinityBrands || item.miscNotes) ? `
              ${item.vicinityBrands ? `
                <p class="text-caption vicinity-brands-line">
                  <span class="vicinity-brands-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M3 9.5L5.5 6H18.5L21 9.5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V9.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                      <path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/>
                      <path d="M9 14H15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
                    </svg>
                  </span>
                  <span>${item.vicinityBrands}</span>
                </p>
              ` : ''}
              ${item.miscNotes ? `<p class="text-caption" style="margin-top:4px; color:var(--text-tertiary); font-style:italic;">${item.miscNotes}</p>` : ''}
            ` : ''}
            <p class="text-caption property-added-meta">
              ${addedDateLabel ? `Added: ${addedDateLabel}` : 'Added: N/A'} | By: ${addedByLabel}
            </p>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px">
            <div class="status-select-wrapper" style="position:relative">
              <select id="status-select" class="badge ${item.status === 'active' ? 'badge-success' : 'badge-neutral'}" style="text-transform: capitalize; border: 1px solid var(--border-default); cursor: pointer; appearance: none; padding-right: 24px; background: var(--bg-input);">
                <option value="active" ${item.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="pending" ${(item.status === 'pending' || !item.status) ? 'selected' : ''}>Pending</option>
                <option value="inactive" ${item.status === 'inactive' ? 'selected' : ''}>Inactive</option>
              </select>
              <svg class="select-chevron" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); pointer-events: none; width: 12px; height: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
            </div>
            <button class="btn-secondary btn-sm" id="share-btn" style="width:auto; min-height:0; padding:6px 12px; font-size:11px; display:flex; gap:6px">
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
              Share
            </button>
            <button class="btn-secondary btn-sm" id="copy-summary-btn" style="width:auto; min-height:0; padding:6px 12px; font-size:11px; display:flex; gap:6px">
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16h8M8 12h8m-8-4h8M7 20h10a2 2 0 002-2V6a2 2 0 00-2-2H7a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              Copy Summary
            </button>
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

        <div style="margin-top: var(--space-xl); display: flex; gap: var(--space-md); flex-wrap: wrap;">
           <a href="#edit/${item.id}" class="btn-secondary" style="flex:1; min-width:100px;">Edit Details</a>
           <button class="btn-secondary" id="duplicate-btn" style="flex:1; min-width:100px;">Duplicate</button>
           <button class="btn-secondary destructive" style="flex:1; border-color: var(--destructive); color: var(--destructive); min-width:100px;" id="delete-btn">Delete</button>
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

    // ─── Map Toggle Logic ───
    const toggleMapBtn = document.getElementById('toggle-map-btn');
    const mapContainer = document.getElementById('static-map-container');
    let staticMapInstance = null;
    if (toggleMapBtn && mapContainer) {
      toggleMapBtn.onclick = () => {
        const isHidden = mapContainer.style.display === 'none';
        mapContainer.style.display = isHidden ? 'block' : 'none';
        toggleMapBtn.textContent = isHidden ? 'Hide Interactive Map' : 'View Interactive Map';
        if (isHidden && hasLeafletPin) {
          const latitude = Number(item.latitude);
          const longitude = Number(item.longitude);
          setTimeout(() => {
            if (!staticMapInstance) {
              staticMapInstance = L.map('static-map', { zoomControl: true }).setView([latitude, longitude], 15);
              L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(staticMapInstance);
              L.marker([latitude, longitude]).addTo(staticMapInstance);
            } else {
              staticMapInstance.invalidateSize();
            }
          }, 100);
        }
      };
    }

    // ─── Share Button Logic ───
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
      shareBtn.onclick = async () => {
        const shareLocation = priorityLocationValue || 'Location unavailable';
        const area = item.tradeArea || 'Trade area not specified';
        const sqft = item.size ? `${item.size} sqft` : 'Size N/A';
        const rate = item.price ? `₹${item.price}/sqft` : 'Rate N/A';
        const shareText = [
          `Property: ${item.name}`,
          `Trade Area: ${area}`,
          `Location: ${shareLocation}`,
          `Size: ${sqft}`,
          `Rate: ${rate}`
        ].join('\n');
        const shareData = {
          title: `Foottfall: ${item.name}`,
          text: shareText,
          url: window.location.href
        };
        try {
          if (navigator.share) {
            await navigator.share(shareData);
          } else {
            await navigator.clipboard.writeText(`${shareText}\nLink: ${shareData.url}`);
            const { showToast } = await import('../utils/ui.js');
            showToast('Details copied to clipboard', 'success');
          }
        } catch (err) {
          console.warn('Share failed:', err);
        }
      };
    }

    const copySummaryBtn = document.getElementById('copy-summary-btn');
    if (copySummaryBtn) {
      copySummaryBtn.onclick = async () => {
        const summaryBody = buildPropertyInformationSummary(item, priorityLocationValue);
        const summaryText = `${item.name || 'Unnamed Property'}\n\n${summaryBody}`;

        try {
          await navigator.clipboard.writeText(summaryText);
          const { showToast } = await import('../utils/ui.js');
          showToast('Summary copied to clipboard', 'success');
        } catch (err) {
          const { showToast } = await import('../utils/ui.js');
          showToast('Clipboard copy failed', 'error');
        }
      };
    }



    // ─── Lightbox logic ───

    window.openLightbox = (src) => {
      if (isPdfUrl(src) || isDocUrl(src) || isCadUrl(src)) {
        // iOS can't download docs natively — open via Google Docs Viewer for Office files
        if (isDocUrl(src)) {
          window.open(`https://docs.google.com/gview?url=${encodeURIComponent(src)}&embedded=false`, '_blank', 'noopener');
        } else {
          // PDFs and CAD files: open directly in new tab
          // Note: CAD files (.dwg/.dxf) will likely trigger a download or "open in..." prompt on iOS
          window.open(src, '_blank', 'noopener');
        }
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

    // ─── Duplicate handler ───
    const duplicateBtn = document.getElementById('duplicate-btn');
    if (duplicateBtn) {
      duplicateBtn.onclick = async () => {
        const { showToast } = await import('../utils/ui.js');
        if (confirm('Are you sure you want to duplicate this property?')) {
          try {
            duplicateBtn.disabled = true;
            duplicateBtn.textContent = 'Duplicating...';
            
            const cloneData = { ...item };
            delete cloneData.id;
            delete cloneData.created_at;
            delete cloneData.updated_at;
            
            let baseName = cloneData.name || 'Unnamed Property';
            const copyMatch = baseName.match(/ Copy( \d+)?$/);
            let copyNumber = 1;
            if (copyMatch) {
              baseName = baseName.slice(0, copyMatch.index);
              if (copyMatch[1]) {
                copyNumber = parseInt(copyMatch[1].trim()) + 1;
              } else {
                copyNumber = 2;
              }
            }
            cloneData.name = `${baseName} Copy${copyNumber > 1 ? ` ${copyNumber}` : ''}`;
            
            const newId = await createInventoryItem(cloneData);
            showToast('Property duplicated successfully', 'success');
            window.location.hash = `#property/${newId}`;
          } catch (err) {
            showToast('Failed to duplicate: ' + err.message, 'error');
            duplicateBtn.disabled = false;
            duplicateBtn.textContent = 'Duplicate';
          }
        }
      };
    }

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
    { key: 'floorPlan', label: 'Floor Plan' },
    { key: 'cadFiles', label: 'CAD Files' },
    { key: 'entryToBuilding', label: 'Entry to Building' },
    { key: 'presentationFile', label: 'Presentation' },
  ];

  const categoriesHtml = photoCategories.map(cat => {
    const urls = item.images?.[cat.key] || [];
    if (urls.length === 0) return '';

    return `
      <div style="margin-bottom: var(--space-md)">
        <p class="text-label" style="margin-bottom: var(--space-xs); font-weight: 600; color: var(--text-secondary)">${cat.label}</p>
        <div class="photo-scroll-row">
          ${urls.map(url => `
            <div class="photo-row-item" onclick="window.openLightbox('${url}')"
               ${(isDocUrl(url) || isPdfUrl(url) || isCadUrl(url)) ? 'style="cursor:pointer;"' : ''}>
               ${isVideoUrl(url)
                 ? `<video src="${url}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>`
                 : isPdfUrl(url)
                   ? renderFileTile(url)
                   : (isDocUrl(url) || isCadUrl(url))
                     ? renderFileTile(url)
                     : `<img src="${url}" loading="lazy" />`
               }
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Presentation link (not a file category, rendered separately)
  const presLinkHtml = item.presentationAvailable && item.presentationLink ? `
    <div style="margin-bottom: var(--space-md)">
      <p class="text-label" style="margin-bottom: var(--space-xs); font-weight: 600; color: var(--text-secondary)">Presentation Link</p>
      <a href="${item.presentationLink}" target="_blank" rel="noopener" class="link-primary" style="font-size:13px; word-break:break-all;">
        ${item.presentationLink}
      </a>
    </div>
  ` : '';

  if (!categoriesHtml && !presLinkHtml) return '';

  return `
    <div class="card animate-enter" style="margin-bottom: var(--space-md)">
      <div class="card-header">
        <h3 class="text-subheading" style="color: var(--accent-green)">Media Explorer</h3>
      </div>
      <div class="card-body">
        ${categoriesHtml}
        ${presLinkHtml}
      </div>
    </div>
  `;
}

