import { loadHeaderFooter, debounce, loadFavorites } from './util.mjs';
import PlacesAPI from './PlacesAPI.mjs';
import GoogleMapsAPI from './GoogleMapsAPI.mjs';
import { createAttractionCard } from './cardRenderer.mjs';
import { REGION_VIEWS, DEFAULT_COUNTRY_VIEW } from './MapConfig.mjs';
import {
  getRegionFromQuery,
  applyRegionToUI,
  addRegionToUrlString,
} from './RegionState.mjs';

// Destinations page wiring
// - loads header/footer
// - fetches attractions via PlacesAPI (cached)
// - populates region filter buttons
// - supports search and status filtering
// - initializes map and renders markers
// - favorites are read from localStorage and ensured included in the cached array

let currentResults = [];
let mapHelpers = null;
const PAGE_SIZE = 6;
let currentPage = 0;
// Limit how many times the user can click "Show more" in a single session to avoid
// triggering large bursts of photo_ref requests which can cause 429s.
const MAX_SHOW_MORE_CLICKS = 3;
let showMoreClicks = 0;
// Image lazy-loading observer (reduce concurrent requests to avoid 429)
// Use shared cardRenderer.ensureImageObserver via createAttractionCard; local observer removed

const regions = Object.keys(REGION_VIEWS);

async function init() {
  loadHeaderFooter();
  // Populate UI early (don't block on Maps loading)
  // populate regions select if present (some pages use select rather than buttons)
  const regionsSelect = document.querySelector('#regions');
  if (regionsSelect) {
    regionsSelect.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'All';
    allOpt.textContent = 'All Regions';
    regionsSelect.appendChild(allOpt);
    Object.keys(REGION_VIEWS).forEach((r) => {
      const o = document.createElement('option');
      o.value = r;
      o.textContent = r;
      regionsSelect.appendChild(o);
    });
    regionsSelect.addEventListener('change', () =>
      selectRegion(regionsSelect.value),
    );
  }

  setupFilters();
  setupSearch();

  // Try to load Maps, but don't block UI initialization if it fails
  let mapsLoaded = true;
  try {
    await GoogleMapsAPI.load();
  } catch (e) {
    console.warn('GoogleMapsAPI failed to load, continuing without map', e);
    mapsLoaded = false;
  }

  // No global fetch here: we load only the region-scoped results via loadRegion()

  if (mapsLoaded) {
    try {
      initMap();
    } catch (e) {
      console.warn('initMap failed, creating fallback mapHelpers', e);
      mapsLoaded = false;
    }
  }

  if (!mapsLoaded) {
    // create a no-op mapHelpers so other code doesn't fail
    mapHelpers = {
      addMarker: () => null,
      removeMarker: () => null,
      clearMarkers: () => null,
      highlightMarker: () => null,
      setView: () => null,
    };
  }

  // If a region was passed via the query string, apply it and fetch region-specific results
  const incomingRegion = getRegionFromQuery();
  // Cold-session mitigation: if this is a fresh session and a specific region
  // was requested (not 'All'), reduce the photoRef session budget so we don't
  // immediately try to fetch many photo blobs and trigger 429s from the CDN.
  try {
    const BUDGET_KEY = '__photoRefSessionBudget_v1';
    if (
      incomingRegion &&
      incomingRegion !== 'All' &&
      !sessionStorage.getItem(BUDGET_KEY)
    ) {
      // conservative budget for region-only loads (adjustable)
      sessionStorage.setItem(BUDGET_KEY, String(6));
    }
  } catch (e) {
    /* Ignore error */
  }
  if (incomingRegion) {
    applyRegionToUI(incomingRegion);
    await loadRegion(incomingRegion);
  } else {
    await loadRegion('All');
  }
}

async function loadRegion(region = 'All') {
  // fetch region-scoped results (max 18) from PlacesAPI and render
  try {
    currentResults = await PlacesAPI.fetchAttractionsForRegion(region, 18);
  } catch (e) {
    console.warn('Failed to fetch region attractions', e);
    currentResults = [];
  }
  renderResults();
}

