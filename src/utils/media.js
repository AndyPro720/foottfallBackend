const VIDEO_FILE_RE = /\.(mp4|webm|mov|avi|mkv|m4v|3gp)(\?|$)/i;
const PDF_FILE_RE = /\.pdf(\?|$)/i;
const DOC_FILE_RE = /\.(ppt|pptx|doc|docx|xls|xlsx)(\?|$)/i;
const CAD_FILE_RE = /\.(dwg|dxf)(\?|$)/i;

export function isVideoUrl(source) {
  return VIDEO_FILE_RE.test(String(source || ''));
}

export function isPdfUrl(source) {
  return PDF_FILE_RE.test(String(source || ''));
}

export function isDocUrl(source) {
  return DOC_FILE_RE.test(String(source || ''));
}

export function isCadUrl(source) {
  return CAD_FILE_RE.test(String(source || ''));
}

export function isVisualMediaUrl(source) {
  return Boolean(source) && !isPdfUrl(source) && !isDocUrl(source) && !isCadUrl(source);
}

export function getFileKindLabel(source) {
  if (isCadUrl(source)) return 'CAD';
  if (isPdfUrl(source)) return 'PDF';
  if (isDocUrl(source)) return 'DOC';
  if (isVideoUrl(source)) return 'VIDEO';
  return 'FILE';
}

export function getFileExtensionLabel(source) {
  const cleaned = String(source || '').split('?')[0];
  const ext = cleaned.includes('.') ? cleaned.split('.').pop() : '';
  const normalized = String(ext || '').trim().toUpperCase();
  if (!normalized) return 'FILE';
  return normalized.length <= 6 ? normalized : 'FILE';
}

export function acceptsVideo(accept) {
  return String(accept || '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .includes('video/*');
}
