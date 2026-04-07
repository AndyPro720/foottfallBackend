import { uploadFile } from '../backend/storageService.js';
import { updateInventoryItem } from '../backend/inventoryService.js';

/**
 * Transforms a Google Drive share/view URL into a direct download URL.
 * Works for images and publicly accessible docs.
 * 
 * @param {string} url The original Drive URL.
 * @returns {string|null} The direct download URL or null if not a Drive link.
 */
export function getDirectDriveUrl(url) {
  if (!url || typeof url !== 'string') return null;
  
  // Cleanup common typos like trailing 'ng' from 'sharing'
  let cleanUrl = url.trim().replace(/sharingng$/, 'sharing');
  
  // Detect if it's a folder link
  if (cleanUrl.includes('/drive/folders/') || cleanUrl.includes('drive.google.com/drive/u/')) {
     console.warn("Media sync doesn't support Google Drive folders. Please use a direct file link.");
     return null;
  }

  const fileIdMatch = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || cleanUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }
  return cleanUrl;
}

/**
 * Downloads a file from a URL and uploads it to Firebase Storage.
 * Then updates the Firestore document with the new URL.
 * 
 * @param {string} docId The Firestore document ID.
 * @param {string} fieldPath The field path in Firestore (e.g. "images.buildingFacade").
 * @param {string} sourceUrl The source URL (e.g., Google Drive link).
 * @param {Object} session The UploadTracker session object.
 * @param {number} fileIndex The index of the file in the tracker session.
 */
export async function syncMediaFromUrl(docId, fieldPath, sourceUrl, session, fileIndex) {
  const directUrl = getDirectDriveUrl(sourceUrl);
  // Using corsproxy.io as it's more reliable for Drive links than allorigins
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(directUrl)}`;
  
  try {
    session.updateProgress(fileIndex, 10); // Start
    
    // 1. Fetch the data as a blob (via proxy)
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch media from source.`);
    
    const blob = await response.blob();
    session.updateProgress(fileIndex, 40); // Downloaded

    // 2. Guess extension/name
    const mimeMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf'
    };
    const ext = mimeMap[blob.type] || '.bin';
    const fileName = `${fieldPath.replace(/\./g, '_')}_${Date.now()}${ext}`;

    // 3. Upload to Firebase Storage
    const storagePath = `inventory/${docId}/${fileName}`;
    const downloadUrl = await uploadFile(blob, storagePath, (p) => {
        // Map 40-95% to upload progress
        const mappedProgress = 40 + (p * 0.55);
        session.updateProgress(fileIndex, Math.round(mappedProgress));
    });

    // 4. Update Firestore
    // Using dot notation for nested fields (e.g. images.buildingFacade)
    await updateInventoryItem(docId, { [fieldPath]: downloadUrl });
    
    session.markDone(fileIndex);
    return downloadUrl;
  } catch (err) {
    console.error(`Media sync failed for ${fieldPath}:`, err);
    session.markError(fileIndex, err.message || 'Sync failed');
    throw err;
  }
}
