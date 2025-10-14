import { imageLoader, isFavorite, toggleFavorite, googleKey } from './util.mjs';
import photoRefQueue from './photoRefQueue.mjs';
import { attractionCard } from './PlaceDetails.mjs';
import { restaurantCard } from './RestaurantDetails.mjs';

let _imageObserver = null;

// Retry scheduler: collect images that attempted a photo_ref but fell back to placeholder,
// and retry them once after 10s from page load. We keep this minimal: one retry per image.
if (typeof window !== 'undefined') {
  if (!window.__cardRendererRetryState) window.__cardRendererRetryState = { list: [], timerSet: false };
}

// Master delay before starting retries (ms) and stagger between individual retries (ms)
const RETRY_MASTER_DELAY = 10000; // 10s
const RETRY_STAGGER_MS = 800; // 0.8s between each retry

function schedulePhotoRefRetry(img, photoRef) {
  try {
    if (typeof window === 'undefined' || !img) return;
    const st = window.__cardRendererRetryState;
    if (!st) return;
    // avoid duplicates (use image reference identity)
    if (st.list.some(item => item.img === img)) return;
    st.list.push({ img, photoRef });

    // If timer already set, new items will be included in the upcoming run
    if (!st.timerSet) {
      st.timerSet = true;
      setTimeout(() => {
        // capture list snapshot and reset
        const items = Array.from(st.list);
        st.list = [];
        st.timerSet = false;

        // schedule individual retries staggered so they don't all hit at once
        items.forEach((it, idx) => {
          const { img: retryImg, photoRef: ref } = it;
          const delay = idx * RETRY_STAGGER_MS;
          setTimeout(() => {
            try {
              if (!retryImg || !document.body.contains(retryImg)) return;
              if (retryImg.dataset.retryAttempted === '1') return;
              const src = retryImg.getAttribute('src') || '';
              if (!/placeholder/.test(src)) return;
              if (!ref) return;
              // check per-photo failure limit and global disable state
              const globalState = (typeof window !== 'undefined' && window.__cardRendererPhotoRefState) ? window.__cardRendererPhotoRefState : { disabled: false };
              if (globalState.disabled) return;
              if (getPhotoRefFailures(ref) > PER_PHOTO_FAILURE_LIMIT) return;
              // mark attempted
              retryImg.dataset.retryAttempted = '1';
              // Enqueue through the serialized PhotoRefQueue which will fetch blob, cache it and
              // set the image src when available. Provide googleKey and caching options.
              try {
                photoRefQueue.enqueuePhotoRef(retryImg, ref, { googleKey, baseDelay: 2000, maxRetries: 3, ttlMs: 60 * 60 * 1000 });
              } catch (e) {}
            } catch (e) {}
          }, delay);
        });
      }, RETRY_MASTER_DELAY);
    }
  } catch (e) {}
}

// --- sessionStorage-backed per-photo_ref failure tracking ---
const PHOTO_REF_FAILURE_KEY = '__cardRenderer_photoRefFailures_v1';
function loadPhotoRefFailures() {
  try {
    const raw = sessionStorage.getItem(PHOTO_REF_FAILURE_KEY) || '{}';
    return JSON.parse(raw || '{}');
  } catch (e) { return {}; }
}
function savePhotoRefFailures(map) {
  try { sessionStorage.setItem(PHOTO_REF_FAILURE_KEY, JSON.stringify(map || {})); } catch (e) {}
}
function incrementPhotoRefFailure(photoRef) {
  if (!photoRef) return;
  try {
    const map = loadPhotoRefFailures();
    map[photoRef] = (map[photoRef] || 0) + 1;
    savePhotoRefFailures(map);
    return map[photoRef];
  } catch (e) { return null; }
}
function getPhotoRefFailures(photoRef) {
  if (!photoRef) return 0;
  try { const map = loadPhotoRefFailures(); return map[photoRef] || 0; } catch (e) { return 0; }
}

// If a photo_ref has failed this many times, don't attempt again (persisted across reloads)
const PER_PHOTO_FAILURE_LIMIT = 2;

