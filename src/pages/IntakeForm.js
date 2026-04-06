import { createInventoryItem, updateInventoryItem } from '../backend/inventoryService.js';
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
            <input type="file" data-main-upload="true" accept="image/*,video/*" />
            <input type="file" data-video-capture="true" accept="video/*" capture="environment" />
            <button type="button" class="capture-video-btn">Record Video</button>
          </div>
          <div class="file-preview-grid" data-previews="${field.name}Photo"></div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderFileUpload(field) {
  const conditionalAttr = field.conditionalOn
    ? ` data-conditional-on="${field.conditionalOn.field}" data-conditional-value="${field.conditionalOn.value}" style="display:none;"`
    : '';
  return `
    <div class="form-group"${conditionalAttr}>
      <label class="form-label">${field.label}</label>
      <div class="file-upload-zone" data-upload="${field.name}">
        <svg class="file-upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        <p class="text-caption">${field.multiple ? 'Tap to add photos/videos' : 'Tap to upload'}</p>
        <input type="file" data-main-upload="true" accept="${field.accept}" ${field.multiple ? 'multiple' : ''} />
        <input type="file" data-video-capture="true" accept="video/*" capture="environment" />
        <button type="button" class="capture-video-btn">Record Video</button>
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
    const input = zone.querySelector('input[data-main-upload="true"]') || zone.querySelector('input[type="file"]');
    const captureButton = zone.querySelector('.capture-video-btn');
    const uploadName = zone.dataset.upload;
    const previewGrid = container.querySelector(`[data-previews="${uploadName}"]`);
    let selectedFiles = Array.from(input.files || []);

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
      previewGrid.innerHTML = '';

      const incoming = Array.from(input.files || []);
      if (input.multiple) {
        selectedFiles = uniqueFiles(selectedFiles, incoming);
        mergeFilesIntoInput(input, selectedFiles);
      } else {
        selectedFiles = incoming.length > 0 ? [incoming[incoming.length - 1]] : [];
      }

      let hasOversized = false;
      let hasHeicPreviewFailure = false;

      for (const file of selectedFiles) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          hasOversized = true;
          continue;
        }

        const devDiv = document.createElement('div');
        devDiv.className = 'file-preview-item';
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
            vid.onloadedmetadata = () => vid.currentTime = 1; // Show thumbnail
            devDiv.appendChild(vid);
          } else if (file.type.startsWith('image/') || isHeic) {
            const img = document.createElement('img');
            img.className = 'file-preview-thumb';
            img.src = displayUrl;
            img.loading = 'lazy';
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
  });

    // ─── Phase 9: Initialize Map ───
    let map;
  let marker;
  let isMapInitialized = false;

  const mapWrapper = document.getElementById('map-picker-wrapper');
  const toggleMapPickerBtn = document.getElementById('toggle-map-picker-btn');

  const updateMarker = (lat, lng) => {
    document.getElementById('latitude').value = lat;
    document.getElementById('longitude').value = lng;

    if (marker) {
      marker.setLatLng([lat, lng]);
    } else if (map) {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        updateMarker(pos.lat, pos.lng);
      });
    }
  };

  const initializeMapPicker = () => {
    if (isMapInitialized) return;

    const mapEl = document.getElementById('map-picker');
    if (!mapEl) return;
    isMapInitialized = true;

    const defaultPos = [20.5937, 78.9629];
    map = L.map('map-picker', {
      zoomControl: true,
      dragging: !L.Browser.mobile,
      tap: !L.Browser.mobile
    }).setView(defaultPos, 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map);

    if (L.Control.Geocoder) {
      const geocoder = L.Control.geocoder({
        defaultMarkGeocode: false,
        placeholder: 'Search address...'
      }).on('markgeocode', function(e) {
        const center = e.geocode.center;
        map.setView(center, 16);
        updateMarker(center.lat, center.lng);
      }).addTo(map);
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

  // ─── Form submission ───

  document.getElementById('intake-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const errorContainer = document.getElementById('form-error');
    errorContainer.innerHTML = '';

    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
      const data = {};
      const fileFields = [];

      SECTIONS.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'toggle') {
            const group = container.querySelector(`[data-toggle="${field.name}"]`);
            const activeBtn = group?.querySelector('.toggle-option.active');
            const isYes = activeBtn?.dataset.value === 'yes';
            data[field.name] = isYes;

            if (field.hasCount && isYes) {
              const countInput = container.querySelector(`#${field.name}Count`);
              if (countInput?.value) data[`${field.name}Count`] = Number(countInput.value);
            }

            if (field.hasPhoto && isYes) {
              const fileInput = container.querySelector(`[data-upload="${field.name}Photo"] input[data-main-upload="true"]`);
              if (fileInput?.files?.length > 0) {
                fileFields.push({
                  name: field.name,
                  files: Array.from(fileInput.files),
                  isFacility: true
                });
              }
            }
          } else if (field.type === 'file') {
            const fileInput = container.querySelector(`[data-upload="${field.name}"] input[data-main-upload="true"]`);
            if (fileInput?.files?.length > 0) {
              fileFields.push({
                name: field.name,
                files: Array.from(fileInput.files)
              });
            }
          } else {
            const input = container.querySelector(`#${field.name}`);
            if (input?.value) data[field.name] = input.value;
          }
        });
      });

      const lat = document.getElementById('latitude')?.value;
      const lng = document.getElementById('longitude')?.value;
      if (lat && lng) {
        data.latitude = Number(lat);
        data.longitude = Number(lng);
      }

      data.status = 'active';
      data.images = {};
      data.mediaUploadPending = fileFields.length > 0;

      const docId = await createInventoryItem(data);
      if (typeof window.__invalidateHomeCache === 'function') {
        window.__invalidateHomeCache();
      }

      if (fileFields.length > 0) {
        const runBackgroundUpload = async () => {
          if (!navigator.onLine) {
            showToast('Property saved. Media upload will continue when internet is back.', 'warning');
            window.addEventListener('online', () => {
              runBackgroundUpload().catch((retryErr) => {
                console.error('Background media upload retry failed:', retryErr);
              });
            }, { once: true });
            return;
          }

          let hadUploadFailure = false;
          for (const field of fileFields) {
            if (!Array.isArray(field.files) || field.files.length === 0) {
              hadUploadFailure = true;
              console.warn(`No files available in background snapshot for ${field.name}`);
              continue;
            }

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
                await updateInventoryItemWithRetry(docId, updateData);
              } else {
                hadUploadFailure = true;
              }
            } catch (uploadErr) {
              hadUploadFailure = true;
              console.error(`Upload failed for ${field.name}:`, uploadErr);
            }
          }

          await updateInventoryItemWithRetry(docId, { mediaUploadPending: hadUploadFailure });
          if (typeof window.__invalidateHomeCache === 'function') {
            window.__invalidateHomeCache();
          }

          if (hadUploadFailure) {
            showToast('Property created. Some media failed to sync.', 'error');
          } else {
            showToast('Property media synced in background.', 'success');
          }
        };

        showToast('Property saved. You can continue adding more while media uploads.', 'info');
        window.location.hash = '#';
        setTimeout(() => {
          runBackgroundUpload().catch((bgErr) => {
            console.error('Background media upload failed:', bgErr);
          });
        }, 0);
        return;
      }

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
