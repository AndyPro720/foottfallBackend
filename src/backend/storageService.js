import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "./firebaseConfig.js";
import { heicTo } from "heic-to";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const IMAGE_COMPRESSION_MIN_SIZE = 1.5 * 1024 * 1024; // 1.5MB
const IMAGE_MAX_EDGE = 2200;
const IMAGE_COMPRESSION_QUALITY = 0.78;

function isCompressibleImageFile(file) {
  const fileType = String(file?.type || '').toLowerCase();
  return (
    fileType === 'image/jpeg' ||
    fileType === 'image/jpg' ||
    fileType === 'image/webp'
  );
}

function getResizedDimensions(width, height, maxEdge) {
  if (!width || !height) return { width, height };
  const largestEdge = Math.max(width, height);
  if (largestEdge <= maxEdge) return { width, height };
  const scale = maxEdge / largestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image decode failed'));
    };
    image.src = objectUrl;
  });
}

async function compressImageFile(file) {
  if (
    typeof document === 'undefined' ||
    file.size < IMAGE_COMPRESSION_MIN_SIZE ||
    !isCompressibleImageFile(file)
  ) {
    return file;
  }

  const source = await loadImageSource(file);
  const width = source.width || source.naturalWidth || 0;
  const height = source.height || source.naturalHeight || 0;
  const resized = getResizedDimensions(width, height, IMAGE_MAX_EDGE);

  const canvas = document.createElement('canvas');
  canvas.width = resized.width;
  canvas.height = resized.height;

  const context = canvas.getContext('2d');
  if (!context) {
    if (typeof source.close === 'function') source.close();
    return file;
  }

  context.drawImage(source, 0, 0, resized.width, resized.height);
  if (typeof source.close === 'function') source.close();

  const compressedBlob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', IMAGE_COMPRESSION_QUALITY);
  });

  if (!compressedBlob) return file;
  if (compressedBlob.size >= file.size * 0.95) return file;

  const outputName = (file.name || `upload_${Date.now()}`).replace(/\.(jpe?g|webp)$/i, '.jpg');
  return new File([compressedBlob], outputName, {
    type: 'image/jpeg',
    lastModified: file.lastModified || Date.now(),
  });
}


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
export async function uploadMultipleFiles(files, basePath, onProgress = null, onFileProgress = null) {
  const fileArray = Array.from(files);
  if (fileArray.length === 0) return [];

  let totalUploaded = 0;
  const totalFiles = fileArray.length;
  const urls = [];

  const uploadPromises = fileArray.map(async (file, index) => {
    // ─── HEIC Conversion ───
    const fileType = String(file.type || '').toLowerCase();
    const isHeic = /\.hei(c|f)$/i.test(file.name || '') || fileType === 'image/heic' || fileType === 'image/heif';
    const isVideo = fileType.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i.test(file.name || '');

    if (isHeic && !isVideo) {
      if (onFileProgress) onFileProgress(index, 5, 'converting');
      try {
        const converted = await heicTo({ blob: file, type: "image/jpeg", quality: 0.8 });
        const jpegBlob = Array.isArray(converted)
          ? (converted[0] instanceof Blob
              ? converted[0]
              : new Blob([converted[0]], { type: "image/jpeg" }))
          : (converted instanceof Blob
              ? converted
              : new Blob([converted], { type: "image/jpeg" }));
        const outputName = (file.name || `upload_${Date.now()}`).replace(/\.hei(c|f)$/i, '.jpg');
        file = new File([jpegBlob], outputName, { type: "image/jpeg" });
        if (onFileProgress) onFileProgress(index, 15, 'uploading');
      } catch (err) {
        console.error("HEIC conversion failed, attempting raw upload:", err);
      }
    }

    if (isCompressibleImageFile(file) && file.size >= IMAGE_COMPRESSION_MIN_SIZE) {
      if (onFileProgress) onFileProgress(index, 10, 'converting');
      try {
        file = await compressImageFile(file);
      } catch (err) {
        console.warn('Image compression skipped:', err);
      }
    }

    const filePath = `${basePath}/${Date.now()}_${index}_${file.name}`;
    return uploadFile(file, filePath, (p) => {
      if (onFileProgress) onFileProgress(index, Math.round(p), 'uploading');
    }).then(url => {
        totalUploaded++;
        if (onFileProgress) onFileProgress(index, 100, 'done');
        if (onProgress) onProgress((totalUploaded / totalFiles) * 100);
        return url;
    });
  });

  const results = await Promise.allSettled(uploadPromises);
  
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      urls.push(result.value);
    } else {
      console.warn('Batch upload partial failure:', result.reason);
      if (onFileProgress) onFileProgress(i, 0, 'error', String(result.reason?.message || result.reason));
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
