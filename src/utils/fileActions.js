import { showToast } from './ui.js';

function isAppleTouchDevice() {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(userAgent) || (
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  );
}

export function deriveDownloadFilename(url, fallbackBase = 'file') {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/o\/(.+)$/);
    if (pathMatch?.[1]) {
      const decoded = decodeURIComponent(pathMatch[1]);
      const parts = decoded.split('/');
      const last = parts[parts.length - 1];
      if (last) return last;
    }

    const pathnameParts = parsed.pathname.split('/');
    const lastPathPart = pathnameParts[pathnameParts.length - 1];
    if (lastPathPart) return decodeURIComponent(lastPathPart);
  } catch (_) {
    // Ignore parse issues and use the fallback below.
  }

  const extension = String(url || '').split('?')[0].split('.').pop() || 'file';
  return `${fallbackBase}.${String(extension).toLowerCase()}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }
}

function openInSameWindow(url) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_self';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function downloadObjectUrl(objectUrl, filename) {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function openCadFile(url) {
  const filename = deriveDownloadFilename(url, 'cad-file');
  const prefersDirectOpen = isAppleTouchDevice();
  let file = null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }

    const blob = await response.blob();
    file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  } catch (_) {
    file = null;
  }

  if (file && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        files: [file],
        title: filename,
        text: 'Save or open the CAD file on your device.',
      });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  if (file && !prefersDirectOpen) {
    const objectUrl = URL.createObjectURL(file);
    downloadObjectUrl(objectUrl, filename);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return;
  }

  const copiedLink = await copyText(url);

  if (prefersDirectOpen) {
    showToast(
      copiedLink
        ? 'Opening CAD in this window. If needed, the file link is copied for Safari or Files.'
        : 'Opening CAD in this window. If it does not save automatically, use Share > Save to Files.',
      'info'
    );
    openInSameWindow(url);
    return;
  }

  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    openInSameWindow(url);
    return;
  }

  if (copiedLink) {
    showToast('Direct CAD link copied in case the browser blocks the download tab.', 'info');
  }
}