function setupFilters() {
  const filterContainer = document.querySelector('.filtering-buttons');
  // Some pages (like this one) use a <select id="regions"> instead of button filters.
  // If no button container is present, skip building button UI.
  if (!filterContainer) return;
  filterContainer.innerHTML = '';
  // 'All' button first
  const allBtn = document.createElement('button');
  allBtn.className = 'filter-button active';
  allBtn.textContent = 'All';
  allBtn.dataset.region = 'All';
  filterContainer.appendChild(allBtn);
  allBtn.addEventListener('click', () => {
    selectRegion('All');
  });

  regions.forEach((r) => {
    const b = document.createElement('button');
    b.className = 'filter-button';
    b.textContent = r;
    b.dataset.region = r;
    b.addEventListener('click', () => selectRegion(r));
    filterContainer.appendChild(b);
  });
}

function selectRegion(region) {
  // Navigate to the same page but include the region as a query parameter so the
  // page reload will only fetch results for that region (reduces concurrent loads).
  try {
    const newUrl = addRegionToUrlString(location.href, region);
    location.href = newUrl;
  } catch (e) {
    // fallback to in-page behavior if navigation fails
    document
      .querySelectorAll('.filter-button')
      .forEach((b) =>
        b.classList.toggle('active', b.dataset.region === region),
      );
    loadRegion(region);
  }
}

function setupSearch() {
  const input = document.querySelector('#searchbar');
  if (input) {
    input.addEventListener(
      'input',
      debounce(() => applyFilters(), 300),
    );
  }
  // status radio buttons
  document.querySelectorAll('input[name="status"]').forEach((r) =>
    r.addEventListener('change', () => {
      applyFilters();
    }),
  );
}

function initMap() {
  const mapEl = document.querySelector('.map');
  mapHelpers = GoogleMapsAPI.initMap(mapEl, DEFAULT_COUNTRY_VIEW);
}

function applyFilters() {
  const q = document.querySelector('#searchbar')?.value?.toLowerCase()?.trim();
  // Get current region from select dropdown
  const regionSelect = document.querySelector('#regions');
  const region = regionSelect ? regionSelect.value : 'All';
  // Get current status from radio buttons
  const statusRadio = document.querySelector('input[name="status"]:checked');
  const status = statusRadio ? statusRadio.value : 'all';

  // operate on the region-scoped currentResults which were fetched on page load
  let list = [...currentResults];
  if (region && region !== 'All')
    list = list.filter((p) => p.region === region);
  // status filter
  if (status && status !== 'all') {
    if (status === 'open')
      list = list.filter((p) =>
        typeof p.isOpen === 'boolean'
          ? p.isOpen
          : (p.status || '').toLowerCase().includes('operational'),
      );
    if (status === 'closed')
      list = list.filter((p) =>
        typeof p.isOpen === 'boolean'
          ? !p.isOpen
          : (p.status || '').toLowerCase().includes('closed'),
      );
  }
  if (q)
    list = list.filter(
      (p) =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.types || []).some((t) => t.toLowerCase().includes(q)),
    );
  // favorites first
  const fav = loadFavorites();
  list.sort((a, b) => {
    const aFav = fav.destinations.includes(a.placeId) ? 0 : 1;
    const bFav = fav.destinations.includes(b.placeId) ? 0 : 1;
    return aFav - bFav;
  });
  // Ensure we don't exceed the currentResults length; they were already
  // fetched region-scoped and limited to 18 by the server-side call.
  const GLOBAL_CAP = 18;
  let prioritized = list.slice(0, GLOBAL_CAP);
  // Don't overwrite currentResults - use a filtered copy for rendering
  renderFilteredResults(prioritized);
}

function clearResults() {
  const container = document.querySelector('.destinations.container');
  if (container) container.innerHTML = '';
}

