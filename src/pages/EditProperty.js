import { getInventoryItemById, updateInventoryItem, getInventoryItems } from '../backend/inventoryService.js';
import { uploadMultipleFiles } from '../backend/storageService.js';
import { createUploadSession, addUploadLog } from '../components/UploadTracker.js';
import { SECTIONS } from '../config/propertyFields.js';
import { heicTo } from 'heic-to';
import { showToast } from '../utils/ui.js';
import { extractFacets } from '../utils/filterEngine.js';
import { initCreatableSelect } from '../utils/creatableSelect.js';
import {
  acceptsVideo,
  getFileExtensionLabel,
  getFileKindLabel,
  isCadUrl,
  isDocUrl,
  isPdfUrl,
  isVideoUrl,
} from '../utils/media.js';

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200MB
const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i;

function isLikelyVideoFile(file) {
  if (file.type && file.type.startsWith('video/')) return true;
  return VIDEO_EXTENSIONS.test(file.name || '');
}

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

function isDocumentNotReadyError(error) {
  const message = String(error?.message || '');
  return error?.code === 'not-found' || message.includes('No document to update');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateInventoryItemWithRetry(id, data, maxAttempts = 5) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await updateInventoryItem(id, data);
      return;
    } catch (error) {
      lastError = error;
      if (!isDocumentNotReadyError(error) || attempt === maxAttempts) {
        throw error;
      }
      await wait(attempt * 300);
    }
  }
  throw lastError;
}

function getUploadPrompt(field, existing = false) {
  const hasVideo = acceptsVideo(field.accept);
  if (hasVideo) {
    return field.multiple
      ? (existing ? 'Add more photos/videos...' : 'Tap to add photos/videos')
      : (existing ? 'Tap to replace media' : 'Tap to upload media');
  }
  return field.multiple
    ? (existing ? 'Add more files...' : 'Tap to add files')
    : (existing ? 'Tap to replace file' : 'Tap to upload file');
}

function renderExistingFilePreviewContent(url) {
  if (isVideoUrl(url)) {
    return `<video src="${url}" class="file-preview-thumb" muted preload="metadata"></video>`;
  }

  if (isPdfUrl(url) || isDocUrl(url) || isCadUrl(url)) {
    return `
      <div class="file-preview-file-card">
        <span class="file-preview-file-ext">${getFileExtensionLabel(url)}</span>
        <span class="file-preview-file-kind">${getFileKindLabel(url)}</span>
      </div>
    `;
  }

  return `<img src="${url}" class="file-preview-thumb" />`;
}

// Render helpers (reused from IntakeForm)

