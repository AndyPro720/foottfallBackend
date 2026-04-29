const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("node:crypto");

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();
const FieldValue = admin.firestore.FieldValue;

const VIDEO_FILE_RE = /\.(mp4|mov|webm|avi|mkv|m4v|3gp)$/i;
const VIDEO_JOB_COLLECTION = "_videoCompressionJobs";
const COMPRESSED_FILE_NAME = "compressed.mp4";
const CLOUD_RUN_VIDEO_JOB_NAME = process.env.CLOUD_RUN_VIDEO_JOB_NAME || "video-compression-job";
const CLOUD_RUN_VIDEO_JOB_REGION = process.env.CLOUD_RUN_VIDEO_JOB_REGION || "asia-south1";
const CLOUD_RUN_VIDEO_JOB_CONTAINER = process.env.CLOUD_RUN_VIDEO_JOB_CONTAINER || "video-compressor";

function isVideoObject(object) {
  const contentType = String(object.contentType || "").toLowerCase();
  return contentType.startsWith("video/") || VIDEO_FILE_RE.test(String(object.name || ""));
}

function isCompressedVideoObject(objectName) {
  return String(objectName || "").includes("/compressed/");
}

function isPropertyMediaObject(objectName) {
  return String(objectName || "").startsWith("properties/");
}

function parsePropertyMediaPath(objectName) {
  const parts = String(objectName || "").split("/");
  if (parts.length < 4 || parts[0] !== "properties") return null;
  return {
    propertyId: parts[1],
    fieldKey: parts[2],
    fileName: parts[parts.length - 1],
  };
}

function buildCompressionOutputPrefix(objectName) {
  const parsed = parsePropertyMediaPath(objectName);
  if (!parsed) return "";
  const objectHash = crypto.createHash("sha1").update(objectName).digest("hex").slice(0, 16);
  return `properties/${parsed.propertyId}/${parsed.fieldKey}/compressed/${objectHash}`;
}

function buildCompressedObjectPath(objectName) {
  return `${buildCompressionOutputPrefix(objectName)}/${COMPRESSED_FILE_NAME}`;
}

function buildTrackingDocId(objectPath) {
  return Buffer.from(String(objectPath || ""), "utf8").toString("base64url");
}

