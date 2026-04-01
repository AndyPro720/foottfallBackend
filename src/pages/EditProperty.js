import { getInventoryItemById, updateInventoryItem } from '../backend/inventoryService.js';
import { uploadMultipleFiles } from '../backend/storageService.js';
import { SECTIONS } from '../config/propertyFields.js';

// ─── Render Helpers (Reused from IntakeForm) ───

function renderField(field, value) {
  let html = '';
  if (field.type === 'select') html = renderSelect(field, value);
  else if (field.type === 'toggle') html = renderToggle(field, value);
  else if (field.type === 'file') html = renderFileUpload(field, value);
  else html = renderTextField(field, value);

  if (field.name === 'location') {
    html += `
      <div id="map-picker-container" class="form-group animate-enter" style="--delay:200ms">
        <p class="text-caption">Tap on the map to update the exact location pin</p>
        <div id="map-picker"></div>
        <input type="hidden" id="latitude" name="latitude" value="${item?.latitude || ''}" />
        <input type="hidden" id="longitude" name="longitude" value="${item?.longitude || ''}" />
      </div>
    `;
  }
  return html;
}


function renderTextField(field, value = '') {
  return `
    <div class="form-group">
      <label class="form-label" for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
      <input class="form-input" type="${field.type}" id="${field.name}" name="${field.name}" 
             placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''} value="${value}" />
    </div>
  `;
}

function renderSelect(field, value = '') {
  return `
    <div class="form-group">
      <label class="form-label" for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
      <select class="form-input form-select" id="${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>
        <option value="" disabled ${!value ? 'selected' : ''}>Select...</option>
        ${field.options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </div>
  `;
}

