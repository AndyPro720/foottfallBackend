/**
 * UploadTracker — Persistent upload progress panel.
 * Renders as a fixed bottom-right panel that survives navigation.
 * Shows per-file progress, errors, and overall status.
 */

let panelEl = null;
let uploads = []; // { id, label, fileName, progress, status, error, size }
let collapsed = false;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ensurePanel() {
  if (panelEl && document.body.contains(panelEl)) return;
  panelEl = document.createElement('div');
  panelEl.id = 'upload-tracker';
  panelEl.className = 'upload-tracker';
  document.body.appendChild(panelEl);
}

function render() {
  if (!panelEl) return;
  if (uploads.length === 0) {
    panelEl.style.display = 'none';
    return;
  }

  panelEl.style.display = 'flex';

  const active = uploads.filter(u => u.status === 'uploading' || u.status === 'pending');
  const failed = uploads.filter(u => u.status === 'error');
  const done = uploads.filter(u => u.status === 'done');
  const total = uploads.length;

  const overallPct = total > 0
    ? Math.round(uploads.reduce((s, u) => s + (u.progress || 0), 0) / total)
    : 0;

  const headerTitle = active.length > 0
    ? `Uploading ${active.length} file${active.length > 1 ? 's' : ''} (${overallPct}%)`
    : failed.length > 0
      ? `${failed.length} failed, ${done.length} done`
      : `${done.length} file${done.length > 1 ? 's' : ''} uploaded`;

  const headerClass = failed.length > 0 && active.length === 0
    ? 'upload-tracker-header error'
    : active.length === 0
      ? 'upload-tracker-header done'
      : 'upload-tracker-header';

  const itemsHtml = collapsed ? '' : uploads.map(u => {
    const statusIcon = u.status === 'done' ? '✓'
      : u.status === 'error' ? '✗'
      : u.status === 'converting' ? '⟳'
      : u.status === 'uploading' ? '↑'
      : '⏳';

    const statusClass = u.status === 'done' ? 'item-done'
      : u.status === 'error' ? 'item-error'
      : 'item-active';

    const sizeLabel = u.size ? ` (${formatBytes(u.size)})` : '';

    return `
      <div class="upload-tracker-item ${statusClass}">
        <div class="upload-tracker-item-header">
          <span class="upload-tracker-icon">${statusIcon}</span>
          <span class="upload-tracker-name" title="${u.fileName}">${u.fileName}${sizeLabel}</span>
          <span class="upload-tracker-pct">${u.status === 'error' ? 'Failed' : u.status === 'done' ? 'Done' : u.status === 'converting' ? 'Processing' : `${Math.round(u.progress)}%`}</span>
        </div>
        ${u.status === 'uploading' || u.status === 'converting' ? `
          <div class="upload-tracker-bar-bg">
            <div class="upload-tracker-bar" style="width:${u.progress}%"></div>
          </div>
        ` : ''}
        ${u.error ? `<div class="upload-tracker-error">${u.error}</div>` : ''}
      </div>
    `;
  }).join('');

  panelEl.innerHTML = `
    <div class="${headerClass}" id="upload-tracker-header">
      <div class="upload-tracker-bar-bg" style="position:absolute;bottom:0;left:0;right:0;height:2px">
        <div class="upload-tracker-bar" style="width:${overallPct}%;transition:width 0.3s ease"></div>
      </div>
      <span>${headerTitle}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="upload-tracker-toggle" id="upload-tracker-toggle">${collapsed ? '▲' : '▼'}</button>
        ${active.length === 0 ? '<button class="upload-tracker-close" id="upload-tracker-close">✕</button>' : ''}
      </div>
    </div>
    ${!collapsed ? `<div class="upload-tracker-body">${itemsHtml}</div>` : ''}
  `;

  // Attach interactions
  document.getElementById('upload-tracker-toggle')?.addEventListener('click', (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    render();
  });
  document.getElementById('upload-tracker-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    uploads = [];
    render();
  });
  document.getElementById('upload-tracker-header')?.addEventListener('click', () => {
    collapsed = !collapsed;
    render();
  });
}

/**
 * Start tracking a batch of uploads.
 * Returns an object with methods to update progress per-file.
 */
export function createUploadSession(label, files) {
  ensurePanel();
  collapsed = false;

  const sessionFiles = Array.from(files).map((file, i) => {
    const entry = {
      id: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      fileName: file.name || `File ${i + 1}`,
      size: file.size || 0,
      progress: 0,
      status: 'pending', // pending → converting → uploading → done | error
      error: null,
    };
    uploads.push(entry);
    return entry;
  });

  render();

  return {
    /** Mark a file as converting (HEIC → JPEG) */
    markConverting(index) {
      if (sessionFiles[index]) {
        sessionFiles[index].status = 'converting';
        sessionFiles[index].progress = 10;
        render();
      }
    },
    /** Update upload progress for a specific file (0-100) */
    updateProgress(index, pct) {
      if (sessionFiles[index]) {
        sessionFiles[index].status = 'uploading';
        sessionFiles[index].progress = Math.min(pct, 100);
        render();
      }
    },
    /** Mark file as done */
    markDone(index) {
      if (sessionFiles[index]) {
        sessionFiles[index].status = 'done';
        sessionFiles[index].progress = 100;
        render();
      }
    },
    /** Mark file as failed */
    markError(index, errorMsg) {
      if (sessionFiles[index]) {
        sessionFiles[index].status = 'error';
        sessionFiles[index].error = String(errorMsg).slice(0, 200);
        render();
      }
    },
    /** Mark all remaining pending as done (batch complete) */
    finalize() {
      sessionFiles.forEach(f => {
        if (f.status === 'pending') f.status = 'done';
      });
      render();
    },
    /** Get session file count info */
    get summary() {
      const d = sessionFiles.filter(f => f.status === 'done').length;
      const e = sessionFiles.filter(f => f.status === 'error').length;
      return { total: sessionFiles.length, done: d, errors: e };
    }
  };
}

/** Quick log entry (non-file, e.g. "Saving to Firestore...") */
export function addUploadLog(message, status = 'done') {
  ensurePanel();
  uploads.push({
    id: `log_${Date.now()}`,
    label: '',
    fileName: message,
    size: 0,
    progress: status === 'done' ? 100 : 0,
    status,
    error: null,
  });
  render();
}
