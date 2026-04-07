import { getAllUsers, updateUserStatus, updateUserRole } from '../backend/userRoleService.js';
import { createInventoryItem } from '../backend/inventoryService.js';
import { showToast } from '../utils/ui.js';
import * as XLSX from 'xlsx';

export const renderAdminPage = async (container) => {
  container.innerHTML = `
    <div class="page-header animate-enter">
      <h1 class="text-display">Admin Control</h1>
      <p class="text-label">Manage users and approval status</p>
    </div>
    <div id="admin-content" class="animate-enter" style="--delay:100ms">
      <div class="skeleton-card" style="height:200px"></div>
    </div>

    <div class="page-header animate-enter" style="--delay:200ms; margin-top:var(--space-xl)">
      <h2 class="text-subheading">Bulk Inventory Import</h2>
      <p class="text-label">Upload .xlsx or .csv files to bulk register properties</p>
    </div>
    
    <div class="card animate-enter" style="--delay:300ms">
      <div class="form-group">
        <label class="form-label">Select Excel File</label>
        <div style="display:flex; gap:12px; align-items:center">
          <input type="file" id="bulk-import-file" accept=".xlsx, .xls, .csv" style="flex:1" />
          <button class="btn-primary" id="start-bulk-import">Process File</button>
        </div>
        <p class="text-caption" style="margin-top:8px">First row must contain headers. Supported: Property Name, Price, Area, Status, etc.</p>
      </div>
      <div id="import-progress-container" style="display:none; margin-top:var(--space-md)">
        <div style="height:4px; width:100%; background:var(--surface-alt); border-radius:2px; overflow:hidden">
          <div id="import-progress-bar" style="height:100%; width:0%; background:var(--primary); transition:width 0.3s ease"></div>
        </div>
        <p id="import-status-text" class="text-caption" style="margin-top:8px">Processing...</p>
      </div>
    </div>
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
          <span class="badge">${user.role}</span>
        </td>
        <td style="text-align:right">
          <div style="display:flex; gap:8px; justify-content:flex-end">
            <button class="btn-secondary btn-sm" data-action="toggle-status" data-uid="${user.id}" data-current="${user.status}">
              ${user.status === 'active' ? 'Suspend' : 'Approve'}
            </button>
            <button class="btn-secondary btn-sm" data-action="toggle-role" data-uid="${user.id}" data-current="${user.role}">
              ${user.role === 'admin' ? 'Demote' : 'Promote'}
            </button>
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

    // ─── Bulk Import Logic ───
    const importBtn = container.querySelector('#start-bulk-import');
    const fileInput = container.querySelector('#bulk-import-file');
    const progressContainer = container.querySelector('#import-progress-container');
    const progressBar = container.querySelector('#import-progress-bar');
    const statusText = container.querySelector('#import-status-text');

    const FIELD_MAP = {
      "property name": "name", "name": "name",
      "frontage": "frontage",
      "vicinity": "vicinityBrands", "brands": "vicinityBrands",
      "notes": "miscNotes",
      "status": "propertyStatus",
      "carpet area": "size", "area": "size", "size": "size",
      "floor": "floor",
      "google maps": "googleMapsLink", "maps": "googleMapsLink", "link": "googleMapsLink",
      "location": "location", "address": "location",
      "trade area": "tradeArea",
      "suitable": "suitableFor",
      "price": "price", "rent": "price",
      "contact": "contactName",
      "phone": "contactInfo", "email": "contactInfo",
      "mezzanine": "mezzanine",
      "clear height": "clearHeight",
      "cam": "cam",
      "load": "connectedLoad",
      "age": "buildingAge"
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
        statusText.textContent = 'Reading file...';

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          throw new Error('No data found in the selected sheet.');
        }

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          const mappedData = {
            status: 'active',
            images: {},
            mediaUploadPending: false
          };

          // Map headers to fields
          Object.entries(row).forEach(([key, value]) => {
            const normalizedKey = key.toLowerCase().trim();
            const targetField = FIELD_MAP[normalizedKey];
            if (targetField) {
              // Basic type casting
              if (['size', 'price', 'cam', 'connectedLoad', 'buildingAge', 'clearHeight'].includes(targetField)) {
                mappedData[targetField] = Number(String(value).replace(/[^0-9.]/g, ''));
              } else if (targetField === 'mezzanine') {
                mappedData[targetField] = String(value).toLowerCase().startsWith('y');
              } else {
                mappedData[targetField] = value;
              }
            }
          });

          // Validation check
          if (!mappedData.name) {
             failCount++;
             continue;
          }

          try {
            statusText.textContent = `Importing ${i + 1} of ${jsonData.length}...`;
            await createInventoryItem(mappedData);
            successCount++;
          } catch (e) {
            console.error(`Row ${i} failed:`, e);
            failCount++;
          }

          const progress = ((i + 1) / jsonData.length) * 100;
          progressBar.style.width = `${progress}%`;
        }

        showToast(`Import complete: ${successCount} success, ${failCount} failed.`, successCount > 0 ? 'success' : 'error');
        statusText.textContent = `Completed: ${successCount} successful, ${failCount} failed.`;
        
        if (typeof window.__invalidateHomeCache === 'function') {
          window.__invalidateHomeCache();
        }

      } catch (err) {
        console.error('Import failed:', err);
        showToast(err.message, 'error');
        statusText.textContent = 'Error: ' + err.message;
      } finally {
        importBtn.disabled = false;
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