function renderToggle(field, value = false) {
  return `
    <div class="form-group">
      <label class="form-label">${field.label}</label>
      <div class="toggle-group" data-toggle="${field.name}">
        <button type="button" class="toggle-option ${value ? 'active' : ''}" data-value="yes">Yes</button>
        <button type="button" class="toggle-option ${!value ? 'active' : ''}" data-value="no">No</button>
      </div>
      ${field.hasCount ? `
        <div class="conditional-field" data-condition="${field.name}" style="display:${value ? 'block' : 'none'};margin-top:var(--space-sm)">
          <input class="form-input" type="number" id="${field.name}Count" placeholder="${field.countLabel}" value="${value ? (item && item[`${field.name}Count`] || '') : ''}" />
        </div>
      ` : ''}
      ${field.hasPhoto ? `
        <div class="conditional-field" data-condition="${field.name}" style="display:${value ? 'block' : 'none'};margin-top:var(--space-sm)">
          <div class="file-preview-grid" data-previews="${field.name}Photo">
            ${item && item[`${field.name}Photo`] ? `
              <div class="file-preview-item">
                <img src="${item[`${field.name}Photo`]}" class="file-preview-thumb" />
                <button type="button" class="file-remove-btn" data-field="${field.name}Photo">&times;</button>
              </div>
            ` : ''}
          </div>
          <div class="file-upload-zone" data-upload="${field.name}Photo">
            <svg class="file-upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <p class="text-caption">Tap to change photo/video</p>
            <input type="file" accept="image/*,video/*" />
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderFileUpload(field, existingUrls = []) {
  const isVideo = (url) => /\.(mp4|webm|mov|avi|mkv)/i.test(url);
  return `
    <div class="form-group">
      <label class="form-label">${field.label}</label>
      <div class="file-preview-grid" data-previews="${field.name}">
        ${(existingUrls || []).map(url => `
          <div class="file-preview-item">
            ${isVideo(url) 
              ? `<video src="${url}" class="file-preview-thumb" muted preload="metadata"></video>`
              : `<img src="${url}" class="file-preview-thumb" />`
            }
            <button type="button" class="file-remove-btn" data-url="${url}">&times;</button>
          </div>
        `).join('')}
      </div>
      <div class="file-upload-zone" data-upload="${field.name}" style="margin-top: var(--space-sm)">
        <p class="text-caption">${field.multiple ? 'Add more photos/videos...' : 'Tap to upload'}</p>
        <input type="file" accept="${field.accept}" ${field.multiple ? 'multiple' : ''} />
      </div>
    </div>
  `;
}

let item = null; // Global within module for field rendering context

export const renderEditProperty = async (container, id) => {
  // Show skeleton
  container.innerHTML = `<div class="page-header"><h1 class="text-display">Editing...</h1></div>`;

  item = await getInventoryItemById(id);
  if (!item) {
    container.innerHTML = `<div class="card card-error">Property not found</div>`;
    return;
  }

  const sectionsHtml = SECTIONS.map(section => `
    <div class="form-section ${section.id === 'property-info' ? '' : 'collapsed'}" data-section="${section.id}">
      <div class="form-section-header">
        <span class="text-subheading">${section.title}</span>
      </div>
      <div class="form-section-body">
        ${section.fields.map(field => {
          const val = (section.id === 'photos') ? (item.images?.[field.name] || []) : item[field.name];
          return renderField(field, val);
        }).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="page-header animate-enter">
      <h1 class="text-display">Edit Details</h1>
      <p class="text-label">${item.name}</p>
    </div>
    <form id="edit-form" class="animate-enter" style="--delay:100ms">
      ${sectionsHtml}
      <div id="form-error"></div>
      <div style="display: flex; gap: var(--space-md)">
        <button type="submit" class="btn-primary" id="save-btn" style="flex: 2">Save Changes</button>
        <a href="#property/${id}" class="btn-secondary" style="flex: 1">Cancel</a>
      </div>
    </form>
  `;

  // ─── Dynamic Behaviors (Mostly cloned from IntakeForm) ───
  
  // Section headers
  container.querySelectorAll('.form-section-header').forEach(header => {
    header.addEventListener('click', () => header.parentElement.classList.toggle('collapsed'));
  });

  // Toggle buttons
  container.querySelectorAll('.toggle-group').forEach(group => {
    const fieldName = group.dataset.toggle;
    const buttons = group.querySelectorAll('.toggle-option');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const condition = btn.dataset.value === 'yes';
        container.querySelectorAll(`[data-condition="${fieldName}"]`).forEach(el => {
          el.style.display = condition ? 'block' : 'none';
        });
      });
    });
  });

  // Handle existing photo removal
  container.querySelectorAll('.file-remove-btn').forEach(btn => {
    btn.onclick = () => {
      if (confirm('Remove this photo?')) {
        btn.parentElement.remove();
      }
    };
  });

  // Update file previews for new uploads with proper thumbnails
  container.querySelectorAll('.file-upload-zone').forEach(zone => {
    const input = zone.querySelector('input');
    const name = zone.dataset.upload;
    const previewGrid = container.querySelector(`[data-previews="${name}"]`);

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
      if (!previewGrid) return;
      // Remove previous "new file" items (keep existing ones with data-url remove buttons)
      previewGrid.querySelectorAll('.file-preview-new').forEach(el => el.remove());

      Array.from(input.files).forEach(file => {
        const div = document.createElement('div');
        div.className = 'file-preview-item file-preview-new';

        if (file.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.className = 'file-preview-thumb';
          img.src = URL.createObjectURL(file);
          div.appendChild(img);
        } else if (file.type.startsWith('video/')) {
          const vid = document.createElement('video');
          vid.className = 'file-preview-thumb';
          vid.src = URL.createObjectURL(file);
          vid.muted = true;
          vid.preload = 'metadata';
          div.appendChild(vid);
        } else {
          const badge = document.createElement('div');
          badge.className = 'badge';
          badge.textContent = file.name;
          div.appendChild(badge);
        }
        previewGrid.appendChild(div);
      });
    });
  });



  // ─── Phase 9: Initialize Map for Editing ───
  let map, marker;
  setTimeout(() => {
    const mapEl = document.getElementById('map-picker');
    if (!mapEl) return;

    const lat = Number(item.latitude) || 28.6139;
    const lng = Number(item.longitude) || 77.2090;

    map = L.map('map-picker', {
      zoomControl: false,
      dragging: !L.Browser.mobile,
      tap: !L.Browser.mobile
    }).setView([lat, lng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    function updateMarker(newLat, newLng) {
      document.getElementById('latitude').value = newLat;
      document.getElementById('longitude').value = newLng;
      if (marker) {
        marker.setLatLng([newLat, newLng]);
      } else {
        marker = L.marker([newLat, newLng], { draggable: true }).addTo(map);
        marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          updateMarker(pos.lat, pos.lng);
        });
      }
    }

    if (item.latitude && item.longitude) {
      updateMarker(lat, lng);
    }

    map.on('click', (e) => {
      updateMarker(e.latlng.lat, e.latlng.lng);
    });

    setTimeout(() => map.invalidateSize(), 500);
  }, 100);

  // ─── Submit (Update) ───

  document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
      const data = {};
      const fileFields = [];

      SECTIONS.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'toggle') {
            const active = container.querySelector(`[data-toggle="${field.name}"] .active`);
            const isYes = active?.dataset.value === 'yes';
            data[field.name] = isYes;
            if (field.hasCount && isYes) {
              const val = container.querySelector(`#${field.name}Count`)?.value;
              if (val) data[`${field.name}Count`] = Number(val);
            }
            // Check if existing facility photo was removed
            const preview = container.querySelector(`[data-previews="${field.name}Photo"] .file-preview-item`);
            if (!preview && item[`${field.name}Photo`]) {
              data[`${field.name}Photo`] = null; 
            }
            if (field.hasPhoto && isYes) {
              const fileInput = container.querySelector(`[data-upload="${field.name}Photo"] input`);
              if (fileInput?.files?.length > 0) {
                fileFields.push({ name: field.name, files: fileInput.files, isFacility: true });
              }
            }
          } else if (field.type === 'file') {
            // Collect remaining existing URLs
            const remaining = Array.from(container.querySelectorAll(`[data-previews="${field.name}"] .file-remove-btn`))
                                   .map(b => b.dataset.url);
            data[`images.${field.name}`] = remaining;

            const fileInput = container.querySelector(`[data-upload="${field.name}"] input`);
            if (fileInput?.files?.length > 0) {
              fileFields.push({ name: field.name, files: fileInput.files });
            }
          } else if (field.type !== 'facilityPhoto') {
            const val = container.querySelector(`#${field.name}`)?.value;
            if (val !== undefined) data[field.name] = val;
          }
        });
      });

      // Capture Map Coordinates
      const lat = document.getElementById('latitude')?.value;
      const lng = document.getElementById('longitude')?.value;
      if (lat && lng) {
        data.latitude = Number(lat);
        data.longitude = Number(lng);
      }


      // Handle new photo uploads with granular updates
      if (fileFields.length > 0) {
        for (const f of fileFields) {
          btn.textContent = `Uploading ${f.name}...`;
          const urls = await uploadMultipleFiles(f.files, `properties/${id}/${f.name}`);
          if (urls.length > 0) {
            if (f.isFacility) {
              data[`${f.name}Photo`] = urls[0];
            } else {
              // Merge with remaining
              const existing = data[`images.${f.name}`] || [];
              data[`images.${f.name}`] = [...existing, ...urls];
            }
          }
        }
      }

      await updateInventoryItem(id, data);
      const { showToast } = await import('../utils/ui.js');
      showToast('Changes saved successfully', 'success');
      window.location.hash = `#property/${id}`;
    } catch (err) {
      console.error(err);
      alert('Failed to save changes');
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  };
};