function buildDownloadUrl(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

function extractStorageObjectPath(url) {
  try {
    const parsed = new URL(String(url || ""));
    const match = parsed.pathname.match(/\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

async function ensureDownloadUrl(bucket, objectPath) {
  const file = bucket.file(objectPath);
  const [metadata] = await file.getMetadata();
  let token = metadata?.metadata?.firebaseStorageDownloadTokens || "";

  if (token.includes(",")) {
    token = token.split(",")[0];
  }

  if (!token) {
    token = crypto.randomUUID();
    await file.setMetadata({
      metadata: {
        ...(metadata.metadata || {}),
        firebaseStorageDownloadTokens: token,
      },
    });
  }

  return buildDownloadUrl(bucket.name, objectPath, token);
}

async function getAccessToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: {
      "Metadata-Flavor": "Google",
    },
  });

  if (!response.ok) {
    throw new Error(`Metadata token request failed with ${response.status}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("Metadata server did not return an access token");
  }

  return data.access_token;
}

async function runVideoCompressionJob({ projectId, bucketName, inputObjectPath, compressedObjectPath }) {
  const accessToken = await getAccessToken();
  const jobName = `projects/${projectId}/locations/${CLOUD_RUN_VIDEO_JOB_REGION}/jobs/${CLOUD_RUN_VIDEO_JOB_NAME}`;

  const response = await fetch(`https://run.googleapis.com/v2/${jobName}:run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [
          {
            name: CLOUD_RUN_VIDEO_JOB_CONTAINER,
            clearArgs: true,
            args: [bucketName, inputObjectPath, compressedObjectPath],
          }
        ],
        taskCount: 1,
        timeout: "3600s",
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Cloud Run job execution failed with ${response.status}: ${errorBody}`);
  }

  return response.json();
}

function replaceMatchingUrl(urls, originalObjectPath, replacementUrl) {
  let replaced = false;
  const nextUrls = (urls || []).map((url) => {
    if (extractStorageObjectPath(url) === originalObjectPath) {
      replaced = true;
      return replacementUrl;
    }
    return url;
  });

  return { replaced, nextUrls };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyCompressedVideoToInventory({ propertyId, fieldKey, originalObjectPath, compressedUrl }) {
  const docRef = db.collection("inventory").doc(propertyId);
  const facilityPhotoField = `${fieldKey}Photo`;

  for (let attempt = 1; attempt <= 6; attempt++) {
    const snapshot = await docRef.get();
    if (!snapshot.exists) {
      throw new Error(`Inventory document ${propertyId} no longer exists`);
    }

    const data = snapshot.data() || {};
    const updatePayload = {};
    let didReplace = false;

    const existingImageUrls = Array.isArray(data.images?.[fieldKey]) ? data.images[fieldKey] : null;
    if (existingImageUrls) {
      const { replaced, nextUrls } = replaceMatchingUrl(existingImageUrls, originalObjectPath, compressedUrl);
      if (replaced) {
        updatePayload[`images.${fieldKey}`] = nextUrls;
        didReplace = true;
      }
    }

    if (!didReplace && typeof data[facilityPhotoField] === "string") {
      if (extractStorageObjectPath(data[facilityPhotoField]) === originalObjectPath) {
        updatePayload[facilityPhotoField] = compressedUrl;
        didReplace = true;
      }
    }

    if (didReplace) {
      updatePayload.updated_at = FieldValue.serverTimestamp();
      await docRef.set(updatePayload, { merge: true });
      return true;
    }

    if (attempt < 6) {
      await wait(3000);
    }
  }

  return false;
}

/**
 * Main export logic: fetches all inventory and saves as JSON to Storage.
 */
async function runExport() {
  logger.info("Starting inventory export...");
  
  try {
    const snapshot = await db.collection("inventory").get();
    const properties = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      
      // Clean data for public consumption
      const cleaned = {
        id: doc.id,
        ...data
      };

      // Convert timestamps to ISO strings
      if (cleaned.created_at && cleaned.created_at.toDate) {
        cleaned.created_at = cleaned.created_at.toDate().toISOString();
      }
      if (cleaned.updated_at && cleaned.updated_at.toDate) {
        cleaned.updated_at = cleaned.updated_at.toDate().toISOString();
      }

      properties.push(cleaned);
    });

    const exportData = {
      lastUpdated: new Date().toISOString(),
      count: properties.length,
      properties: properties
    };

    const bucket = storage.bucket();
    const file = bucket.file("exports/inventory.json");

    await file.save(JSON.stringify(exportData, null, 2), {
      metadata: {
        contentType: "application/json",
        cacheControl: "public, max-age=3600"
      }
    });

    // Make file public (optional, depending on bucket policy)
    try {
      await file.makePublic();
    } catch (e) {
      logger.warn("Could not make file public; bucket may already be public or needs different permissions.", e);
    }

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '03-09-2491' // Far future
    });

    logger.info(`Export completed. ${properties.length} properties saved.`);
    return { success: true, count: properties.length, url };
  } catch (error) {
    logger.error("Export failed", error);
    throw error;
  }
}

/**
 * HTTP Triggered Export (Manual)
 */
exports.exportInventoryToJSON = onRequest({ cors: true, region: "asia-south1" }, async (req, res) => {
  try {
    const result = await runExport();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Scheduled Export (Daily at 2 AM)
 */
exports.scheduledExportInventory = onSchedule({
  schedule: "0 2 * * *",
  timeZone: "Asia/Kolkata",
  region: "asia-south1"
}, async (event) => {
  await runExport();
});

exports.queueVideoCompression = onObjectFinalized({ region: "asia-south1" }, async (event) => {
  const object = event.data;
  const objectName = object.name;
  const bucketName = object.bucket;
  const projectId = process.env.GCLOUD_PROJECT || process.env.PROJECT_ID;

  if (!projectId || !bucketName || !objectName) return;
  if (!isPropertyMediaObject(objectName) || !isVideoObject(object) || isCompressedVideoObject(objectName)) return;

    const parsed = parsePropertyMediaPath(objectName);
    if (!parsed) return;

    const compressedObjectPath = buildCompressedObjectPath(objectName);
    const trackingRef = db.collection(VIDEO_JOB_COLLECTION).doc(buildTrackingDocId(compressedObjectPath));

  try {
    const existingJob = await trackingRef.get();
    if (existingJob.exists) {
      logger.info("Skipping already-tracked video compression job", { objectName, compressedObjectPath });
      return;
    }

    const job = await runVideoCompressionJob({
      projectId,
      bucketName,
      inputObjectPath: objectName,
      compressedObjectPath,
    });

    await trackingRef.set({
      propertyId: parsed.propertyId,
      fieldKey: parsed.fieldKey,
      originalObjectPath: objectName,
      compressedObjectPath,
      originalSizeBytes: Number(object.size || 0),
      runJobName: `projects/${projectId}/locations/${CLOUD_RUN_VIDEO_JOB_REGION}/jobs/${CLOUD_RUN_VIDEO_JOB_NAME}`,
      runOperationName: job.name || "",
      bucketName,
      status: "queued",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("Queued video compression job", {
      objectName,
      compressedObjectPath,
      runOperationName: job.name || "",
    });
  } catch (error) {
    logger.error("Video compression queue failed", { objectName, error: error.message });
    await trackingRef.set({
      propertyId: parsed.propertyId,
      fieldKey: parsed.fieldKey,
      originalObjectPath: objectName,
      compressedObjectPath,
      bucketName,
      status: "queue_failed",
      error: error.message,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
});

exports.finalizeCompressedVideo = onObjectFinalized({ region: "asia-south1" }, async (event) => {
  const object = event.data;
  const objectName = object.name;
  const bucketName = object.bucket;

  if (!bucketName || !objectName) return;
  if (!isCompressedVideoObject(objectName) || !objectName.endsWith(`/${COMPRESSED_FILE_NAME}`)) return;

  const trackingRef = db.collection(VIDEO_JOB_COLLECTION).doc(buildTrackingDocId(objectName));
  const trackingSnap = await trackingRef.get();
  if (!trackingSnap.exists) {
    logger.warn("Compressed video finalized without tracking record", { objectName });
    return;
  }

  const jobData = trackingSnap.data() || {};
  const bucket = storage.bucket(bucketName);

  try {
    const originalSizeBytes = Number(jobData.originalSizeBytes || 0);
    const compressedSizeBytes = Number(object.size || 0);

    if (
      originalSizeBytes > 0 &&
      compressedSizeBytes > 0 &&
      compressedSizeBytes >= originalSizeBytes * 0.98
    ) {
      await bucket.file(objectName).delete({ ignoreNotFound: true });
      await trackingRef.set({
        status: "kept_original",
        originalSizeBytes,
        compressedSizeBytes,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      logger.info("Compressed video was not meaningfully smaller; keeping original", {
        propertyId: jobData.propertyId,
        fieldKey: jobData.fieldKey,
        originalObjectPath: jobData.originalObjectPath,
        compressedObjectPath: objectName,
        originalSizeBytes,
        compressedSizeBytes,
      });
      return;
    }

    const compressedUrl = await ensureDownloadUrl(bucket, objectName);
    const replaced = await applyCompressedVideoToInventory({
      propertyId: jobData.propertyId,
      fieldKey: jobData.fieldKey,
      originalObjectPath: jobData.originalObjectPath,
      compressedUrl,
    });

    if (!replaced) {
      await trackingRef.set({
        status: "awaiting_firestore_match",
        compressedUrl,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      logger.warn("Compressed video ready but original URL was not replaced in Firestore", {
        propertyId: jobData.propertyId,
        fieldKey: jobData.fieldKey,
        originalObjectPath: jobData.originalObjectPath,
      });
      return;
    }

    await bucket.file(jobData.originalObjectPath).delete({ ignoreNotFound: true });
    await trackingRef.set({
      status: "completed",
      compressedUrl,
      originalSizeBytes,
      compressedSizeBytes,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info("Compressed video applied to inventory", {
      propertyId: jobData.propertyId,
      fieldKey: jobData.fieldKey,
      originalObjectPath: jobData.originalObjectPath,
      compressedObjectPath: objectName,
    });
  } catch (error) {
    logger.error("Compressed video finalization failed", { objectName, error: error.message });
    await trackingRef.set({
      status: "finalize_failed",
      error: error.message,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
});
