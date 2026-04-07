import { getAllUsers, updateUserStatus, updateUserRole, removeUser, transferSuperadmin, createInvite } from '../backend/userRoleService.js';
import { createInventoryItem } from '../backend/inventoryService.js';
import { SECTIONS } from '../config/propertyFields.js';
import { showToast } from '../utils/ui.js';
import * as XLSX from 'xlsx';

export const renderAdminPage = async (container) => {
  const isSuperadmin = window.userProfile?.role === 'superadmin';

  container.innerHTML = `
    <div class="page-header animate-enter">
      <h1 class="text-display">Admin Control</h1>
      <p class="text-label">Manage users and approval status</p>
    </div>

    ${isSuperadmin ? `
    <div class="card animate-enter" style="--delay:50ms; padding:var(--space-md); margin-bottom:var(--space-lg); border-left: 4px solid var(--accent-blue);">
      <h3 class="text-subheading" style="margin:0 0 var(--space-sm) 0">Quick Invite (Superadmin)</h3>
      <p class="text-caption" style="margin-bottom:var(--space-sm)">Whitelisting an email approves their account instantly upon Google login.</p>
      <div style="display:flex; gap:var(--space-sm); align-items:center;">
        <input type="email" id="invite-email-input" class="form-input" placeholder="User Email" style="max-width: 300px" />
        <button class="btn-primary" id="send-invite-btn">Add User</button>
      </div>
    </div>
    ` : ''}

    <div id="admin-content" class="animate-enter" style="--delay:100ms">
      <div class="skeleton-card" style="height:200px"></div>
    </div>

    <div class="page-header animate-enter" style="--delay:200ms; margin-top:var(--space-2xl)">
      <div style="display:flex; justify-content:space-between; align-items:flex-end; flex-wrap:wrap; gap:var(--space-sm)">
        <div>
          <h2 class="text-subheading" style="margin:0">Bulk Inventory Import</h2>
          <p class="text-label">Upload .xlsx or .csv files to bulk register properties</p>
        </div>
        <button class="btn-secondary btn-sm" id="download-template-btn" style="width:auto; min-height:32px; padding:0 12px; font-size:12px">
          Download CSV Template
        </button>
      </div>
    </div>
    
    <div class="card animate-enter" style="--delay:300ms; padding:var(--space-md)">
      <div class="import-controls">
        <div class="file-input-wrapper">
          <input type="file" id="bulk-import-file" accept=".xlsx, .xls, .csv" class="hidden-file-input" />
          <label for="bulk-import-file" class="btn-secondary" id="file-label">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
            Choose File...
          </label>
        </div>
        <button class="btn-primary" id="start-bulk-import">Process & Register</button>
      </div>
      <div id="import-progress-container" style="display:none; margin-top:var(--space-md)">
        <div style="height:6px; width:100%; background:var(--surface-alt); border-radius:3px; overflow:hidden">
          <div id="import-progress-bar" style="height:100%; width:0%; background:var(--accent-green); transition:width 0.3s ease"></div>
        </div>
        <p id="import-status-text" class="text-caption" style="margin-top:var(--space-sm)">Processing...</p>
      </div>
    </div>

    <style>
      .import-controls {
        display: flex;
        gap: var(--space-md);
        align-items: center;
      }
      .file-input-wrapper {
        flex: 1;
        position: relative;
      }
      .hidden-file-input {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }
      .btn-sm { min-height: 36px; padding: 0 var(--space-md); }
      
      @media (max-width: 480px) {
        .import-controls {
          flex-direction: column;
          align-items: stretch;
        }
      }
    </style>
  `;

  const content = document.getElementById('admin-content');

  try {
    const users = await getAllUsers();

    if (users.length === 0) {
      content.innerHTML = `
        <div class="card">
          <p class="text-body">No users found.</p>
        </div>
      `;
      return;
    }

    const rowsHtml = users.map(user => `
      <tr class="admin-table-row">
        <td>
          <div class="text-body" style="font-weight:600">${user.displayName || 'Unnamed User'}</div>
          <div class="text-caption">${user.email}</div>
        </td>
        <td>
          <span class="badge badge-${user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : 'error'}">
            ${user.status}
          </span>
        </td>
        <td>
          <span class="badge ${user.role === 'superadmin' ? 'badge-info' : ''}">${user.role}</span>
        </td>
        <td style="text-align:right">
          <div style="display:flex; gap:8px; justify-content:flex-end">
            ${user.role !== 'superadmin' ? `
              <button class="btn-secondary btn-sm" data-action="toggle-status" data-uid="${user.id}" data-current="${user.status}">
                ${user.status === 'active' ? 'Suspend' : 'Approve'}
              </button>
              <button class="btn-secondary btn-sm" data-action="toggle-role" data-uid="${user.id}" data-current="${user.role}">
                ${user.role === 'admin' ? 'Demote' : 'Promote'}
              </button>
            ` : ''}
            
            ${isSuperadmin && user.role !== 'superadmin' ? `
              <button class="btn-secondary btn-sm btn-danger" data-action="delete-user" data-uid="${user.id}">
                Delete
              </button>
              <button class="btn-secondary btn-sm" data-action="make-superadmin" data-uid="${user.id}">
                Make Superadmin
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    content.innerHTML = `
      <div class="card" style="padding:0; overflow:hidden">
        <div style="overflow-x:auto">
          <table class="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Role</th>
                <th style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // ─── Post-Render Event Listeners ───
    content.querySelectorAll('[data-action="toggle-status"]').forEach(btn => {
      btn.onclick = async () => {
        const { uid, current } = btn.dataset;
        const newStatus = current === 'active' ? 'suspended' : 'active';
        try {
          btn.disabled = true;
          await updateUserStatus(uid, newStatus);
          showToast(`User ${newStatus === 'active' ? 'approved' : 'suspended'}`);
          renderAdminPage(container); // Re-render
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });

    content.querySelectorAll('[data-action="toggle-role"]').forEach(btn => {
      btn.onclick = async () => {
        const { uid, current } = btn.dataset;
        const newRole = current === 'admin' ? 'agent' : 'admin';
        try {
          btn.disabled = true;
          await updateUserRole(uid, newRole);
          showToast(`User ${newRole === 'admin' ? 'promoted to admin' : 'demoted to agent'}`);
          renderAdminPage(container); // Re-render
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });

    content.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Are you sure you want to permanently delete this user? They will lose all access.")) return;
        const { uid } = btn.dataset;
        try {
          btn.disabled = true;
          await removeUser(uid);
          showToast('User completely removed', 'success');
          renderAdminPage(container); // Re-render
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });

    content.querySelectorAll('[data-action="make-superadmin"]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("WARNING: Creating a new superadmin will DEMOTE YOU to a regular admin. There can only be one superadmin. Proceed?")) return;
        const { uid } = btn.dataset;
        try {
          btn.disabled = true;
          await transferSuperadmin(uid);
          // Update local profile directly instead of waiting for reload
          if (window.userProfile) window.userProfile.role = 'admin';
          showToast('Superadmin powers transferred successfully.', 'success');
          renderAdminPage(container); // Re-render
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      };
    });

    // ─── Superadmin Quick Add Logic ───
    const sendInviteBtn = container.querySelector('#send-invite-btn');
    if (sendInviteBtn) {
      sendInviteBtn.onclick = async () => {
        const emailInput = container.querySelector('#invite-email-input');
        const email = emailInput.value.trim();
        if (!email) {
          showToast("Please enter an email", "warning");
          return;
        }
        try {
          sendInviteBtn.disabled = true;
          await createInvite(email);
          showToast(`Invite saved. When ${email} signs in via Google, they will be instantly active.`, "success");
          emailInput.value = '';
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          sendInviteBtn.disabled = false;
        }
      };
    }

    // ─── Bulk Import Logic ───
    const importBtn = container.querySelector('#start-bulk-import');
    const fileInput = container.querySelector('#bulk-import-file');
    const progressContainer = container.querySelector('#import-progress-container');
    const progressBar = container.querySelector('#import-progress-bar');
    const statusText = container.querySelector('#import-status-text');
    const fileLabel = container.querySelector('#file-label');

    // ─── Template Download ───
    const downloadBtn = container.querySelector('#download-template-btn');
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const allFields = SECTIONS.flatMap(s => s.fields);
        const headers = allFields
          .filter(f => f.type !== 'file')
          .map(f => f.label || f.name);
        
        // Clean headers for labels found in the user's file
        const cleanedHeaders = headers.map(h => h.replace(/ \(.*\)/g, '').trim());
        const csvContent = "data:text/csv;charset=utf-8," + cleanedHeaders.join(",");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "footfall_inventory_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
    }

    // ─── File Label Update ───
    fileInput.onchange = () => {
      if (fileInput.files[0]) {
        fileLabel.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 13l4 4L19 7"></path></svg> ${fileInput.files[0].name}`;
      }
    };

    const FIELD_MAP = {
      // Direct label matches from the user's Excel file
      "property name": "name", 
      "property status": "propertyStatus",
      "completion time": "completionTime",
      "part oc": "partOC",
      "commplete oc": "completeOC",
      "building type": "buildingType",
      "size (sqft)": "size",
      "floor": "floor",
      "location link": "googleMapsLink",
      "exact address": "location",
      "trade area": "tradeArea",
      "suitable for": "suitableFor",
      "presentation": "presentationAvailable",
      "name of contact": "contactName",
      "designation": "contactDesignation",
      "phone / email": "contactInfo",
      "price per sqft": "price",
      "mergable": "mergable",
      "mezzanine": "mezzanine",
      "total clear height": "clearHeight",
      "clear height under mezzanine": "clearHeightUnderMezz",
      "cam per sqft": "cam",
      "connected load": "connectedLoad",
      "age of building": "buildingAge",
      "parking space": "parking",
      "outside visbility": "outsideSpace",
      "service entry": "serviceEntry",
      "lift access": "liftAccess",
      "boh space": "bohSpace",
      "fire exit": "fireExit",
      "oc file available": "ocFile",
      "note": "miscNotes",
      // Fuzzy/Legacy matches
      "name": "name",
      "vicinity": "vicinityBrands", "brands": "vicinityBrands",
      "area": "size", "size": "size",
      "maps": "googleMapsLink", "link": "googleMapsLink",
      "address": "location",
      "rent": "price",
      "phone": "contactInfo", "email": "contactInfo",
      "load": "connectedLoad", "age": "buildingAge"
    };

    importBtn.onclick = async () => {
      const file = fileInput.files[0];
      if (!file) {
        showToast('Please select a file first', 'warning');
        return;
      }

      try {
        importBtn.disabled = true;
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        statusText.textContent = 'Reading rows...';

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array', cellFormula: true, cellLinks: true });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        // Crucial: Use { range: 1 } to skip Row 0 based on user's file structure
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: 1 });

        if (jsonData.length === 0) {
          throw new Error('No data rows found below headers.');
        }

        // Resolve column letters for headers
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        const headerRowIdx = 1; // Row 1 is headers (0-indexed)
        const colMap = {}; // { normalizedHeader: colLetter }
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r: headerRowIdx, c: c });
          const cell = worksheet[addr];
          if (cell && cell.v) {
            colMap[String(cell.v).toLowerCase().trim()] = XLSX.utils.encode_col(c);
          }
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          const rowIdx = i + 2; // Data starts at Row 2 (0-indexed: 2)
          const mappedData = {
            status: 'active'
          };

          Object.entries(row).forEach(([key, value]) => {
            const normalizedKey = String(key).toLowerCase().trim();
            const targetField = FIELD_MAP[normalizedKey];

            if (targetField) {
              const colLetter = colMap[normalizedKey];
              const cellAddr = colLetter ? `${colLetter}${rowIdx + 1}` : null;
              const cell = cellAddr ? worksheet[cellAddr] : null;
              
              // 1. Prioritize hidden hyperlink Target (l.Target) for Location
              // 2. Fallback to literal cell value (v) if it starts with http
              let extractedLink = cell?.l?.Target;
              if (!extractedLink && typeof cell?.v === 'string' && cell.v.startsWith('http')) {
                extractedLink = cell.v;
              }

              let finalValue = value;
              const isLocationCol = targetField === 'googleMapsLink' || targetField === 'location';

              if (extractedLink && isLocationCol) {
                finalValue = extractedLink;
              }

              if (finalValue !== undefined && finalValue !== null && finalValue !== 'NA' && finalValue !== 'N/A') {
                if (['parking', 'mezzanine', 'mergable', 'clearHeight', 'connectedLoad', 'buildingAge'].includes(targetField)) {
                  const numeric = Number(String(finalValue).replace(/[^0-9.]/g, ''));
                  const isNumber = !isNaN(numeric) && String(finalValue).replace(/[^0-9.]/g, '') !== '';
                  
                  if (targetField === 'parking') {
                    mappedData.parking = isNumber ? true : (String(finalValue).toLowerCase().startsWith('y'));
                    if (isNumber) mappedData.parkingCount = numeric;
                  } else if (targetField === 'mezzanine' || targetField === 'mergable') {
                    mappedData[targetField] = isNumber ? true : (String(finalValue).toLowerCase().startsWith('y'));
                    if (targetField === 'mezzanine' && isNumber) mappedData.mezzanineSize = numeric;
                  } else {
                    if (isNumber) mappedData[targetField] = numeric;
                  }
                } else {
                  if (['size', 'price', 'cam', 'clearHeightUnderMezz', 'completionTime'].includes(targetField)) {
                    const num = Number(String(finalValue).replace(/[^0-9.]/g, ''));
                    if (!isNaN(num)) mappedData[targetField] = num;
                  } else {
                    mappedData[targetField] = String(finalValue).trim();
                  }
                }
              }
            }
          });

          if (!mappedData.name || mappedData.name.toLowerCase() === 'property name') continue;

          try {
            statusText.textContent = `Importing ${i + 1} of ${jsonData.length}...`;
            await createInventoryItem(mappedData);
            successCount++;
          } catch (e) {
            console.error(`Row ${i} failed:`, e);
            failCount++;
          }
          progressBar.style.width = `${((i + 1) / jsonData.length) * 100}%`;
        }

        showToast(`Import complete: ${successCount} saved`, successCount > 0 ? 'success' : 'error');
        statusText.textContent = `Completed: ${successCount} properties imported successfully.`;
        if (typeof window.__invalidateHomeCache === 'function') window.__invalidateHomeCache();

      } catch (err) {
        console.error('Import failed:', err);
        showToast(err.message, 'error');
        statusText.textContent = 'Error: ' + err.message;
      } finally {
        importBtn.disabled = false;
        fileLabel.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Choose File...`;
        fileInput.value = '';
      }
    };

  } catch (err) {
    console.error('Admin fetch error:', err);
    content.innerHTML = `
      <div class="card card-error">
        <p class="text-body">Failed to load users. Are you sure you are an admin?</p>
      </div>
    `;
  }
};