function renderFilteredResults(filteredList) {
  clearResults();
  const container = document.querySelector('.destinations.container');
  mapHelpers.clearMarkers();
  const start = 0;
  currentPage = 0;
  const end = Math.min(filteredList.length, PAGE_SIZE);
  const pageItems = filteredList.slice(start, end);

  // render the first page using the shared card creator
  pageItems.forEach((p) => {
    const card = createAttractionCard(p, { mapHelpers });
    container.appendChild(card);
    // Add marker to map
    if (p.location) {
      mapHelpers.addMarker(
        p.placeId,
        { lat: p.location.lat, lng: p.location.lng },
        {
          title: p.name,
          onClick: () => {
            // clicking marker should focus the card (scroll into view)
            const el = container.querySelector(
              `[data-place-id='${p.placeId}']`,
            );
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            mapHelpers.highlightMarker(p.placeId, { bounce: true });
          },
        },
      );
    }
  });

  // Note: Simplified for filtered results - no show more button for now
  // Show more would need to work with the filtered list

  // Center map to show current results
  if (filteredList.length === 0) {
    mapHelpers.setView(DEFAULT_COUNTRY_VIEW);
  } else if (filteredList.length === 1) {
    const p = filteredList[0];
    if (p.location)
      mapHelpers.setView({
        lat: p.location.lat,
        lng: p.location.lng,
        zoom: 14,
      });
  } else {
    // center on selected region or country view
    const regionSelect = document.querySelector('#regions');
    const activeRegion = regionSelect ? regionSelect.value : 'All';
    if (activeRegion && activeRegion !== 'All')
      mapHelpers.setView(activeRegion);
    else mapHelpers.setView(DEFAULT_COUNTRY_VIEW);
  }
}

function renderResults() {
  clearResults();
  const container = document.querySelector('.destinations.container');
  mapHelpers.clearMarkers();
  const start = 0;
  currentPage = 0;
  const end = Math.min(currentResults.length, PAGE_SIZE);
  const pageItems = currentResults.slice(start, end);
  // use shared createAttractionCard from cardRenderer

  // render the first page using the shared card creator
  pageItems.forEach((p) => {
    const card = createAttractionCard(p, { mapHelpers });
    container.appendChild(card);
    // Add marker to map
    if (p.location) {
      mapHelpers.addMarker(
        p.placeId,
        { lat: p.location.lat, lng: p.location.lng },
        {
          title: p.name,
          onClick: () => {
            // clicking marker should focus the card (scroll into view)
            const el = container.querySelector(
              `[data-place-id='${p.placeId}']`,
            );
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            mapHelpers.highlightMarker(p.placeId, { bounce: true });
          },
        },
      );
    }
  });

  // show more button
  if (currentResults.length > PAGE_SIZE) {
    let btn = document.querySelector('#show-more-results');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'show-more-results';
      btn.className = 'show-more';
      btn.textContent = 'Show more';
      btn.addEventListener('click', () => {
        // enforce click limit
        if (showMoreClicks >= MAX_SHOW_MORE_CLICKS) {
          btn.disabled = true;
          btn.textContent = 'Show more (limit reached)';
          return;
        }
        showMoreClicks++;
        currentPage++;
        const s = currentPage * PAGE_SIZE;
        const e = Math.min(
          currentResults.length,
          (currentPage + 1) * PAGE_SIZE,
        );
        const nextItems = currentResults.slice(s, e);
        nextItems.forEach((p) => {
          const card = createAttractionCard(p, { mapHelpers });
          container.appendChild(card);
          // Add marker to map for appended items as well
          if (p.location) {
            mapHelpers.addMarker(
              p.placeId,
              { lat: p.location.lat, lng: p.location.lng },
              {
                title: p.name,
                onClick: () => {
                  const el = container.querySelector(
                    `[data-place-id='${p.placeId}']`,
                  );
                  if (el)
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  mapHelpers.highlightMarker(p.placeId, { bounce: true });
                },
              },
            );
          }
        });
        if ((currentPage + 1) * PAGE_SIZE >= currentResults.length) {
          btn.remove();
        } else if (showMoreClicks >= MAX_SHOW_MORE_CLICKS) {
          btn.disabled = true;
          btn.textContent = 'Show more (limit reached)';
        }
      });
      container.parentElement.appendChild(btn);
    }
  }

  // Center map to show current results
  if (currentResults.length === 0) {
    mapHelpers.setView(DEFAULT_COUNTRY_VIEW);
  } else if (currentResults.length === 1) {
    const p = currentResults[0];
    if (p.location)
      mapHelpers.setView({
        lat: p.location.lat,
        lng: p.location.lng,
        zoom: 14,
      });
  } else {
    // center on selected region or country view
    const activeRegion = document.querySelector('.filter-button.active')
      ?.dataset.region;
    if (activeRegion && activeRegion !== 'All')
      mapHelpers.setView(activeRegion);
    else mapHelpers.setView(DEFAULT_COUNTRY_VIEW);
  }
}

document.addEventListener('DOMContentLoaded', init);