// --- per-host failure/cooldown tracking ---
const HOST_FAILURE_KEY = '__cardRenderer_hostFailures_v1';
function loadHostFailures() {
  try { return JSON.parse(sessionStorage.getItem(HOST_FAILURE_KEY) || '{}'); } catch (e) { return {}; }
}
function saveHostFailures(obj) { try { sessionStorage.setItem(HOST_FAILURE_KEY, JSON.stringify(obj || {})); } catch (e) {} }
function recordHostFailure(host) {
  if (!host) return;
  try {
    const map = loadHostFailures();
    const entry = map[host] || { failures: 0, cooldownUntil: 0 };
    entry.failures = (entry.failures || 0) + 1;
    // exponential cooldown: base 10s * 2^(failures-1), capped to 5 minutes
    const base = 10000;
    const max = 5 * 60 * 1000;
    const cooldown = Math.min(base * Math.pow(2, Math.max(0, entry.failures - 1)), max);
    entry.cooldownUntil = Date.now() + cooldown;
    map[host] = entry;
    saveHostFailures(map);
    return entry;
  } catch (e) { return null; }
}
function getHostCooldown(host) {
  if (!host) return 0;
  try { const map = loadHostFailures(); const entry = map[host]; if (!entry) return 0; return Math.max(0, (entry.cooldownUntil || 0) - Date.now()); } catch (e) { return 0; }
}

function humanizeTag(raw) {
  if (!raw || typeof raw !== 'string') return '';
  // replace underscores and dashes with spaces, split on non-letters, then Title Case
  const parts = raw.replace(/[-_]+/g, ' ').split(/\s+/).filter(Boolean);
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}
export function ensureImageObserver() {
  if (_imageObserver) return _imageObserver;
  _imageObserver = new IntersectionObserver(async (entries) => {
    entries.forEach(async entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      const src = img.dataset.src;
      if (src) {
        // If this is a Maps Photo endpoint (photo_reference) route it through the
        // serialized PhotoRefQueue to avoid bursts against the CDN. Otherwise use the
        // shared imageLoader.
        try {
          const isPhotoRef = /maps.googleapis.com\/maps\/api\/place\/photo/.test(src);
          if (isPhotoRef) {
            // try to extract photo_reference param
            try {
              const u = new URL(src);
              const pr = u.searchParams.get('photoreference') || u.searchParams.get('photo_reference');
              if (pr) {
                try {
                  // use tryEnqueuePhotoRef to avoid consuming session budget for cached blobs
                  try {
                    const ok = await photoRefQueue.tryEnqueuePhotoRef(img, pr, { googleKey });
                    if (!ok) {
                      try { img.dataset.photoRefBlocked = '1'; } catch (e) {}
                      try { addClickToLoad(img, pr); } catch (e) {}
                    }
                  } catch (e) {
                    // If tryEnqueuePhotoRef fails unexpectedly, fall back to enqueue
                    photoRefQueue.enqueuePhotoRef(img, pr, { googleKey });
                  }
                } catch (e) {
                  try { imageLoader.enqueue(img, src).then(() => { try { img.removeAttribute('data-src'); } catch (e) {} }).catch(() => { try { img.removeAttribute('data-src'); } catch (e) {} }); } catch (e2) {}
                }
              } else {
                // fallback to normal loader
                imageLoader.enqueue(img, src).then(() => { try { img.removeAttribute('data-src'); } catch (e) {} }).catch(() => { try { img.removeAttribute('data-src'); } catch (e) {} });
              }
            } catch (e) {
              imageLoader.enqueue(img, src).then(() => { try { img.removeAttribute('data-src'); } catch (e) {} }).catch(() => { try { img.removeAttribute('data-src'); } catch (e) {} });
            }
          } else {
            imageLoader.enqueue(img, src).then(() => { try { img.removeAttribute('data-src'); } catch (e) {} }).catch(() => { try { img.removeAttribute('data-src'); } catch (e) {} });
          }
        } catch (e) {
          try { imageLoader.enqueue(img, src); } catch (e2) {}
        }
      }
      try { _imageObserver.unobserve(img); } catch (e) {}
    });
  }, { rootMargin: '200px 0px' });
  return _imageObserver;
}

function addClickToLoad(img, photoRef) {
  try {
    // avoid adding twice
    if (img.dataset.clickToLoadAttached === '1') return;
    img.dataset.clickToLoadAttached = '1';
    // simple visual affordance: show title and cursor
    img.title = 'Image blocked to avoid quota; click to load';
    img.style.cursor = 'pointer';
        const handler = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        // attempt to import and enqueue again; the queue will consume budget
            const mod = await import('./photoRefQueue.mjs');
            const tryEnqueue = mod.tryEnqueuePhotoRef || (mod.default && mod.default.tryEnqueuePhotoRef);
            if (typeof tryEnqueue === 'function') {
              const ok = await tryEnqueue(img, photoRef, { googleKey });
              if (ok) {
                try { img.removeAttribute('title'); } catch (e) {}
                try { img.style.cursor = ''; } catch (e) {}
                try { delete img.dataset.photoRefBlocked; } catch (e) {}
                try { img.removeEventListener('click', handler); } catch (e) {}
              } else {
                try { img.title = 'Still blocked — please try again later'; } catch (e) {}
              }
            }
      } catch (e) {
        console.warn('click-to-load enqueue failed', e);
      }
    };
    img.addEventListener('click', handler);
  } catch (e) {}
}

