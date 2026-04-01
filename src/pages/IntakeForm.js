import { createInventoryItem, updateInventoryItem } from '../backend/inventoryService.js';
import { uploadMultipleFiles } from '../backend/storageService.js';
import { SECTIONS } from '../config/propertyFields.js';
import { showToast } from '../utils/ui.js';

// ─── Render Helpers ───

function renderTextField(field) {
  const conditionalAttr = field.conditionalOn 
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"` 
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label" for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
      <input class="form-input" type="${field.type}" id="${field.name}" name="${field.name}" 
             placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''} />
    </div>
  `;
}

function renderSelect(field) {
  const conditionalAttr = field.conditionalOn 
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"` 
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label" for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
      <select class="form-input form-select" id="${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>
        <option value="" disabled selected>Select...</option>
        ${field.options.map(o => `<option value="${o}">${o}</option>`).join('')}
      </select>
    </div>
  `;
}

function renderToggle(field) {
  const conditionalAttr = field.conditionalOn 
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"` 
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label">${field.label}</label>
      <div class="toggle-group" data-toggle="${field.name}">
        <button type="button" class="toggle-option" data-value="no">No</button>
        <button type="button" class="toggle-option active" data-value="no">No</button>
      </div>
      ${field.hasCount ? `
        <div class="conditional-field" data-condition="${field.name}" style="display:none;margin-top:var(--space-sm)">
          <input class="form-input" type="number" id="${field.name}Count" placeholder="${field.countLabel}" />
        </div>
      ` : ''}
      ${field.hasPhoto ? `
        <div class="conditional-field" data-condition="${field.name}" style="display:none;margin-top:var(--space-sm)">
          <div class="file-upload-zone" data-upload="${field.name}Photo">
            <svg class="file-upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <p class="text-caption">Tap to add photo/video</p>
            <input type="file" accept="image/*,video/*" />
          </div>
          <div class="file-preview-grid" data-previews="${field.name}Photo"></div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderFileUpload(field) {
  return `
    <div class="form-group">
      <label class="form-label">${field.label}</label>
      <div class="file-upload-zone" data-upload="${field.name}">
        <svg class="file-upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        <p class="text-caption">${field.multiple ? 'Tap to add photos/videos' : 'Tap to upload'}</p>
        <input type="file" accept="${field.accept}" ${field.multiple ? 'multiple' : ''} />
      </div>
      <div class="file-preview-grid" data-previews="${field.name}"></div>
    </div>
  `;
}

function renderField(field) {
  let html = '';
  if (field.type === 'select') html = renderSelect(field);
  else if (field.type === 'toggle') html = renderToggle(field);
  else if (field.type === 'file') html = renderFileUpload(field);
  else html = renderTextField(field);

  if (field.name === 'location') {
    html += `
      <div id="map-picker-container" class="form-group animate-enter" style="--delay:200ms">
        <p class="text-caption">Tap on the map to drop a pin for exact location</p>
        <div id="map-picker"></div>
        <input type="hidden" id="latitude" name="latitude" />
        <input type="hidden" id="longitude" name="longitude" />
      </div>
    `;
  }
  return html;
}


// ─── Main Render ───

export const renderIntakeForm = (container) => {
  const sectionsHtml = SECTIONS.map(section => `
    <div class="form-section ${section.collapsed ? 'collapsed' : ''}" data-section="${section.id}">
      <div class="form-section-header">
        <span class="text-subheading">${section.title}</span>
      </div>
      <div class="form-section-body">
        ${section.fields.map(renderField).join('')}
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="page-header animate-enter">
      <h1 class="text-display">Register Property</h1>
      <p class="text-label">Fill in the details below</p>
    </div>
    <form id="intake-form" class="animate-enter" style="--delay:100ms">
      ${sectionsHtml}
      <div id="form-error"></div>
      <button type="submit" class="btn-primary" id="submit-btn">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m-6-6h12"></path></svg>
        Register New Retail Property
      </button>
    </form>
  `;

  // ─── Section collapse toggles ───
  container.querySelectorAll('.form-section-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('collapsed');
    });
  });

  // ─── Generic conditional select listeners ───
  container.querySelectorAll('select').forEach(selectEl => {
    selectEl.addEventListener('change', (e) => {
      const fieldName = e.target.name;
      const value = e.target.value;
      const conditionals = container.querySelectorAll(`[data-conditional-on="${fieldName}"]`);
      conditionals.forEach(el => {
        el.style.display = (el.dataset.conditionalValue === value) ? 'block' : 'none';
      });
    });
  });

  // ─── Toggle buttons ───
  container.querySelectorAll('.toggle-group').forEach(group => {
    const fieldName = group.dataset.toggle;
    // Reset: set first to "No" active
    const buttons = group.querySelectorAll('.toggle-option');
    buttons[0].textContent = 'Yes';
    buttons[0].dataset.value = 'yes';
    buttons[0].classList.remove('active');
    buttons[1].textContent = 'No';
    buttons[1].dataset.value = 'no';
    buttons[1].classList.add('active');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Legacy generic condition handling
        const conditionals = container.querySelectorAll(`[data-condition="${fieldName}"]`);
        conditionals.forEach(el => {
          el.style.display = btn.dataset.value === 'yes' ? 'block' : 'none';
        });
        
        // Strict mapping condition handling
        const strictConditionals = container.querySelectorAll(`[data-conditional-on="${fieldName}"]`);
        strictConditionals.forEach(el => {
          el.style.display = (el.dataset.conditionalValue === btn.dataset.value) ? 'block' : 'none';
        });
      });
    });
  });

  // ─── File upload zones ───
  container.querySelectorAll('.file-upload-zone').forEach(zone => {
    const input = zone.querySelector('input[type="file"]');
    const uploadName = zone.dataset.upload;
    const previewGrid = container.querySelector(`[data-previews="${uploadName}"]`);

    zone.addEventListener('click', () => input.click());

    input.addEventListener('change', () => {
      if (!previewGrid) return;
      previewGrid.innerHTML = '';
      Array.from(input.files).forEach(file => {
        if (file.type.startsWith('image/')) {
          const img = document.createElement('img');
          img.className = 'file-preview-thumb';
          img.src = URL.createObjectURL(file);
          previewGrid.appendChild(img);
        } else if (file.type.startsWith('video/')) {
          const vid = document.createElement('video');
          vid.className = 'file-preview-thumb';
          vid.src = URL.createObjectURL(file);
          vid.muted = true;
          vid.preload = 'metadata';
          previewGrid.appendChild(vid);
        } else {
          const div = document.createElement('div');
          div.className = 'badge';
          div.textContent = file.name;
          previewGrid.appendChild(div);
        }
      });
    });
  });

  // ─── Phase 9: Initialize Map ───
  let map, marker;
  setTimeout(() => {
    const mapEl = document.getElementById('map-picker');
    if (!mapEl) return;

    // Use a default location (e.g. New Delhi) or user's GPS
    const defaultPos = [28.6139, 77.2090];
    map = L.map('map-picker', {
      zoomControl: false,
      dragging: !L.Browser.mobile,
      tap: !L.Browser.mobile
    }).setView(defaultPos, 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    // Try to get current GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 16);
        updateMarker(latitude, longitude);
      }, (err) => {
        console.warn('Geolocation failed:', err);
      }, { timeout: 5000 });
    }

    function updateMarker(lat, lng) {
      const latInput = document.getElementById('latitude');
      const lngInput = document.getElementById('longitude');
      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;

      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng], { draggable: true }).addTo(map);
        marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          updateMarker(pos.lat, pos.lng);
        });
      }
    }

    map.on('click', (e) => {
      updateMarker(e.latlng.lat, e.latlng.lng);
    });

    // Fix map size after animations
    setTimeout(() => map.invalidateSize(), 500);
  }, 100);

  // ─── Form submission ───

  document.getElementById('intake-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const errorContainer = document.getElementById('form-error');
    errorContainer.innerHTML = '';

    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
      // 1. Collect all non-file fields first
      const data = {};
      const fileFields = []; // To track which fields have files to upload

      SECTIONS.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'toggle') {
            const group = container.querySelector(`[data-toggle="${field.name}"]`);
            const activeBtn = group?.querySelector('.toggle-option.active');
            const isYes = activeBtn?.dataset.value === 'yes';
            data[field.name] = isYes;
            
            // Count fields
            if (field.hasCount && isYes) {
              const countInput = container.querySelector(`#${field.name}Count`);
              if (countInput?.value) data[`${field.name}Count`] = Number(countInput.value);
            }

            // Facility photos (conditional)
            if (field.hasPhoto && isYes) {
              const fileInput = container.querySelector(`[data-upload="${field.name}Photo"] input`);
              if (fileInput?.files?.length > 0) {
                fileFields.push({ name: field.name, files: fileInput.files, isFacility: true });
              }
            }
          } else if (field.type === 'file') {
            const fileInput = container.querySelector(`[data-upload="${field.name}"] input`);
            if (fileInput?.files?.length > 0) {
              fileFields.push({ name: field.name, files: fileInput.files });
            }
          } else {
            const input = container.querySelector(`#${field.name}`);
            if (input?.value) data[field.name] = input.value;
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

      data.status = 'active';

      data.images = {}; // Prepare images object

      // 2. Create the initial document (this writes to Firestore local cache immediately)
      const docId = await createInventoryItem(data);

      // 3. Handle photo uploads only if ONLINE
      if (fileFields.length > 0) {
        if (!navigator.onLine) {
          showToast('Property saved locally! Upload photos later when back online.', 'warning');
          window.location.hash = '#';
          return;
        }

        const totalSteps = fileFields.length;
        let completedSteps = 0;

        for (const field of fileFields) {
          btn.textContent = `Uploading ${field.name}... ${Math.round((completedSteps / totalSteps) * 100)}%`;
          
          const path = `properties/${docId}/${field.name}`;
          try {
            const urls = await uploadMultipleFiles(field.files, path);
            
            if (urls.length > 0) {
              const updateData = {};
              if (field.isFacility) {
                updateData[`${field.name}Photo`] = urls[0];
              } else {
                updateData[`images.${field.name}`] = urls;
              }
              await updateInventoryItem(docId, updateData);
            }
          } catch (uploadErr) {
            console.error(`Upload failed for ${field.name}:`, uploadErr);
            showToast(`Could not upload ${field.name}. Save the property first and try again later.`, 'error');
          }
          
          completedSteps++;
        }
      }

      // Success toast
      showToast('Property registered successfully!', 'success');
      window.location.hash = '#';
    } catch (err) {
      console.error('Submission error:', err);
      errorContainer.innerHTML = `
        <div class="error-inline">
          <span>⚠</span>
          <span>${err.message || 'Unable to save. Please check your connection and try again.'}</span>
        </div>
      `;
      btn.classList.remove('btn-loading');
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m-6-6h12"></path></svg>
        Register New Retail Property
      `;
    }
  });
};
