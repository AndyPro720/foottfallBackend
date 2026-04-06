import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebaseConfig.js";
import { heicTo } from "heic-to";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB


/**
 * Uploads a file (image, document) to Firebase Storage and returns the public download URL.
 * 
 * @param {File|Blob} file The file to upload.
 * @param {string} path The destination path in the storage bucket (e.g., 'properties/{propertyId}/facades/img1.jpg').
 * @param {Function} [onProgress] Optional callback for tracking upload progress (0-100).
 * @returns {Promise<string>} The public download URL.
 */
export async function uploadFile(file, path, onProgress = null) {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File ${file.name} exceeds the 200MB size limit.`);
  }

  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    // Begin the upload task
    const uploadTask = uploadBytesResumable(storageRef, file);


    uploadTask.on(
      "state_changed",
      (snapshot) => {
        // Track progress if a callback was provided
        if (onProgress) {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(progress);
        }
      },
      (error) => {
        console.error("Storage Error during upload:", error);
        reject(error);
      },
      async () => {
        // Upload completed successfully, get the readable URL
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadURL);
        } catch (urlError) {
          reject(urlError);
        }
      }
    );
  });
}

/**
 * Deletes a file from Firebase Storage.
 * @param {string} path The logical path or URL in the storage bucket.
 * @returns {Promise<void>}
 */
export async function deleteFile(path) {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.error("Storage Error during deletion:", error);
    throw error;
  }
}

/**
 * Uploads multiple files to Firebase Storage in a batch.
 * 
 * @param {File[]|FileList} files The array of files to upload.
 * @param {string} basePath The common base path (e.g., 'properties/prop_id/facade').
 * @param {Function} [onProgress] Optional callback for tracking aggregate progress (0-100).
 * @returns {Promise<string[]>} Array of public download URLs for the successfully uploaded files.
 */
export async function uploadMultipleFiles(files, basePath, onProgress = null) {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) return [];

  let totalUploaded = 0;
  const totalFiles = fileArray.length;
  const urls = [];

  const uploadPromises = fileArray.map(async (file, index) => {
    // ─── Phase 9: HEIC Conversion ───
    const fileType = String(file.type || '').toLowerCase();
    const isHeic = /\.hei(c|f)$/i.test(file.name || '') || fileType === 'image/heic' || fileType === 'image/heif';
    if (isHeic) {
      try {
        const converted = await heicTo({ blob: file, type: "image/jpeg", quality: 0.8 });
        const jpegBlob = converted instanceof Blob ? converted : new Blob([converted], { type: "image/jpeg" });
        const outputName = (file.name || `upload_${Date.now()}`).replace(/\.hei(c|f)$/i, '.jpg');
        file = new File([jpegBlob], outputName, { type: "image/jpeg" });
      } catch (err) {
        console.error("HEIC conversion failed, attempting raw upload:", err);
      }
    }

    const filePath = `${basePath}/${Date.now()}_${index}_${file.name}`;
    return uploadFile(file, filePath, (p) => {

      // Aggregate progress calculation: 
      // (sum of individual file progress / total files)
      // This is a simplified approximation as files may have different sizes.
      if (onProgress) {
        // Since we don't have individual file weights, we'll just track completion
      }
    }).then(url => {
        totalUploaded++;
        if (onProgress) onProgress((totalUploaded / totalFiles) * 100);
        return url;
    });
  });

  const results = await Promise.allSettled(uploadPromises);
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      urls.push(result.value);
    } else {
      console.warn('Batch upload partial failure:', result.reason);
    }
  });

  return urls;
}

/**
 * Note on Integration with Firestore Schema (SCHEMA.md):
 * 
 * When taking photos via the PWA (e.g. Building Facade, Internal Images):
 * 1. The PWA selects/captures images.
 * 2. It calls `uploadFile(file, 'inventory_images/inv_xyz123/interior/photo1.jpg')`.
 * 3. `uploadFile` returns the `downloadURL`.
 * 4. The PWA accumulates these URLs in an array.
 * 5. This array of URLs is finally attached to the `images.interior` map array
 *    as defined in SCHEMA.md, and saved via `createInventoryItem()`.
 */
