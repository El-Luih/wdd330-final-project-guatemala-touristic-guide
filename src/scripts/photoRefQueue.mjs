import idbCache from './idbCache.mjs';
import { imageLoader } from './util.mjs';

// Small serialized queue for photo_ref image fetches. Concurrency = 1.
// Exports: enqueuePhotoRef(imgElement, photoRef, opts)

const DEFAULTS = {
  baseDelay: 2500, // ms (increased to be more conservative)
  maxRetries: 2,
  ttlMs: 60 * 60 * 1000, // 1 hour cache TTL for blobs
};

// Per-session budget to limit how many photo_ref blob fetches we'll perform
// in a single browsing session (helps in incognito/cold-start scenarios).
const SESSION_BUDGET_KEY = '__photoRefSessionBudget_v1';
const DEFAULT_SESSION_BUDGET = 20; // allow 20 photo blob fetches per session by default
// Per-page automatic enqueue limit: how many images the page may auto-fetch
const DEFAULT_SESSION_AUTO_LIMIT = 6; // default automatic loads per page

function loadSessionBudget() {
  try {
    const raw = sessionStorage.getItem(SESSION_BUDGET_KEY);
    return raw ? parseInt(raw, 10) || 0 : DEFAULT_SESSION_BUDGET;
  } catch (e) { return DEFAULT_SESSION_BUDGET; }
}
function saveSessionBudget(val) {
  try { sessionStorage.setItem(SESSION_BUDGET_KEY, String(val)); } catch (e) {}
}
function consumeSessionBudget() {
  const cur = loadSessionBudget();
  if (cur <= 0) return false;
  saveSessionBudget(cur - 1);
  return true;
}


let queue = [];
let active = false;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Read host cooldown map set by cardRenderer (if available)
function getHostCooldown(host) {
  try {
    const raw = sessionStorage.getItem('__cardRenderer_hostFailures_v1') || '{}';
    const map = JSON.parse(raw || '{}');
    const entry = map[host];
    if (!entry) return 0;
    return Math.max(0, (entry.cooldownUntil || 0) - Date.now());
  } catch (e) { return 0; }
}

function recordHostFailure(host) {
  if (!host) return;
  try {
    const raw = sessionStorage.getItem('__cardRenderer_hostFailures_v1') || '{}';
    const map = JSON.parse(raw || '{}');
    const entry = map[host] || { failures: 0, cooldownUntil: 0 };
    entry.failures = (entry.failures || 0) + 1;
    const base = 15000; // 15s base
    const max = 10 * 60 * 1000; // 10 minutes
    const cooldown = Math.min(base * Math.pow(2, Math.max(0, entry.failures - 1)), max);
    entry.cooldownUntil = Date.now() + cooldown;
    map[host] = entry;
    sessionStorage.setItem('__cardRenderer_hostFailures_v1', JSON.stringify(map));
    return entry;
  } catch (e) { return null; }
}

async function fetchAsBlob(url) {
  const resp = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-store' });
  if (!resp.ok) throw new Error(`fetch failed ${resp.status}`);
  return await resp.blob();
}

