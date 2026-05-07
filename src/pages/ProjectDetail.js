import { getProjectById, getProjectUnits, deleteProject, updateProject } from '../backend/projectService.js';
import { PROJECT_INHERITED_FIELD_NAMES, PROJECT_MEDIA_FIELD_NAMES } from '../config/propertyFields.js';
import { isBrokerItem, isMergeableItem } from '../utils/propertyFlags.js';

/**
 * Renders the Project Detail view showing project info + unit list.
 * @param {HTMLElement} container The app container element.
 * @param {string} projectId The project document ID.
 */
export async function renderProjectDetail(container, projectId) {
  // Show skeleton while loading
  container.innerHTML = `
    <button class="back-btn" onclick="location.hash='#'">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
      Back to Home
    </button>
    <div class="skeleton skeleton-card" style="height:180px;margin-bottom:16px"></div>
    <div class="skeleton skeleton-card" style="height:120px"></div>
  `;

  try {
    let project, units;
    try {
      project = await getProjectById(projectId, { preferFresh: true });
      try {
        units = await getProjectUnits(projectId);
      } catch (e) {
        console.warn("Failed to fetch project units (access restricted?):", e);
        units = [];
      }
    } catch (err) {
      console.error("Failed to load project header:", err);
      throw err; // Re-throw to main catch block
    }

    if (!project) {
      container.innerHTML = `
        <button class="back-btn" onclick="location.hash='#'">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to Home
        </button>
        <div class="error-inline">Project not found or access denied.</div>
      `;
      return;
    }

    // Build project info section
    const infoRows = [];
    if (project.buildingType) infoRows.push(buildInfoRow('Type', project.buildingType));
    if (project.location) infoRows.push(buildInfoRow('Address', project.location));
    if (project.city) infoRows.push(buildInfoRow('City', project.city));
    if (project.tradeArea) infoRows.push(buildInfoRow('Trade Area', project.tradeArea));
    if (project.vicinityBrands) infoRows.push(buildInfoRow('Vicinity', project.vicinityBrands));
    if (project.buildingAge) infoRows.push(buildInfoRow('Building Age', `${project.buildingAge} years`));
    if (project.contactName) infoRows.push(buildInfoRow('Contact', project.contactName));
    if (project.contactDesignation) infoRows.push(buildInfoRow('Designation', project.contactDesignation));
    if (project.contactInfo) infoRows.push(buildInfoRow('Phone/Email', project.contactInfo));
    const projectNotes = project.projectNotes || project.miscNotes;
    if (projectNotes) infoRows.push(buildInfoRow('Notes', escHtml(projectNotes)));
    if (project.presentationAvailable && project.presentationLink) {
      infoRows.push(buildInfoRow('Presentation Link', `<a href="${project.presentationLink}" target="_blank" rel="noopener" style="color:var(--accent-green);text-decoration:underline">Open presentation</a>`));
    }
    if (project.googleMapsLink) {
      infoRows.push(buildInfoRow('Map', `<a href="${project.googleMapsLink}" target="_blank" rel="noopener" style="color:var(--accent-green);text-decoration:underline">View on Google Maps</a>`));
    }

    // Build facade preview
    let facadeHtml = '';
    const facadeImages = project.images?.buildingFacade || [];
    if (facadeImages.length > 0) {
      const firstImg = facadeImages[0];
      const imgUrl = typeof firstImg === 'string' ? firstImg : firstImg.url;
      if (imgUrl) {
        facadeHtml = `
          <div style="margin-top:var(--space-md);border-radius:var(--radius-md);overflow:hidden;max-height:200px">
            <img src="${imgUrl}" alt="Building Facade" style="width:100%;height:200px;object-fit:cover" loading="lazy">
          </div>
        `;
      }
    }
    const projectMediaHtml = buildProjectMediaHtml(project);

    // Build unit cards
    let unitsHtml = '';
    if (units.length === 0) {
      unitsHtml = `
        <div class="project-empty-state">
          <svg width="48" height="48" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>
          </svg>
          <p>No units added yet.<br>Add your first unit to this project.</p>
        </div>
      `;
    } else {
      unitsHtml = units.map(unit => buildUnitCard(unit, project)).join('');
    }

    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#'">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Home
      </button>

      <div class="project-detail-header">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--space-sm)">
          <span class="project-badge" style="position:static">PROJECT</span>
          <button class="btn-secondary btn-sm" id="share-project-btn" style="width:auto;min-height:0;padding:6px 12px;display:flex;align-items:center;gap:6px">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
            Share
          </button>
        </div>
        <h1 class="text-heading" style="margin-top:var(--space-sm); display:flex; align-items:center; gap:var(--space-sm)">
          ${escHtml(project.name)}
        </h1>
        <div style="font-size:12px; color:var(--text-tertiary); margin-bottom:var(--space-md)">
          Created by ${escHtml(project.creatorName || 'Unknown')} 
          ${project.createdBy ? `(${escHtml(window.__cachedUserRoleMap?.[project.createdBy] || 'agent')})` : ''} 
          · ${project.created_at ? new Date(project.created_at.seconds * 1000).toLocaleDateString() : 'Unknown date'}
        </div>
        ${facadeHtml}
        <div class="project-detail-info">
          ${infoRows.join('')}
        </div>
        ${projectMediaHtml}
      </div>

      <div class="project-units-section">
        <div class="project-units-header">
          <span class="text-subheading">Units (${units.length})</span>
          <button class="btn-add-unit" onclick="location.hash='#add?projectId=${projectId}'">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Add Unit
          </button>
        </div>
        ${unitsHtml}
      </div>

      <div style="margin-top: var(--space-xl); display: flex; gap: var(--space-md); flex-wrap: wrap;">
        <button class="btn-secondary" style="flex:1; min-width:140px; display:flex; align-items:center; justify-content:center; gap:8px" id="edit-project-btn">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
          Edit Project
        </button>
        <button class="btn-secondary destructive" style="flex:1; min-width:140px; border-color: var(--destructive); color: var(--destructive); display:flex; align-items:center; justify-content:center; gap:8px" id="delete-project-btn">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
          Delete Project
        </button>
      </div>
    `;

    // Share Project handler
    document.getElementById('share-project-btn').onclick = async () => {
      const unitCount = units.length;
      const shareText = [
        `Project: ${project.name}`,
        `Location: ${[project.tradeArea, project.city].filter(Boolean).join(', ') || 'N/A'}`,
        `Total Units: ${unitCount}`,
        `Vicinity: ${project.vicinityBrands || 'N/A'}`
      ].join('\n');
      
      const shareData = {
        title: `Foottfall Project: ${project.name}`,
        text: shareText,
        url: window.location.href
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(`${shareText}\nLink: ${shareData.url}`);
          const { showToast } = await import('../utils/ui.js');
          showToast('Project details copied', 'success');
        }
      } catch (err) { console.warn('Share failed', err); }
    };

    // Edit Project handler - navigate to full edit form
    document.getElementById('edit-project-btn').onclick = () => {
      window.location.hash = `#edit-project/${projectId}`;
    };

    // Delete Project handler
    document.getElementById('delete-project-btn').onclick = async () => {
      const unitCount = units.length;
      const confirmMsg = unitCount > 0
        ? `Delete this project and unlink its ${unitCount} unit(s)? The units will become standalone properties. This cannot be undone.`
        : 'Delete this project? This cannot be undone.';
      if (!confirm(confirmMsg)) return;

      const { deleteInventoryItem, updateInventoryItem } = await import('../backend/inventoryService.js');
      const deleteAllUnits = confirm('Do you also want to PERMANENTLY DELETE all units inside this project?\n\nOK = Delete all units\nCancel = Keep units (they will be unlinked)');

      try {
        if (deleteAllUnits) {
          for (const unit of units) {
            try {
              await deleteInventoryItem(unit.id);
            } catch (e) { console.warn('Failed to delete unit', unit.id, e); }
          }
        } else {
          // Convert units into standalone properties before removing the project link.
          for (const unit of units) {
            try {
              await updateInventoryItem(unit.id, buildStandaloneUnitData(unit, project));
            } catch (e) { console.warn('Failed to unlink unit', unit.id, e); }
          }
        }
        await deleteProject(projectId);
        if (typeof window.__invalidateHomeCache === 'function') window.__invalidateHomeCache();
        const { showToast } = await import('../utils/ui.js');
        showToast('Project deleted', 'success');
        window.location.hash = '#';
      } catch (err) {
        const { showToast } = await import('../utils/ui.js');
        showToast('Failed to delete project: ' + (err.message || ''), 'error');
      }
    };
  } catch (error) {
    console.error('Failed to load project:', error);
    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#'">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Home
      </button>
      <div class="error-inline">Failed to load project. ${error.message || ''}</div>
    `;
  }
}

function buildInfoRow(label, value) {
  return `
    <div class="project-detail-info-row">
      <span class="project-detail-info-label">${label}</span>
      <span class="project-detail-info-value">${value}</span>
    </div>
  `;
}

function hasMeaningfulValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function buildStandaloneUnitData(unit, project) {
  const data = {
    projectId: null,
    name: unit.unitName || unit.name || project?.name || 'Unnamed Property',
  };

  if (hasMeaningfulValue(unit.unitName)) {
    data.unitName = unit.unitName;
  }

  PROJECT_INHERITED_FIELD_NAMES.forEach((fieldName) => {
    if (fieldName === 'name') return;
    if (fieldName === 'projectNotes') return;
    const value = hasMeaningfulValue(project?.[fieldName]) ? project[fieldName] : unit?.[fieldName];
    if (hasMeaningfulValue(value)) {
      data[fieldName] = value;
    }
  });

  const unitNotes = String(unit?.miscNotes || '').trim();
  const projectNotes = String(project?.projectNotes || project?.miscNotes || '').trim();
  if (projectNotes) {
    data.miscNotes = unitNotes ? `${unitNotes}\n\nProject notes: ${projectNotes}` : projectNotes;
  } else if (unitNotes) {
    data.miscNotes = unit.miscNotes;
  }

  const mergedImages = { ...(unit.images || {}) };
  PROJECT_MEDIA_FIELD_NAMES.forEach((fieldName) => {
    const projectUrls = Array.isArray(project?.images?.[fieldName]) ? project.images[fieldName] : [];
    if (projectUrls.length > 0) {
      mergedImages[fieldName] = projectUrls;
    }
  });

  if (Object.keys(mergedImages).length > 0) {
    data.images = mergedImages;
  }

  return data;
}

function buildProjectMediaHtml(project) {
  const mediaSections = [];
  const entryMedia = Array.isArray(project.images?.entryToBuilding) ? project.images.entryToBuilding : [];
  const presentationFiles = Array.isArray(project.images?.presentationFile) ? project.images.presentationFile : [];

  if (entryMedia.length > 0) {
    mediaSections.push(`
      <div style="margin-top:var(--space-md)">
        <div class="project-detail-info-label" style="margin-bottom:6px">Entry To Building</div>
        <div style="display:flex; flex-direction:column; gap:6px">
          ${entryMedia.map((url, index) => `
            <a href="${url}" target="_blank" rel="noopener" style="color:var(--accent-green);text-decoration:underline">
              Open entry media ${index + 1}
            </a>
          `).join('')}
        </div>
      </div>
    `);
  }

  if (presentationFiles.length > 0) {
    mediaSections.push(`
      <div style="margin-top:var(--space-md)">
        <div class="project-detail-info-label" style="margin-bottom:6px">Presentation Files</div>
        <div style="display:flex; flex-direction:column; gap:6px">
          ${presentationFiles.map((url, index) => `
            <a href="${url}" target="_blank" rel="noopener" style="color:var(--accent-green);text-decoration:underline">
              Open presentation file ${index + 1}
            </a>
          `).join('')}
        </div>
      </div>
    `);
  }

  if (mediaSections.length === 0) return '';

  return `
    <div class="project-detail-info">
      ${mediaSections.join('')}
    </div>
  `;
}

function buildUnitCard(unit, parentProject = null) {
  const unitName = unit.unitName || unit.name || 'Unnamed Unit';
  const floor = unit.floor ? `Floor: ${unit.floor}` : '';
  const size = unit.size ? `${unit.size} sqft` : '';
  const price = unit.price ? `₹${unit.price}/sqft` : '';
  const status = unit.propertyStatus || '';

  const isMergeable = isMergeableItem(unit, parentProject);
  const isBroker = isBrokerItem(unit, parentProject);
  const mergeableBadgeHtml = isMergeable ? `
    <div class="mergeable-badge" style="bottom:2px;right:2px;padding:2px" title="Mergeable Unit" aria-label="Mergeable Unit">
      <svg class="mergeable-icon" style="width:12px" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="10" width="38" height="30" rx="4" stroke="currentColor" stroke-width="4"/>
        <path d="M40 25H50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <path d="M45 20V30" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <rect x="50" y="10" width="38" height="30" rx="4" stroke="currentColor" stroke-width="4"/>
        <path d="M92 25H114" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
        <path d="M106 17L114 25L106 33" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  ` : '';

  // Thumbnail
  let thumbHtml = `
    <div class="card-thumbnail-wrapper" style="position:relative">
      <div class="card-thumbnail-file">
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"/>
        </svg>
      </div>
      ${isBroker ? '<div class="agent-source-marker" style="top:5px;right:5px;width:18px;height:18px;font-size:9px" title="Broker" aria-label="Broker">B</div>' : ''}
      ${mergeableBadgeHtml}
    </div>
  `;
  const unitImages = unit.images?.unitFacade || unit.images?.interior || [];
  if (unitImages.length > 0) {
    const firstImg = unitImages[0];
    const imgUrl = typeof firstImg === 'string' ? firstImg : firstImg.url;
    if (imgUrl) {
      thumbHtml = `
        <div class="card-thumbnail-wrapper" style="position:relative">
          <img class="card-thumbnail" src="${imgUrl}" alt="${escHtml(unitName)}" loading="lazy">
          ${isBroker ? '<div class="agent-source-marker" style="top:5px;right:5px;width:18px;height:18px;font-size:9px" title="Broker" aria-label="Broker">B</div>' : ''}
          ${mergeableBadgeHtml}
        </div>
      `;
    }
  }

  const details = [floor, size, price].filter(Boolean).join(' · ');
  const statusBadge = status ? `<span style="font-size:10px;padding:2px 6px;border-radius:var(--radius-sm);background:var(--bg-overlay);color:var(--text-secondary)">${escHtml(status)}</span>` : '';

  return `
    <a href="#property/${unit.id}" class="card card-interactive" style="display:flex;gap:var(--space-md);align-items:center;padding:var(--space-md);margin-bottom:var(--space-sm);text-decoration:none;cursor:pointer;position:relative">
      ${thumbHtml}
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:var(--text-sm);margin-bottom:2px">${escHtml(unitName)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${details}</div>
        ${statusBadge}
      </div>
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="flex-shrink:0;color:var(--text-tertiary)">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </a>
  `;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Renders an inline edit form for project fields.
 */
async function renderProjectEditInline(container, projectId, project) {
  const { PROJECT_SECTIONS } = await import('../config/propertyFields.js');

  // Build simple form fields from PROJECT_SECTIONS
  const fieldsHtml = PROJECT_SECTIONS.map(section => {
    const sectionFields = section.fields.filter(f => f.type !== 'file').map(f => {
      const val = project[f.name] || '';
      if (f.type === 'select') {
        return `
          <div class="form-group">
            <label class="form-label" for="proj-${f.name}">${f.label}</label>
            <select class="form-input form-select" id="proj-${f.name}" name="${f.name}">
              <option value="">Select...</option>
              ${f.options.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o}</option>`).join('')}
            </select>
          </div>
        `;
      }
      return `
        <div class="form-group">
          <label class="form-label" for="proj-${f.name}">${f.label}</label>
          <input class="form-input" type="${f.type || 'text'}" id="proj-${f.name}" name="${f.name}" value="${escHtml(String(val))}" placeholder="${f.placeholder || ''}" />
        </div>
      `;
    }).join('');
    if (!sectionFields) return '';
    return `
      <div class="form-section" data-section="${section.id}">
        <div class="form-section-header"><span class="text-subheading">${section.title}</span></div>
        <div class="form-section-body">${sectionFields}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <button class="back-btn" id="cancel-edit-btn">
      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
      Cancel
    </button>
    <div class="page-header animate-enter">
      <h1 class="text-display">Edit Project</h1>
      <p class="text-label">${escHtml(project.name)}</p>
    </div>
    <form id="project-edit-form" class="animate-enter" style="--delay:100ms">
      ${fieldsHtml}
      <div id="form-error"></div>
      <div style="display: flex; gap: var(--space-md)">
        <button type="submit" class="btn-primary" id="save-project-btn" style="flex: 2">Save Changes</button>
        <button type="button" class="btn-secondary" id="cancel-project-btn" style="flex: 1">Cancel</button>
      </div>
    </form>
  `;

  // Section collapse toggles
  container.querySelectorAll('.form-section-header').forEach(header => {
    header.addEventListener('click', () => header.parentElement.classList.toggle('collapsed'));
  });

  // Cancel buttons
  document.getElementById('cancel-edit-btn').onclick = () => renderProjectDetail(container, projectId);
  document.getElementById('cancel-project-btn').onclick = () => renderProjectDetail(container, projectId);

  // Submit handler
  document.getElementById('project-edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('save-project-btn');
    btn.classList.add('btn-loading');
    btn.disabled = true;

    try {
      const data = {};
      PROJECT_SECTIONS.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'file') return;
          const input = container.querySelector(`#proj-${field.name}`);
          if (!input) return;
          const val = input.value;
          if (val === '') return;
          data[field.name] = field.type === 'number' ? Number(val) : val;
        });
      });

      await updateProject(projectId, data);
      if (typeof window.__invalidateHomeCache === 'function') window.__invalidateHomeCache();
      const { showToast } = await import('../utils/ui.js');
      showToast('Project updated!', 'success');
      renderProjectDetail(container, projectId);
    } catch (err) {
      const errorContainer = document.getElementById('form-error');
      errorContainer.innerHTML = `<div class="error-inline"><span>⚠</span><span>${err.message || 'Failed to save.'}</span></div>`;
      btn.classList.remove('btn-loading');
      btn.disabled = false;
    }
  };
}
