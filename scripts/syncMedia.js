import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import fs from "fs";
import path from "path";

// 1. Load ENVs manually to avoid extra dependencies
const envFile = fs.readFileSync(".env", "utf-8");
const config = {};
envFile.split("\n").forEach(line => {
  const [key, ...valueParts] = line.split("=");
  if (key && valueParts.length > 0) {
    config[key.trim()] = valueParts.join("=").trim();
  }
});

const firebaseConfig = {
  apiKey: config.VITE_FIREBASE_API_KEY,
  authDomain: config.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: config.VITE_FIREBASE_PROJECT_ID,
  storageBucket: config.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: config.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: config.VITE_FIREBASE_APP_ID
};

console.log("🚀 Starting Server-Side Media Migration...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

/**
 * Transforms a Google Drive share/view URL into a direct download URL.
 */
function getDirectDriveUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const fileIdMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }
  return url;
}

async function runMigration() {
  const q = query(collection(db, "inventory"), where("mediaUploadPending", "==", true));
  const snapshot = await getDocs(q);
  
  console.log(`Found ${snapshot.size} properties with pending media sync.`);
  
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const docId = docSnap.id;
    console.log(`\nProcessing property: ${data.name} (${docId})`);
    
    let updatedCount = 0;
    const mediaFields = [
      "images.buildingFacade", 
      "images.floorPlan", 
      "images.entryToBuilding",
      "images.unitFacade",
      "images.interior",
      "images.signage",
      "presentationFile"
    ];

    const updates = {};
    
    for (const field of mediaFields) {
      const parts = field.split(".");
      let val = data;
      for (const part of parts) {
        val = val?.[part];
      }

      // Check if value is a Drive link (e.g. string starting with http, or array containing http)
      const url = Array.isArray(val) ? val[0] : val;
      
      if (typeof url === 'string' && url.includes("drive.google.com")) {
        const directUrl = getDirectDriveUrl(url);
        console.log(`  - Syncing ${field}: ${url}`);
        
        try {
          // 1. Download
          const response = await fetch(directUrl);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await response.arrayBuffer();
          
          // 2. Upload to Storage
          const ext = ".jpg"; // Basic guess
          const fileName = `${field.replace(".", "_")}_${Date.now()}${ext}`;
          const storagePath = `inventory/${docId}/${fileName}`;
          const storageRef = ref(storage, storagePath);
          
          await uploadBytes(storageRef, buffer);
          const downloadUrl = await getDownloadURL(storageRef);
          
          // 3. Queue Update
          updates[field] = [downloadUrl];
          updatedCount++;
          console.log(`    ✅ Success: ${storagePath}`);
        } catch (err) {
          console.error(`    ❌ Failed ${field}: ${err.message}`);
        }
      }
    }

    if (updatedCount > 0 || data.mediaUploadPending) {
      updates.mediaUploadPending = false; // Mark overall item as done
      updates.updated_at = serverTimestamp();
      await updateDoc(doc(db, "inventory", docId), updates);
      console.log(`  Done: Updated ${updatedCount} media slots.`);
    }
  }

  console.log("\n✅ Migration Finished.");
  process.exit(0);
}

runMigration().catch(err => {
  console.error("Migration crashed:", err);
  process.exit(1);
});