async function processQueue() {
  if (active) return;
  active = true;
  while (queue.length) {
    const item = queue.shift();
    const { img, photoRef, retries = 0, opts } = item;
    try {
      // Check IDB cache first
      const key = `photoBlob:${photoRef}`;
      const cached = await idbCache.getCache(key);
      if (cached && cached.type && cached.data) {
        // cached is an object with { type, data: base64 }
        try {
          const blob = b64toBlob(cached.data, cached.type);
          const urlObj = URL.createObjectURL(blob);
          img.src = urlObj;
          // optionally revokeObjectURL after load
          img.onload = () => { try { URL.revokeObjectURL(urlObj); } catch (e) {} };
          continue; // move to next queue item
        } catch (e) {
          // fall through to re-fetch
        }
      }

  // Not cached: attempt to fetch via Maps Photo endpoint which may redirect
  const mapsUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${encodeURIComponent(opts.googleKey)}`;
      // before issuing the fetch, check if host is in cooldown (to avoid 429s/492s)
      try {
        const u = new URL(mapsUrl);
        const host = u.host;
        const cd = getHostCooldown(host);
        if (cd > 0) {
          // put the item back and delay processing
          queue.unshift(item);
          await sleep(Math.min(cd, 2000));
          continue;
        }
      } catch (e) {}
      // throttle between successive network fetches
      await sleep(200 + Math.round(Math.random() * 300));
      // fetch as blob (inline so we can inspect status and record host failures)
      let resp;
      try {
        resp = await fetch(mapsUrl, { method: 'GET', mode: 'cors', cache: 'no-store' });
      } catch (e) {
        // network error - record host failure and rethrow to trigger retry/backoff
        try { const u = new URL(mapsUrl); recordHostFailure(u.host); } catch (e2) {}
        throw e;
      }
      if (!resp.ok) {
        // record host failure for these status codes which often indicate throttling
        try { const u = new URL(mapsUrl); recordHostFailure(u.host); } catch (e) {}
        throw new Error(`fetch failed ${resp.status}`);
      }
      const blob = await resp.blob();
      // set image from blob
      const urlObj = URL.createObjectURL(blob);
      img.src = urlObj;
      img.onload = () => { try { URL.revokeObjectURL(urlObj); } catch (e) {} };

      // store blob as base64 in IDB to avoid repeated hits within TTL
      try {
        const data = await blobToB64(blob);
        await idbCache.setCache(key, { type: blob.type || 'image/jpeg', data }, opts.ttlMs || DEFAULTS.ttlMs);
      } catch (e) {
        // ignore cache failures
        console.warn('photoRefQueue: failed to cache blob', e);
      }
    } catch (err) {
      // on failure, decide to retry with backoff
      if (retries + 1 <= (opts.maxRetries || DEFAULTS.maxRetries)) {
        const nextRetries = retries + 1;
        const backoff = (opts.baseDelay || DEFAULTS.baseDelay) * Math.pow(2, retries) + Math.round(Math.random() * 400);
        queue.unshift({ img, photoRef, retries: nextRetries, opts });
        await sleep(backoff);
      } else {
        // give up: leave placeholder
        console.warn('photoRefQueue: giving up on', photoRef, err);
      }
    }
  }
  active = false;
}

export function enqueuePhotoRef(img, photoRef, opts = {}) {
  // Enqueue without consuming budget up-front. The processing loop will check the
  // IDB cache first and then attempt to consume budget only when a network fetch
  // is required. This avoids wasting the session budget on images that are
  // already cached.
  queue.push({ img, photoRef, retries: 0, opts });
  processQueue();
  return true;
}

// Try to enqueue a photo_ref immediately: check IDB cache synchronously (async
// call) and consume budget only if a network fetch is required. Returns a
// Promise that resolves to true if the operation was accepted/queued or false
// if it was refused due to budget exhaustion.
export async function tryEnqueuePhotoRef(img, photoRef, opts = {}) {
  try {
    const key = `photoBlob:${photoRef}`;
    try {
      const cached = await idbCache.getCache(key);
      if (cached && cached.type && cached.data) {
        const blob = b64toBlob(cached.data, cached.type);
        const urlObj = URL.createObjectURL(blob);
        img.src = urlObj;
        img.onload = () => { try { URL.revokeObjectURL(urlObj); } catch (e) {} };
        return true;
      }
    } catch (e) {
      // fall through to budget check and enqueue
    }
    // Not cached: attempt to consume budget now
    // Enforce per-page auto enqueue limit to avoid bulk auto-fetches from a single page
    try {
      const limit = parseInt(sessionStorage.getItem('__photoRefAutoLimit_v1'), 10) || DEFAULT_SESSION_AUTO_LIMIT;
      const usedKey = '__photoRefAutoUsed_v1';
      const used = parseInt(sessionStorage.getItem(usedKey), 10) || 0;
      if (used >= limit) return false;
      // attempt to consume session budget; if successful, increment used counter
      if (!consumeSessionBudget()) return false;
      sessionStorage.setItem(usedKey, String(used + 1));
    } catch (e) {
      if (!consumeSessionBudget()) return false;
    }
    queue.push({ img, photoRef, retries: 0, opts });
    processQueue();
    return true;
  } catch (e) {
    return false;
  }
}

// helpers to convert blob <-> base64 string for IDB storage
function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result; // data:<type>;base64,<data>
      const idx = dataUrl.indexOf(',');
      if (idx < 0) return reject(new Error('invalid dataurl'));
      const b64 = dataUrl.slice(idx + 1);
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function b64toBlob(b64, type = 'image/jpeg') {
  const byteCharacters = atob(b64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type });
}

export default { enqueuePhotoRef, tryEnqueuePhotoRef };
