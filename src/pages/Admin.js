import { getAllUsers, updateUserStatus, updateUserRole } from '../backend/userRoleService.js';
import { showToast } from '../utils/ui.js';

export const renderAdminPage = async (container) => {
  container.innerHTML = `
    <div class="page-header animate-enter">
      <h1 class="text-display">Admin Control</h1>
      <p class="text-label">Manage users and approval status</p>
    </div>
    <div id="admin-content" class="animate-enter" style="--delay:100ms">
      <div class="skeleton-card" style="height:200px"></div>
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

  } catch (err) {
    console.error('Admin fetch error:', err);
    content.innerHTML = `
      <div class="card card-error">
        <p class="text-body">Failed to load users. Are you sure you are an admin?</p>
      </div>
    `;
  }
};
