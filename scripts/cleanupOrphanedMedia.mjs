import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, '.env');
const FIREBASE_TOOLS_CONFIG_PATH = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  '.config',
  'configstore',
  'firebase-tools.json'
);
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1';
const STORAGE_BASE = 'https://storage.googleapis.com/storage/v1';
const SCAN_PREFIXES = ['properties/', 'projects/', 'inventory/'];

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    delete: flags.has('--delete'),
    json: flags.has('--json'),
  };
}

async function readEnvFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const env = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    env[key] = value;
  });
  return env;
}

async function readFirebaseToolsConfig() {
  const raw = await fs.readFile(FIREBASE_TOOLS_CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

async function getAccessToken(config) {
  const tokens = config?.tokens || {};
  const expiresAt = Number(tokens.expires_at || 0);
  if (tokens.access_token && expiresAt > Date.now() + 60_000) {
    return tokens.access_token;
  }

  const refreshToken = tokens.refresh_token;
  const clientId = config?.user?.azp;
  if (!refreshToken || !clientId) {
    throw new Error('Missing refresh token or client id in firebase-tools config');
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed (${response.status}): ${await response.text()}`);
  }

  const refreshed = await response.json();
  return refreshed.access_token;
}

async function fetchJson(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${url} failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;
  if ('arrayValue' in value) {
    return (value.arrayValue.values || []).map(decodeFirestoreValue);
  }
  if ('mapValue' in value) {
    const output = {};
    for (const [key, nestedValue] of Object.entries(value.mapValue.fields || {})) {
      output[key] = decodeFirestoreValue(nestedValue);
    }
    return output;
  }
  return null;
}

function decodeFirestoreDocument(document) {
  const fields = {};
  for (const [key, value] of Object.entries(document.fields || {})) {
    fields[key] = decodeFirestoreValue(value);
  }
  return {
    id: document.name.split('/').pop(),
    name: document.name,
    fields,
  };
}

async function listCollectionDocuments(projectId, accessToken, collectionId) {
  const documents = [];
  let pageToken = '';

  do {
    const url = new URL(`${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${collectionId}`);
    url.searchParams.set('pageSize', '500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const payload = await fetchJson(url.toString(), accessToken);
    (payload.documents || []).forEach((document) => {
      documents.push(decodeFirestoreDocument(document));
    });
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return documents;
}

function extractStorageObjectPath(source, bucketName) {
  if (typeof source !== 'string' || !source) return '';

  const trimmed = source.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('properties/') || trimmed.startsWith('projects/') || trimmed.startsWith('inventory/')) {
    return trimmed;
  }
  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice(5);
    if (!withoutScheme.startsWith(`${bucketName}/`)) return '';
    return withoutScheme.slice(bucketName.length + 1);
  }

  try {
    const parsed = new URL(trimmed);
    const pathMatch = parsed.pathname.match(/\/o\/(.+)$/);
    if (pathMatch?.[1]) {
      return decodeURIComponent(pathMatch[1]);
    }
  } catch (_) {
    return '';
  }

  return '';
}

function collectStoragePaths(value, bucketName, output) {
  if (typeof value === 'string') {
    const objectPath = extractStorageObjectPath(value, bucketName);
    if (objectPath) output.add(objectPath);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectStoragePaths(entry, bucketName, output));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((entry) => collectStoragePaths(entry, bucketName, output));
  }
}

async function listStorageObjects(bucketName, accessToken, prefix) {
  const objects = [];
  let pageToken = '';

  do {
    const url = new URL(`${STORAGE_BASE}/b/${encodeURIComponent(bucketName)}/o`);
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('maxResults', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const payload = await fetchJson(url.toString(), accessToken);
    (payload.items || []).forEach((item) => {
      objects.push({
        name: item.name,
        size: Number(item.size || 0),
        updated: item.updated || '',
        contentType: item.contentType || '',
      });
    });
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return objects;
}

function classifyObject(objectName, inventoryIds, projectIds, referencedPaths) {
  const [root, ownerId] = String(objectName || '').split('/');
  const isReferenced = referencedPaths.has(objectName);
  if (isReferenced) return null;

  if (root === 'properties') {
    return inventoryIds.has(ownerId) ? 'unreferenced-property-media' : 'missing-property-doc';
  }
  if (root === 'projects') {
    return projectIds.has(ownerId) ? 'unreferenced-project-media' : 'missing-project-doc';
  }
  if (root === 'inventory') {
    return inventoryIds.has(ownerId) ? 'unreferenced-legacy-media' : 'missing-legacy-doc';
  }

  return 'unknown-prefix';
}

function summarizeOrphans(orphanedObjects) {
  const byReason = {};
  let totalBytes = 0;

  orphanedObjects.forEach((object) => {
    byReason[object.reason] = byReason[object.reason] || { count: 0, bytes: 0 };
    byReason[object.reason].count += 1;
    byReason[object.reason].bytes += object.size;
    totalBytes += object.size;
  });

  return { byReason, totalBytes };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

async function deleteStorageObject(bucketName, accessToken, objectName) {
  const url = `${STORAGE_BASE}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${objectName} failed (${response.status}): ${await response.text()}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const env = await readEnvFile(ENV_PATH);
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const bucketName = env.VITE_FIREBASE_STORAGE_BUCKET;
  if (!projectId || !bucketName) {
    throw new Error('Missing Firebase project configuration in .env');
  }

  const firebaseToolsConfig = await readFirebaseToolsConfig();
  const accessToken = await getAccessToken(firebaseToolsConfig);

  const [inventoryDocs, projectDocs] = await Promise.all([
    listCollectionDocuments(projectId, accessToken, 'inventory'),
    listCollectionDocuments(projectId, accessToken, 'projects'),
  ]);

  const referencedPaths = new Set();
  inventoryDocs.forEach((doc) => collectStoragePaths(doc.fields, bucketName, referencedPaths));
  projectDocs.forEach((doc) => collectStoragePaths(doc.fields, bucketName, referencedPaths));

  const [propertyObjects, projectObjects, legacyObjects] = await Promise.all(
    SCAN_PREFIXES.map((prefix) => listStorageObjects(bucketName, accessToken, prefix))
  );
  const allObjects = [...propertyObjects, ...projectObjects, ...legacyObjects];

  const inventoryIds = new Set(inventoryDocs.map((doc) => doc.id));
  const projectIds = new Set(projectDocs.map((doc) => doc.id));

  const orphanedObjects = allObjects
    .map((object) => {
      const reason = classifyObject(object.name, inventoryIds, projectIds, referencedPaths);
      return reason ? { ...object, reason } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  const summary = summarizeOrphans(orphanedObjects);

  if (args.json) {
    console.log(JSON.stringify({
      mode: args.delete ? 'delete' : 'dry-run',
      projectId,
      bucketName,
      inventoryCount: inventoryDocs.length,
      projectCount: projectDocs.length,
      scannedObjectCount: allObjects.length,
      referencedObjectCount: referencedPaths.size,
      orphanedObjectCount: orphanedObjects.length,
      orphanedBytes: summary.totalBytes,
      byReason: summary.byReason,
      sample: orphanedObjects.slice(0, 50),
    }, null, 2));
  } else {
    console.log(`Mode: ${args.delete ? 'delete' : 'dry-run'}`);
    console.log(`Inventory docs: ${inventoryDocs.length}`);
    console.log(`Project docs: ${projectDocs.length}`);
    console.log(`Bucket scanned: ${bucketName}`);
    console.log(`Storage objects scanned: ${allObjects.length}`);
    console.log(`Referenced storage objects found in Firestore: ${referencedPaths.size}`);
    console.log(`Orphaned storage objects: ${orphanedObjects.length} (${formatBytes(summary.totalBytes)})`);
    console.log('');
    Object.entries(summary.byReason)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .forEach(([reason, stats]) => {
        console.log(`- ${reason}: ${stats.count} file(s), ${formatBytes(stats.bytes)}`);
      });

    if (orphanedObjects.length > 0) {
      console.log('');
      console.log('Sample orphaned objects:');
      orphanedObjects.slice(0, 20).forEach((object) => {
        console.log(`  ${object.reason} :: ${object.name} :: ${formatBytes(object.size)}`);
      });
    }
  }

  if (!args.delete || orphanedObjects.length === 0) {
    return;
  }

  let deleted = 0;
  let failed = 0;
  for (const object of orphanedObjects) {
    try {
      await deleteStorageObject(bucketName, accessToken, object.name);
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.warn(`Failed to delete ${object.name}: ${error.message}`);
    }
  }

  console.log('');
  console.log(`Deleted: ${deleted}`);
  console.log(`Failed: ${failed}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