function renderField(field, value) {
  let html = '';
  if (field.type === 'select') html = renderSelect(field, value);
  else if (field.type === 'creatable-select') html = renderCreatableSelect(field, value);
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

function renderCreatableSelect(field, value = '') {
  const conditionalAttr = field.conditionalOn
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"`
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label" for="${field.name}">${field.label}${field.required ? ' *' : ''}</label>
      <input class="form-input" type="text" id="${field.name}" name="${field.name}"
             value="${value || ''}"
             placeholder="${field.placeholder || 'Type or select...'}" ${field.required ? 'required' : ''} autocomplete="off" />
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
  const hasVideoCapture = acceptsVideo(field.accept);
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label">${field.label}</label>
      <div class="file-preview-grid" data-previews="${field.name}">
        ${(existingUrls || []).map(url => `
          <div class="file-preview-item">
            ${renderExistingFilePreviewContent(url)}
            <button type="button" class="file-remove-btn" data-url="${url}">&times;</button>
          </div>
        `).join('')}
      </div>
      <div class="file-upload-zone" data-upload="${field.name}" style="margin-top: var(--space-sm)">
        <svg class="file-upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 16V4m0 0l-4 4m4-4l4 4"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16.5v1.5A2 2 0 006 20h12a2 2 0 002-2v-1.5"></path></svg>
        <p class="text-caption">${getUploadPrompt(field, true)}</p>
        <input type="file" data-main-upload="true" accept="${field.accept}" ${field.multiple ? 'multiple' : ''} />
        ${hasVideoCapture ? '<input type="file" data-video-capture="true" accept="video/*" capture="environment" />' : ''}
        ${hasVideoCapture ? '<button type="button" class="capture-video-btn">Record Video</button>' : ''}
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

  let facets = {};
  let cityTradeAreaMap = {};
  try {
    const items = await getInventoryItems({});
    facets = extractFacets(items);
    cityTradeAreaMap = facets.cityTradeAreaMap || {};
  } catch (err) {
    console.warn("Could not fetch inventory for autocomplete", err);
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

  // ─── Creatable Select Dropdowns (City → Trade Area dependency) ───
  const cityInput = container.querySelector('#city');
  const tradeAreaInput = container.querySelector('#tradeArea');
  let cityCS = null;
  let tradeAreaCS = null;

  if (cityInput) {
    cityCS = initCreatableSelect(cityInput, facets.cities || [], {
      onChange(selectedCity) {
        if (tradeAreaCS) {
          const validAreas = cityTradeAreaMap[selectedCity] || facets.tradeAreas || [];
          tradeAreaCS.setOptions(validAreas);
        }
      }
    });
  }

  if (tradeAreaInput) {
    // Pre-filter trade areas by current city if one is set
    const currentCity = item?.city || '';
    const initialAreas = (currentCity && cityTradeAreaMap[currentCity])
      ? cityTradeAreaMap[currentCity]
      : (facets.tradeAreas || []);
    tradeAreaCS = initCreatableSelect(tradeAreaInput, initialAreas);
  }

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
          const isVideo = isLikelyVideoFile(file);
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
            vid.playsInline = true;
            vid.onloadedmetadata = () => vid.currentTime = 1;
            vid.onerror = () => { devDiv.innerHTML = '<div class="badge">🎬 Video</div>'; };
            devDiv.appendChild(vid);
          } else if (file.type.startsWith('image/') || isHeic) {
            const img = document.createElement('img');
            img.className = 'file-preview-thumb';
            img.src = displayUrl;
            devDiv.appendChild(img);
          } else {
            devDiv.innerHTML = `
              <div class="file-preview-file-card">
                <span class="file-preview-file-ext">${getFileExtensionLabel(file.name)}</span>
                <span class="file-preview-file-kind">${getFileKindLabel(file.name)}</span>
              </div>
            `;
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
            const input = container.querySelector(`#${field.name}`);
            const val = input?.value;
            if (val === undefined || val === '') return;

            if (field.type === 'number') {
              const numericValue = Number(val);
              if (!Number.isNaN(numericValue)) {
                data[field.name] = numericValue;
              }
            } else {
              data[field.name] = val;
            }
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

      data.mediaUploadPending = fileFields.length > 0;

      // Handle new photo uploads with background sync
      if (fileFields.length > 0) {
        const runBackgroundUpload = async () => {
          if (!navigator.onLine) {
            addUploadLog('⏸ Offline — upload paused until reconnect', 'pending');
            window.addEventListener('online', () => {
              addUploadLog('🌐 Back online — resuming uploads');
              runBackgroundUpload().catch((retryErr) => {
                console.error('Background media upload retry failed:', retryErr);
              });
            }, { once: true });
            return;
          }

          const allFiles = fileFields.flatMap(f => Array.from(f.files || []));
          const session = createUploadSession('Property Media', allFiles);

          let hadUploadFailure = false;
          let fileOffset = 0;

          for (const field of fileFields) {
            if (!Array.isArray(field.files) || field.files.length === 0) {
              hadUploadFailure = true;
              addUploadLog(`⚠ No files for ${field.name}`, 'error');
              continue;
            }

            const currentOffset = fileOffset;
            const path = `properties/${id}/${field.name}`;
            try {
              const urls = await uploadMultipleFiles(field.files, path, null, (idx, pct, status, error) => {
                const globalIdx = currentOffset + idx;
                if (status === 'converting') session.markConverting(globalIdx);
                else if (status === 'error') session.markError(globalIdx, error);
                else if (status === 'done') session.markDone(globalIdx);
                else session.updateProgress(globalIdx, pct);
              });

              if (urls.length > 0) {
                const updateData = {};
                if (field.isFacility) {
                  updateData[`${field.name}Photo`] = urls[0];
                } else {
                  const existing = data[`images.${field.name}`] || [];
                  updateData[`images.${field.name}`] = [...existing, ...urls];
                }
                addUploadLog(`Saving ${field.name} to database...`);
                await updateInventoryItemWithRetry(id, updateData);
              } else {
                hadUploadFailure = true;
              }
            } catch (uploadErr) {
              hadUploadFailure = true;
              for (let i = 0; i < field.files.length; i++) {
                session.markError(currentOffset + i, uploadErr.message || 'Upload failed');
              }
              console.error(`Upload failed for ${field.name}:`, uploadErr);
            }
            fileOffset += field.files.length;
          }

          await updateInventoryItemWithRetry(id, { mediaUploadPending: hadUploadFailure });
          if (typeof window.__invalidateHomeCache === 'function') {
            window.__invalidateHomeCache();
          }

          const { done, errors } = session.summary;
          if (hadUploadFailure) {
            addUploadLog(`⚠ ${done} uploaded, ${errors} failed`, 'error');
          } else {
            addUploadLog(`✓ All ${done} files synced`, 'done');
          }
        };

        // First update the property locally (fast)
        await updateInventoryItemWithRetry(id, data);
        
        addUploadLog('Property data saved. Starting media upload...');
        showToast('Changes saved. You can continue browsing while media uploads.', 'info');
        window.location.hash = `#property/${id}`;
        
        // Start background upload
        setTimeout(() => {
          runBackgroundUpload().catch((bgErr) => {
            addUploadLog(`✗ Upload crashed: ${bgErr.message}`, 'error');
            console.error('Background media upload failed:', bgErr);
          });
        }, 0);
        return;
      }

      await updateInventoryItem(id, data);
      showToast('Changes saved successfully', 'success');
      window.location.hash = `#property/${id}`;
    } catch (err) {
      console.error(err);
      alert('Failed to save changes: ' + err.message);
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  };
};
