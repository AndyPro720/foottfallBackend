import { getInventoryItemById, updateInventoryItem } from '../backend/inventoryService.js';
import { uploadMultipleFiles } from '../backend/storageService.js';
import { SECTIONS } from '../config/propertyFields.js';
import { heicTo } from 'heic-to';
import { showToast } from '../utils/ui.js';

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

function isLikelyHeicFile(file) {
  const fileType = String(file.type || '').toLowerCase();
  return /\.hei(c|f)$/i.test(file.name || '') || fileType === 'image/heic' || fileType === 'image/heif';
}

async function convertHeicToJpegBlob(file) {
  const converted = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.7 });
  if (Array.isArray(converted) && converted.length > 0) {
    const first = converted[0];
    if (first instanceof Blob) return first;
    return new Blob([first], { type: 'image/jpeg' });
  }
  if (converted instanceof Blob) return converted;
  return new Blob([converted], { type: 'image/jpeg' });
}

function mergeFilesIntoInput(input, incomingFiles) {
  if (!incomingFiles || incomingFiles.length === 0) return true;
  if (typeof DataTransfer === 'undefined') return false;

  const dt = new DataTransfer();
  if (input.multiple) {
    incomingFiles.forEach((file) => dt.items.add(file));
  } else {
    dt.items.add(incomingFiles[incomingFiles.length - 1]);
  }
  input.files = dt.files;
  return true;
}

