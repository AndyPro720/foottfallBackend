import { getProjectById, getProjectUnits } from '../backend/projectService.js';

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
    const [project, units] = await Promise.all([
      getProjectById(projectId),
      getProjectUnits(projectId)
    ]);

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
      unitsHtml = units.map(unit => buildUnitCard(unit)).join('');
    }

    container.innerHTML = `
      <button class="back-btn" onclick="location.hash='#'">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
        Back to Home
      </button>

      <div class="project-detail-header">
        <div style="display:flex;align-items:center;gap:var(--space-sm)">
          <span class="project-badge" style="position:static">PROJECT</span>
        </div>
        <h1 class="text-heading" style="margin-top:var(--space-sm)">${escHtml(project.name)}</h1>
        ${facadeHtml}
        <div class="project-detail-info">
          ${infoRows.join('')}
        </div>
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
    `;
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

function buildUnitCard(unit) {
  const unitName = unit.unitName || unit.name || 'Unnamed Unit';
  const floor = unit.floor ? `Floor: ${unit.floor}` : '';
  const size = unit.size ? `${unit.size} sqft` : '';
  const price = unit.price ? `₹${unit.price}/sqft` : '';
  const status = unit.propertyStatus || '';

  // Thumbnail
  let thumbHtml = `
    <div class="card-thumbnail-wrapper">
      <div class="card-thumbnail-file">
        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1"/>
        </svg>
      </div>
    </div>
  `;
  const unitImages = unit.images?.unitFacade || unit.images?.interior || [];
  if (unitImages.length > 0) {
    const firstImg = unitImages[0];
    const imgUrl = typeof firstImg === 'string' ? firstImg : firstImg.url;
    if (imgUrl) {
      thumbHtml = `
        <div class="card-thumbnail-wrapper">
          <img class="card-thumbnail" src="${imgUrl}" alt="${escHtml(unitName)}" loading="lazy">
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
