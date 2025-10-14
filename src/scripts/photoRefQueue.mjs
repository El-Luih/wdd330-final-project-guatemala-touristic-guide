import idbCache from './idbCache.mjs';
import { imageLoader } from './util.mjs';

// Small serialized queue for photo_ref image fetches. Concurrency = 1.
// Exports: enqueuePhotoRef(imgElement, photoRef, opts)

const DEFAULTS = {
  baseDelay: 1500, // ms
  maxRetries: 3,
  ttlMs: 60 * 60 * 1000, // 1 hour cache TTL for blobs
};

// Per-session budget to limit how many photo_ref blob fetches we'll perform
// in a single browsing session (helps in incognito/cold-start scenarios).
const SESSION_BUDGET_KEY = '__photoRefSessionBudget_v1';
const DEFAULT_SESSION_BUDGET = 20; // allow 20 photo blob fetches per session by default

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
      // fetch as blob
      const blob = await fetchAsBlob(mapsUrl);
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
        const backoff = (opts.baseDelay || DEFAULTS.baseDelay) * Math.pow(2, retries) + Math.round(Math.random() * 200);
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
  // If session budget exhausted, indicate refusal so caller can show click-to-load
  if (!consumeSessionBudget()) {
    return false;
  }
  queue.push({ img, photoRef, retries: 0, opts });
  processQueue();
  return true;
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

export default { enqueuePhotoRef };
