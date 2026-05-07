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
const MONITORING_BASE = 'https://monitoring.googleapis.com/v3';
const SCAN_PREFIXES = ['properties/', 'projects/', 'inventory/'];

const FIRESTORE_FREE_DAILY_QUOTA = {
  reads: 50_000,
  writes: 20_000,
  deletes: 20_000,
};

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
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

async function listCollectionDocuments(projectId, accessToken, collectionId) {
  const documents = [];
  let pageToken = '';

  do {
    const url = new URL(`${FIRESTORE_BASE}/projects/${projectId}/databases/(default)/documents/${collectionId}`);
    url.searchParams.set('pageSize', '500');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const payload = await fetchJson(url.toString(), accessToken);
    documents.push(...(payload.documents || []));
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return documents;
}

async function getBucketMetadata(bucketName, accessToken) {
  const url = `${STORAGE_BASE}/b/${encodeURIComponent(bucketName)}`;
  return fetchJson(url, accessToken);
}

async function listStorageObjects(bucketName, accessToken, prefix, extraSearchParams = {}) {
  const objects = [];
  let pageToken = '';

  do {
    const url = new URL(`${STORAGE_BASE}/b/${encodeURIComponent(bucketName)}/o`);
    if (prefix) url.searchParams.set('prefix', prefix);
    url.searchParams.set('maxResults', '1000');
    for (const [key, value] of Object.entries(extraSearchParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const payload = await fetchJson(url.toString(), accessToken);
    (payload.items || []).forEach((item) => {
      objects.push({
        name: item.name,
        size: Number(item.size || 0),
        updated: item.updated || '',
        contentType: item.contentType || '',
        softDeleteTime: item.softDeleteTime || '',
        hardDeleteTime: item.hardDeleteTime || '',
      });
    });
    pageToken = payload.nextPageToken || '';
  } while (pageToken);

  return objects;
}

function sumBytes(items) {
  return (items || []).reduce((total, item) => total + Number(item.size || 0), 0);
}

function groupSoftDeletedItems(items, limit = 10) {
  const groups = new Map();

  items.forEach((item) => {
    const [root = '', ownerId = ''] = String(item.name || '').split('/');
    const key = `${root}/${ownerId}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        root,
        ownerId,
        count: 1,
        bytes: item.size,
        latestSoftDeleteTime: item.softDeleteTime || '',
        latestHardDeleteTime: item.hardDeleteTime || '',
        sampleName: item.name,
      });
      return;
    }

    existing.count += 1;
    existing.bytes += item.size;
    if (String(item.softDeleteTime || '') > String(existing.latestSoftDeleteTime || '')) {
      existing.latestSoftDeleteTime = item.softDeleteTime || '';
      existing.latestHardDeleteTime = item.hardDeleteTime || '';
      existing.sampleName = item.name;
    }
  });

  return [...groups.values()]
    .sort((a, b) => String(b.latestSoftDeleteTime || '').localeCompare(String(a.latestSoftDeleteTime || '')))
    .slice(0, limit);
}

async function sumMonitoringMetric({
  projectId,
  accessToken,
  metricType,
  startTime,
  endTime,
  alignmentPeriodSeconds,
  extraFilter = '',
}) {
  const url = new URL(`${MONITORING_BASE}/projects/${projectId}/timeSeries`);
  const filterParts = [`metric.type="${metricType}"`];
  if (extraFilter) filterParts.push(extraFilter);
  url.searchParams.set('filter', filterParts.join(' AND '));
  url.searchParams.set('interval.endTime', endTime.toISOString());
  url.searchParams.set('interval.startTime', startTime.toISOString());
  url.searchParams.set('aggregation.alignmentPeriod', `${alignmentPeriodSeconds}s`);
  url.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_SUM');
  url.searchParams.set('view', 'FULL');

  const payload = await fetchJson(url.toString(), accessToken);
  return (payload.timeSeries || []).reduce((total, series) => {
    return total + (series.points || []).reduce((seriesTotal, point) => {
      const int64Value = point?.value?.int64Value;
      const doubleValue = point?.value?.doubleValue;
      if (int64Value !== undefined) return seriesTotal + Number(int64Value || 0);
      if (doubleValue !== undefined) return seriesTotal + Number(doubleValue || 0);
      return seriesTotal;
    }, 0);
  }, 0);
}

function percentOfQuota(value, quota) {
  if (!Number.isFinite(value) || !Number.isFinite(quota) || quota <= 0) return null;
  return (value / quota) * 100;
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

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}

function formatRetention(seconds) {
  const totalSeconds = Number(seconds || 0);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'disabled';
  const days = totalSeconds / 86400;
  if (Number.isInteger(days)) return `${days} day${days === 1 ? '' : 's'}`;
  return `${days.toFixed(2)} days`;
}

function printTextReport(snapshot) {
  console.log(`Generated: ${snapshot.generatedAt}`);
  console.log(`Project: ${snapshot.projectId}`);
  console.log(`Bucket: ${snapshot.bucketName}`);
  console.log('');

  console.log('Firestore');
  console.log(`  Inventory docs: ${formatNumber(snapshot.firestore.inventoryCount)}`);
  console.log(`  Project docs: ${formatNumber(snapshot.firestore.projectCount)}`);
  console.log(
    `  Reads (last 24h): ${formatNumber(snapshot.firestore.opsLast24h.reads)} / ${formatNumber(snapshot.firestore.freeDailyQuota.reads)} free (${formatPercent(snapshot.firestore.opsLast24h.readsPctOfFreeDailyQuota)})`
  );
  console.log(
    `  Writes (last 24h): ${formatNumber(snapshot.firestore.opsLast24h.writes)} / ${formatNumber(snapshot.firestore.freeDailyQuota.writes)} free (${formatPercent(snapshot.firestore.opsLast24h.writesPctOfFreeDailyQuota)})`
  );
  console.log(
    `  Deletes (last 24h): ${formatNumber(snapshot.firestore.opsLast24h.deletes)} / ${formatNumber(snapshot.firestore.freeDailyQuota.deletes)} free (${formatPercent(snapshot.firestore.opsLast24h.deletesPctOfFreeDailyQuota)})`
  );
  console.log('');

  console.log('Storage');
  console.log(`  Live objects: ${formatNumber(snapshot.storage.live.objectCount)}`);
  console.log(`  Live stored bytes: ${formatBytes(snapshot.storage.live.bytes)}`);
  console.log(`  Soft-deleted retained: ${formatNumber(snapshot.storage.softDeleted.objectCount)} objects, ${formatBytes(snapshot.storage.softDeleted.bytes)}`);
  console.log(`  Total retained bytes: ${formatBytes(snapshot.storage.retainedTotalBytes)}`);
  console.log(`  Soft delete retention: ${snapshot.storage.softDeletePolicy.retention}`);
  console.log(`  Delete requests (last 24h): ${formatNumber(snapshot.storage.metricsLast24h.deleteRequests)}`);
  console.log(`  Downloaded bytes (last 30d): ${formatBytes(snapshot.storage.metricsLast30d.downloadBytes)}`);
  console.log('');

  console.log('Recent Soft-Deleted Groups');
  if (snapshot.storage.softDeleted.recentGroups.length === 0) {
    console.log('  none');
  } else {
    snapshot.storage.softDeleted.recentGroups.forEach((group) => {
      console.log(
        `  ${group.key} :: ${formatBytes(group.bytes)} :: ${group.latestSoftDeleteTime} :: hard delete ${group.latestHardDeleteTime}`
      );
    });
  }
}

async function buildSnapshot() {
  const env = await readEnvFile(ENV_PATH);
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const bucketName = env.VITE_FIREBASE_STORAGE_BUCKET;
  if (!projectId || !bucketName) {
    throw new Error('Missing Firebase project configuration in .env');
  }

  const firebaseToolsConfig = await readFirebaseToolsConfig();
  const accessToken = await getAccessToken(firebaseToolsConfig);

  const [inventoryDocs, projectDocs, bucketMetadata] = await Promise.all([
    listCollectionDocuments(projectId, accessToken, 'inventory'),
    listCollectionDocuments(projectId, accessToken, 'projects'),
    getBucketMetadata(bucketName, accessToken),
  ]);

  const liveObjectsByPrefix = await Promise.all(
    SCAN_PREFIXES.map((prefix) => listStorageObjects(bucketName, accessToken, prefix))
  );
  const liveParts = SCAN_PREFIXES.map((prefix, index) => ({
    prefix,
    objectCount: liveObjectsByPrefix[index].length,
    bytes: sumBytes(liveObjectsByPrefix[index]),
  }));
  const liveObjectCount = liveParts.reduce((total, part) => total + part.objectCount, 0);
  const liveBytes = liveParts.reduce((total, part) => total + part.bytes, 0);

  const softDeletedItems = await listStorageObjects(bucketName, accessToken, '', { softDeleted: true });
  const softDeletedBytes = sumBytes(softDeletedItems);

  const now = new Date();
  const last24hStart = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const last30dStart = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

  const [
    readsLast24h,
    writesLast24h,
    deletesLast24h,
    storageDeleteRequestsLast24h,
    storageDownloadBytesLast30d,
  ] = await Promise.all([
    sumMonitoringMetric({
      projectId,
      accessToken,
      metricType: 'firestore.googleapis.com/document/read_ops_count',
      startTime: last24hStart,
      endTime: now,
      alignmentPeriodSeconds: 24 * 60 * 60,
      extraFilter: 'resource.labels.database_id="(default)"',
    }),
    sumMonitoringMetric({
      projectId,
      accessToken,
      metricType: 'firestore.googleapis.com/document/write_ops_count',
      startTime: last24hStart,
      endTime: now,
      alignmentPeriodSeconds: 24 * 60 * 60,
      extraFilter: 'resource.labels.database_id="(default)"',
    }),
    sumMonitoringMetric({
      projectId,
      accessToken,
      metricType: 'firestore.googleapis.com/document/delete_ops_count',
      startTime: last24hStart,
      endTime: now,
      alignmentPeriodSeconds: 24 * 60 * 60,
      extraFilter: 'resource.labels.database_id="(default)"',
    }),
    sumMonitoringMetric({
      projectId,
      accessToken,
      metricType: 'storage.googleapis.com/api/request_count',
      startTime: last24hStart,
      endTime: now,
      alignmentPeriodSeconds: 24 * 60 * 60,
      extraFilter: `resource.labels.bucket_name="${bucketName}" AND metric.labels.method="DeleteObject" AND metric.labels.response_code="OK"`,
    }),
    sumMonitoringMetric({
      projectId,
      accessToken,
      metricType: 'storage.googleapis.com/network/sent_bytes_count',
      startTime: last30dStart,
      endTime: now,
      alignmentPeriodSeconds: 30 * 24 * 60 * 60,
      extraFilter: `resource.labels.bucket_name="${bucketName}" AND metric.labels.method="ReadObject" AND metric.labels.response_code="OK"`,
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    projectId,
    bucketName,
    firestore: {
      inventoryCount: inventoryDocs.length,
      projectCount: projectDocs.length,
      freeDailyQuota: { ...FIRESTORE_FREE_DAILY_QUOTA },
      opsLast24h: {
        reads: readsLast24h,
        writes: writesLast24h,
        deletes: deletesLast24h,
        readsPctOfFreeDailyQuota: percentOfQuota(readsLast24h, FIRESTORE_FREE_DAILY_QUOTA.reads),
        writesPctOfFreeDailyQuota: percentOfQuota(writesLast24h, FIRESTORE_FREE_DAILY_QUOTA.writes),
        deletesPctOfFreeDailyQuota: percentOfQuota(deletesLast24h, FIRESTORE_FREE_DAILY_QUOTA.deletes),
      },
    },
    storage: {
      live: {
        objectCount: liveObjectCount,
        bytes: liveBytes,
        byPrefix: liveParts,
      },
      softDeleted: {
        objectCount: softDeletedItems.length,
        bytes: softDeletedBytes,
        recentGroups: groupSoftDeletedItems(softDeletedItems, 10),
      },
      retainedTotalBytes: liveBytes + softDeletedBytes,
      softDeletePolicy: {
        retentionDurationSeconds: bucketMetadata?.softDeletePolicy?.retentionDurationSeconds || '0',
        retention: formatRetention(bucketMetadata?.softDeletePolicy?.retentionDurationSeconds || 0),
        effectiveTime: bucketMetadata?.softDeletePolicy?.effectiveTime || null,
      },
      metricsLast24h: {
        deleteRequests: storageDeleteRequestsLast24h,
      },
      metricsLast30d: {
        downloadBytes: storageDownloadBytesLast30d,
      },
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const snapshot = await buildSnapshot();
  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  printTextReport(snapshot);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