function uniqueFiles(existingFiles, newFiles) {
  const seen = new Set();
  const merged = [];
  [...existingFiles, ...newFiles].forEach((file) => {
    const key = `${file.name}__${file.size}__${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(file);
  });
  return merged;
}

// Render helpers (reused from IntakeForm)

function renderField(field, value) {
  let html = '';
  if (field.type === 'select') html = renderSelect(field, value);
  else if (field.type === 'toggle') html = renderToggle(field, value);
  else if (field.type === 'file') html = renderFileUpload(field, value);
  else html = renderTextField(field, value);

  if (field.name === 'location') {
    html += `
      <div id="map-picker-container" class="form-group animate-enter" style="--delay:200ms">
        <label class="form-label">Property Pin Location (Voluntary)</label>
        <button type="button" class="btn-secondary btn-sm" id="toggle-map-picker-btn" style="width:auto; min-height:0; padding:6px 12px; font-size:11px; align-self:flex-start">
          View Interactive Map
        </button>
        <div id="map-picker-wrapper" style="display:none; margin-top:var(--space-sm)">
          <div style="display:flex; gap:var(--space-sm); margin-bottom:var(--space-sm)">
            <button type="button" class="btn-secondary" id="gps-btn" style="flex:1; min-height:36px; font-size:12px">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              Use My Location
            </button>
            <button type="button" class="btn-secondary" id="clear-pin-btn" style="flex:1; min-height:36px; font-size:12px; border-color:var(--destructive); color:var(--destructive)">
              Clear Pin
            </button>
          </div>
          <div id="map-picker"></div>
        </div>
        <input type="hidden" id="latitude" name="latitude" value="${item?.latitude || ''}" />
        <input type="hidden" id="longitude" name="longitude" value="${item?.longitude || ''}" />
      </div>
    `;
  }
  return html;
}



function renderTextField(field, value = '') {
  const conditionalAttr = field.conditionalOn
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"`
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label" for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
      <input class="form-input" type="${field.type}" id="${field.name}" name="${field.name}"
             placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''} value="${value}" />
    </div>
  `;
}

function renderSelect(field, value = '') {
  const conditionalAttr = field.conditionalOn
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"`
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label" for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
      <select class="form-input form-select" id="${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>
        <option value="" disabled ${!value ? 'selected' : ''}>Select...</option>
        ${field.options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </div>
  `;
}

function renderToggle(field, value = false) {
  const conditionalAttr = field.conditionalOn
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"`
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
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
            <input type="file" data-main-upload="true" accept="image/*,video/*" />
            <input type="file" data-video-capture="true" accept="video/*" capture="environment" />
            <button type="button" class="capture-video-btn">Record Video</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderFileUpload(field, existingUrls = []) {
  const conditionalAttr = field.conditionalOn
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"`
    : '';
  const isVideo = (url) => /\.(mp4|webm|mov|avi|mkv)/i.test(url);
  return `
    <div class="form-group"${conditionalAttr}>
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
        <input type="file" data-main-upload="true" accept="${field.accept}" ${field.multiple ? 'multiple' : ''} />
        <input type="file" data-video-capture="true" accept="video/*" capture="environment" />
        <button type="button" class="capture-video-btn">Record Video</button>
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

  const currentUid = window.userProfile?.uid || '';
  const normalizedStatus = String(item.status || 'active').toLowerCase();
  if (normalizedStatus !== 'active' && item.createdBy !== currentUid) {
    container.innerHTML = `
      <div class="card card-error">
        Only the property creator can edit pending/inactive listings.
      </div>
    `;
    return;
  }

  const sectionsHtml = SECTIONS.map(section => `
    <div class="form-section ${section.id === 'property-info' ? '' : 'collapsed'}" data-section="${section.id}">
      <div class="form-section-header">
        <span class="text-subheading">${section.title}</span>
      </div>
      <div class="form-section-body">
        ${section.fields.map(field => {
          const val = field.type === 'file' ? (item.images?.[field.name] || []) : item[field.name];
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

  // Dynamic behaviors (mostly cloned from IntakeForm)

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
        container.querySelectorAll(`[data-conditional-on="${fieldName}"]`).forEach(el => {
          el.style.display = (el.dataset.conditionalValue === btn.dataset.value) ? 'block' : 'none';
        });
      });
    });
  });

  container.querySelectorAll('select').forEach(selectEl => {
    selectEl.addEventListener('change', (e) => {
      const fieldName = e.target.name;
      const value = e.target.value;
      container.querySelectorAll(`[data-conditional-on="${fieldName}"]`).forEach(el => {
        el.style.display = (el.dataset.conditionalValue === value) ? 'block' : 'none';
      });
    });
  });

  // Initialize conditional fields using current values.
  container.querySelectorAll('[data-conditional-on]').forEach((el) => {
    const controllingField = el.dataset.conditionalOn;
    const expectedValue = el.dataset.conditionalValue;
    const toggleActive = container.querySelector(`[data-toggle="${controllingField}"] .toggle-option.active`);
    if (toggleActive) {
      el.style.display = toggleActive.dataset.value === expectedValue ? 'block' : 'none';
      return;
    }
    const input = container.querySelector(`[name="${controllingField}"]`);
    if (!input) {
      el.style.display = 'none';
      return;
    }
    el.style.display = input.value === expectedValue ? 'block' : 'none';
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
  const selectedFilesByUpload = new Map();
  container.querySelectorAll('.file-upload-zone').forEach(zone => {
    const input = zone.querySelector('input[data-main-upload="true"]') || zone.querySelector('input[type="file"]');
    const captureButton = zone.querySelector('.capture-video-btn');
    const name = zone.dataset.upload;
    const previewGrid = container.querySelector(`[data-previews="${name}"]`);
    let selectedFiles = Array.from(input.files || []);
    selectedFilesByUpload.set(name, selectedFiles);

    zone.addEventListener('click', (event) => {
      if (event.target.closest('.capture-video-btn')) return;
      input.click();
    });

    if (captureButton) {
      captureButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const pickerInput = document.createElement('input');
        pickerInput.type = 'file';
        pickerInput.accept = 'video/*';
        pickerInput.setAttribute('capture', 'environment');

        pickerInput.addEventListener('change', () => {
          const capturedFiles = Array.from(pickerInput.files || []);
          if (capturedFiles.length === 0) return;

          if (input.multiple) {
            selectedFiles = uniqueFiles(selectedFiles, capturedFiles);
          } else {
            selectedFiles = [capturedFiles[capturedFiles.length - 1]];
          }
          selectedFilesByUpload.set(name, selectedFiles);

          const merged = mergeFilesIntoInput(input, selectedFiles);
          if (!merged) {
            showToast('Video captured. Please reselect it from files if it does not appear.', 'info');
          }

          input.dispatchEvent(new Event('change'));
        }, { once: true });

        pickerInput.click();
      });
    }

    input.addEventListener('change', async () => {
      if (!previewGrid) return;
      // Remove previous "new file" items (keep existing ones with data-url remove buttons)
      previewGrid.querySelectorAll('.file-preview-new').forEach(el => el.remove());

      const incoming = Array.from(input.files || []);
      if (input.multiple) {
        selectedFiles = uniqueFiles(selectedFiles, incoming);
        mergeFilesIntoInput(input, selectedFiles);
      } else {
        selectedFiles = incoming.length > 0 ? [incoming[incoming.length - 1]] : [];
      }
      selectedFilesByUpload.set(name, selectedFiles);

      let hasOversized = false;
      let hasHeicPreviewFailure = false;

      for (const file of selectedFiles) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          hasOversized = true;
          continue;
        }

        const devDiv = document.createElement('div');
        devDiv.className = 'file-preview-item file-preview-new';
        previewGrid.appendChild(devDiv);

        try {
          let displayUrl = URL.createObjectURL(file);
          const isVideo = file.type.startsWith('video/');
          const isHeic = isLikelyHeicFile(file);

          if (isHeic) {
            devDiv.innerHTML = '<div class="converting-badge">Converting...</div>';
            try {
              const jpegBlob = await convertHeicToJpegBlob(file);
              displayUrl = URL.createObjectURL(jpegBlob);
              devDiv.innerHTML = '';
            } catch (conversionError) {
              console.error('HEIC preview conversion failed:', conversionError);
              hasHeicPreviewFailure = true;
              devDiv.innerHTML = '<div class="badge">HEIC selected</div>';
              continue;
            }
          }

          if (isVideo) {
            const vid = document.createElement('video');
            vid.className = 'file-preview-thumb';
            vid.src = displayUrl;
            vid.muted = true;
            vid.onloadedmetadata = () => vid.currentTime = 1;
            devDiv.appendChild(vid);
          } else if (file.type.startsWith('image/') || isHeic) {
            const img = document.createElement('img');
            img.className = 'file-preview-thumb';
            img.src = displayUrl;
            devDiv.appendChild(img);
          } else {
            devDiv.innerHTML = `<div class="badge">${file.name}</div>`;
          }
        } catch (err) {
          console.error('Preview error:', err);
          devDiv.innerHTML = `<div class="badge error">Preview Error</div>`;
        }
      }

      if (hasOversized) {
        showToast('Some files skipped (Max 200MB limit)', 'error');
      }

      if (hasHeicPreviewFailure) {
        showToast('Some HEIC files could not be previewed, but they can still upload.', 'warning');
      }
    });

    // Cleanup redundant braces from previous multi_replace

  });

  // Map picker: hidden by default and initialized only when opened
  let map, marker;
  let isMapInitialized = false;
  const mapWrapper = document.getElementById('map-picker-wrapper');
  const toggleMapPickerBtn = document.getElementById('toggle-map-picker-btn');

  function updateMarker(newLat, newLng) {
    document.getElementById('latitude').value = newLat;
    document.getElementById('longitude').value = newLng;
    if (marker) {
      marker.setLatLng([newLat, newLng]);
    } else if (map) {
      marker = L.marker([newLat, newLng], { draggable: true }).addTo(map);
      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        updateMarker(pos.lat, pos.lng);
      });
    }
  }

  const initializeMapPicker = () => {
    if (isMapInitialized) return;
    const mapEl = document.getElementById('map-picker');
    if (!mapEl) return;

    isMapInitialized = true;
    const lat = Number(item.latitude) || 20.5937;
    const lng = Number(item.longitude) || 78.9629;
    const hasExisting = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude));

    map = L.map('map-picker', {
      zoomControl: true,
      dragging: !L.Browser.mobile,
      tap: !L.Browser.mobile
    }).setView([lat, lng], hasExisting ? 16 : 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'OpenStreetMap'
    }).addTo(map);

    if (L.Control.Geocoder) {
      L.Control.geocoder({
        defaultMarkGeocode: false,
        placeholder: 'Search address...',
      }).on('markgeocode', function(e) {
        const center = e.geocode.center;
        map.setView(center, 16);
        updateMarker(center.lat, center.lng);
      }).addTo(map);
    }

    if (hasExisting) {
      updateMarker(lat, lng);
    }

    map.on('click', (e) => {
      updateMarker(e.latlng.lat, e.latlng.lng);
    });

    document.getElementById('gps-btn').onclick = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], 17);
          updateMarker(latitude, longitude);
        }, (err) => showToast('GPS failed: ' + err.message, 'error'));
      } else {
        showToast('GPS not supported', 'error');
      }
    };

    document.getElementById('clear-pin-btn').onclick = () => {
      if (marker) {
        map.removeLayer(marker);
        marker = null;
      }
      document.getElementById('latitude').value = '';
      document.getElementById('longitude').value = '';
    };
  };

  if (toggleMapPickerBtn && mapWrapper) {
    toggleMapPickerBtn.onclick = () => {
      const shouldOpen = mapWrapper.style.display === 'none';
      mapWrapper.style.display = shouldOpen ? 'block' : 'none';
      toggleMapPickerBtn.textContent = shouldOpen ? 'Hide Interactive Map' : 'View Interactive Map';

      if (shouldOpen) {
        initializeMapPicker();
        setTimeout(() => map?.invalidateSize(), 150);
      }
    };
  }


  // Submit (Update)

  document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-btn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
      const data = {};
      const fileFields = [];
      const getSelectedFiles = (uploadKey, inputEl) => {
        const snapshot = selectedFilesByUpload.get(uploadKey);
        if (Array.isArray(snapshot) && snapshot.length > 0) {
          return snapshot;
        }
        return Array.from(inputEl?.files || []);
      };

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
              const fileInput = container.querySelector(`[data-upload="${field.name}Photo"] input[data-main-upload="true"]`);
              const selected = getSelectedFiles(`${field.name}Photo`, fileInput);
              if (selected.length > 0) {
                fileFields.push({ name: field.name, files: selected, isFacility: true });
              }
            }
          } else if (field.type === 'file') {
            // Collect remaining existing URLs
            const remaining = Array.from(container.querySelectorAll(`[data-previews="${field.name}"] .file-remove-btn`))
                                   .map(b => b.dataset.url);
            data[`images.${field.name}`] = remaining;

            const fileInput = container.querySelector(`[data-upload="${field.name}"] input[data-main-upload="true"]`);
            const selected = getSelectedFiles(field.name, fileInput);
            if (selected.length > 0) {
              fileFields.push({ name: field.name, files: selected });
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
        btn.textContent = 'Uploading media...';
        const uploaded = await Promise.all(
          fileFields.map(async (f) => {
            const urls = await uploadMultipleFiles(f.files, `properties/${id}/${f.name}`);
            return { field: f, urls };
          })
        );

        uploaded.forEach(({ field: f, urls }) => {
          if (urls.length > 0) {
            if (f.isFacility) {
              data[`${f.name}Photo`] = urls[0];
            } else {
              // Merge with remaining
              const existing = data[`images.${f.name}`] || [];
              data[`images.${f.name}`] = [...existing, ...urls];
            }
          }
        });
      }

      await updateInventoryItem(id, data);
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