function applyPhotoRefFallback(img, place) {
  if (!img || !place) return;
  img.onerror = () => {
    if (!img.dataset.triedPhotoRef && place.photoRefs && place.photoRefs.length && googleKey) {
      img.dataset.triedPhotoRef = '1';
      img.src = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(place.photoRefs[0])}&key=${googleKey}`;
      return;
    }
    const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL || '/' : '/';
    img.src = `${base}images/placeholder-2x1.svg`;
  };
}

export function createAttractionCard(place, { mapHelpers = null, onFiltersReapply = null } = {}) {
  const cardData = attractionCard(place);
  const card = document.createElement('article');
  card.className = 'result-card destination-card';
  card.dataset.placeId = cardData.id;

  const imgWrap = document.createElement('div');
  imgWrap.className = 'card-media ratio-2x1';
  const img = document.createElement('img');
  img.dataset.src = cardData.image;
  img.src = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.BASE_URL || '/') + 'images/placeholder-2x1.svg' : '/images/placeholder-2x1.svg';
  img.alt = cardData.name;
  // photo ref fallback
  img.onerror = () => {
    if (!img.dataset.triedPhotoRef && place && place.photoRefs && place.photoRefs.length && googleKey) {
      img.dataset.triedPhotoRef = '1';
      img.src = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(place.photoRefs[0])}&key=${googleKey}`;
      return;
    }
    const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL || '/' : '/';
    img.src = `${base}images/placeholder-2x1.svg`;
    // If we attempted a photoRef and it failed, persist a per-photo failure count and
    // only schedule retry if this photoRef hasn't reached the per-photo limit.
    try {
      const ref = (place && place.photoRefs && place.photoRefs.length) ? place.photoRefs[0] : null;
      if (img.dataset.triedPhotoRef === '1' && ref) {
          const failures = incrementPhotoRefFailure(ref) || 0;
          // record host failure (googleusercontent host)
          try { recordHostFailure('lh3.googleusercontent.com'); } catch (e) {}
          if (failures <= PER_PHOTO_FAILURE_LIMIT) schedulePhotoRefRetry(img, ref);
      }
    } catch (e) {}
  };

  ensureImageObserver().observe(img);
  imgWrap.appendChild(img);
  card.appendChild(imgWrap);

  const body = document.createElement('div');
  body.className = 'card-body';
  const h3 = document.createElement('h3'); h3.textContent = cardData.name; body.appendChild(h3);

  const tags = document.createElement('div'); tags.className = 'card-tags';
  (cardData.types || []).forEach(t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = humanizeTag(t); tags.appendChild(s); });
  body.appendChild(tags);

  const status = document.createElement('div'); status.className = 'card-status'; status.textContent = cardData.status || 'Unknown'; body.appendChild(status);

  const actions = document.createElement('div'); actions.className = 'card-actions';
  const mapLink = document.createElement('a');
  mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cardData.name)}&query_place_id=${encodeURIComponent(cardData.id)}`;
  mapLink.textContent = 'Open in Google Maps'; mapLink.target = '_blank'; actions.appendChild(mapLink);

  const favBtn = document.createElement('button'); favBtn.className = 'fav-button'; favBtn.textContent = isFavorite(cardData.id, 'destination') ? '★' : '☆';
  // Make explicit this is a non-submitting button and prevent default navigation
  favBtn.type = 'button';
  favBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(cardData.id, 'destination');
    favBtn.textContent = isFavorite(cardData.id, 'destination') ? '★' : '☆';
    if (typeof onFiltersReapply === 'function') onFiltersReapply();
  });
  actions.appendChild(favBtn);
  body.appendChild(actions);

  card.appendChild(body);

  card.addEventListener('click', () => {
    if (place.location && mapHelpers && typeof mapHelpers.setView === 'function' && typeof mapHelpers.highlightMarker === 'function') {
      mapHelpers.setView({ lat: place.location.lat, lng: place.location.lng, zoom: 14 });
      mapHelpers.highlightMarker(place.placeId, { bounce: true });
    }
  });

  return card;
}

export function createRestaurantCard(place, { mapHelpers = null, onFiltersReapply = null } = {}) {
  const cardData = restaurantCard(place);
  // debug: log when a restaurant card is created so we can verify renderer is used
  try { console.debug('createRestaurantCard', { id: cardData.id, name: cardData.name }); } catch (e) {}
  const card = document.createElement('article');
  card.className = 'result-card restaurant-card';
  card.dataset.placeId = cardData.id;

  const wrap = document.createElement('div'); wrap.className = 'card-media ratio-1x1';
  const img = document.createElement('img');
  img.dataset.src = cardData.logo;
  img.src = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.BASE_URL || '/') + 'images/restaurant-placeholder-1x1.svg' : '/images/restaurant-placeholder-1x1.svg';
  img.alt = cardData.name;
  // fallback to photo ref then placeholder - with a global failure limiter
  // to avoid repeated 429s when the Photo endpoint is rate-limiting us.
  if (typeof window !== 'undefined') {
    if (!window.__cardRendererPhotoRefState) window.__cardRendererPhotoRefState = { failures: 0, disabled: false };
  }
  img.onerror = () => {
    const state = (typeof window !== 'undefined' && window.__cardRendererPhotoRefState) ? window.__cardRendererPhotoRefState : { failures: 0, disabled: false };
    // if we haven't tried a photoRef for this image and photoRefs are available and not globally disabled
    if (!img.dataset.triedPhotoRef && place && place.photoRefs && place.photoRefs.length && googleKey && !state.disabled) {
      img.dataset.triedPhotoRef = '1';
      img.dataset.attemptedRef = '1';
      try { img.src = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(place.photoRefs[0])}&key=${googleKey}`; } catch (e) {}
      return;
    }
    // If this was an attempted photoRef that failed, count it
    if (img.dataset.attemptedRef === '1') {
      try { state.failures = (state.failures || 0) + 1; } catch (e) {}
      try { const ref = (place && place.photoRefs && place.photoRefs.length) ? place.photoRefs[0] : null; if (ref) incrementPhotoRefFailure(ref); } catch (e) {}
      const LIMIT = 3;
      if (state.failures >= LIMIT) {
        try { state.disabled = true; } catch (e) {}
        try { console.warn('cardRenderer: disabling photoRef retries after repeated failures'); } catch (e) {}
      }
    }
    const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL || '/' : '/';
    img.src = `${base}images/restaurant-placeholder-1x1.svg`;
    // schedule retry for restaurant images as well, but only if the per-photo failure limit isn't exceeded
    try {
      const ref = (place && place.photoRefs && place.photoRefs.length) ? place.photoRefs[0] : null;
      if (ref && !state.disabled && getPhotoRefFailures(ref) <= PER_PHOTO_FAILURE_LIMIT) schedulePhotoRefRetry(img, ref);
    } catch (e) {}
  };

  ensureImageObserver().observe(img);
  wrap.appendChild(img); card.appendChild(wrap);
  const body = document.createElement('div'); body.className = 'card-body';
  const h3 = document.createElement('h3'); h3.textContent = cardData.name; body.appendChild(h3);

  // add type tags (up to 3)
  const tags = document.createElement('div'); tags.className = 'card-tags';
  (cardData.types || []).slice(0,3).forEach(t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = humanizeTag(t); tags.appendChild(s); });
  body.appendChild(tags);

  // operational status
  const statusEl = document.createElement('div'); statusEl.className = 'card-status'; statusEl.textContent = cardData.status || 'Unknown'; body.appendChild(statusEl);

  const actions = document.createElement('div'); actions.className = 'card-actions';
  // Open in Google Maps link
  const mapLink = document.createElement('a');
  mapLink.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cardData.name)}&query_place_id=${encodeURIComponent(cardData.id)}`;
  mapLink.textContent = 'Open in Google Maps'; mapLink.target = '_blank';
  actions.appendChild(mapLink);
  // Create favorite button, prevent navigation if button is inside an interactive element;
  // ensure non-submitting behavior
  const favBtn = document.createElement('button'); favBtn.type = 'button'; favBtn.className = 'fav-button'; favBtn.textContent = isFavorite(cardData.id, 'restaurant') ? '★' : '☆';
  favBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    toggleFavorite(cardData.id, 'restaurant');
    favBtn.textContent = isFavorite(cardData.id, 'restaurant') ? '★' : '☆';
    if (typeof onFiltersReapply === 'function') onFiltersReapply();
  });
  actions.appendChild(favBtn);
  body.appendChild(actions);
  card.appendChild(body);

  card.addEventListener('click', () => {
    if (place.location && mapHelpers && typeof mapHelpers.setView === 'function' && typeof mapHelpers.highlightMarker === 'function') {
      mapHelpers.setView({ lat: place.location.lat, lng: place.location.lng, zoom: 14 });
      mapHelpers.highlightMarker(place.placeId, { bounce: true });
    }
  });

  return card;
}

export default { ensureImageObserver, createAttractionCard, createRestaurantCard };
