const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

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
