/**
 * cuisine.js - Cleaned up version
 * Shows restaurants with search, filters, and map
 */

import { loadHeaderFooter } from './util.mjs';
import PlacesAPI from './PlacesAPI.mjs';
import { createRestaurantCard } from './cardRenderer.mjs';
import { getRegionFromQuery } from './RegionState.mjs';
import {
  initializeMap,
  setupRegionSelect,
  navigateWithRegion,
  setupSearch,
  setupStatusFilters,
  getCurrentFilters,
  applyAllFilters,
  centerMapOnResults,
  setConservativeBudget,
  setPhotoAutoLimit,
  createShowMoreButton,
} from './pageHelpers.mjs';

// ============================================================================
// STATE
// ============================================================================

let allRestaurants = [];
let currentResults = [];
let mapHelpers = null;
let initialFetchRegion = 'All';

const PAGE_SIZE = 6;
const MAX_SHOW_MORE_CLICKS = 3;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
  console.info('CUISINE PAGE: full-card renderer active', {
    tag: 'cuisine-v2',
  });
  window.__CUISINE_RENDERER = 'full-v2';

  loadHeaderFooter();

  // Reduce image load concurrency for this page
  try {
    const mod = await import('./util.mjs');
    if (mod?.imageLoader) {
      mod.imageLoader.concurrency = 1;
      mod.imageLoader.baseDelay = 1000;
      mod.imageLoader.maxRetries = 8;
    }
  } catch (e) {
    console.warn('Failed to adjust imageLoader for cuisine page:', e);
  }

  // Setup UI elements
  setupRegionSelect('#regions', (region) => navigateWithRegion(region));
  setupSearch('#searchbar', () => applyFilters());
  setupStatusFilters('status', () => applyFilters());

  // Initialize map
  mapHelpers = await initializeMap();

  // Get region from URL and apply conservative budgets
  const incomingRegion = getRegionFromQuery() || 'All';
  setConservativeBudget(incomingRegion);
  setPhotoAutoLimit(3); // Extra conservative for cuisine page

  // Load data for region
  initialFetchRegion = incomingRegion;
  await loadRegion(incomingRegion);

  applyFilters();
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadRegion(region = 'All') {
  try {
    allRestaurants = await PlacesAPI.fetchRestaurantsForRegion(region, 18);

    // Fallback to global if region-specific is empty
    if ((!allRestaurants || allRestaurants.length === 0) && region !== 'All') {
      console.debug(
        'Cuisine: region fetch empty for',
        region,
        '— falling back to global',
      );
      const global = await PlacesAPI.fetchRestaurantsForRegion('All', 18);
      if (global?.length) allRestaurants = global;
    }

    // Log distribution for debugging
    logDistribution();
  } catch (e) {
    console.error('Failed to fetch restaurants:', e);
    allRestaurants = [];
  }
}

function logDistribution() {
  try {
    const map = {};
    (allRestaurants || []).forEach((r) => {
      const k = r.region || 'Unknown';
      map[k] = (map[k] || 0) + 1;
    });
    console.debug(
      'Cuisine: fetched restaurants count',
      allRestaurants.length,
      'by region',
      map,
    );
  } catch (e) {
    // Ignore errors in logging
  }
}

// ============================================================================
// FILTERING
// ============================================================================

function applyFilters() {
  const filters = getCurrentFilters();

  let filtered = [...allRestaurants];

  // Only apply region filter if different from initial fetch
  if (filters.region !== 'All' && filters.region !== initialFetchRegion) {
    filtered = filtered.filter((p) => p.region === filters.region);
  }

  // Apply other filters
  filtered = applyAllFilters(
    filtered,
    { ...filters, region: 'All' },
    'restaurants',
  );

  // Prioritize region results
  const GLOBAL_CAP = 18;
  const REGION_MIN = 10;

  if (filters.region && filters.region !== 'All') {
    const regionList = filtered.filter((p) => p.region === filters.region);
    const others = filtered.filter((p) => p.region !== filters.region);
    filtered = [
      ...regionList.slice(0, REGION_MIN),
      ...others.slice(0, GLOBAL_CAP - Math.min(regionList.length, REGION_MIN)),
    ];
  }

  currentResults = filtered.slice(0, GLOBAL_CAP);
  renderResults();
}

// ============================================================================
// RENDERING
// ============================================================================

function clearResults() {
  const container = document.querySelector('.restaurants.container');
  if (container) container.innerHTML = '';
  if (mapHelpers) mapHelpers.clearMarkers();
}

function renderResults() {
  clearResults();
  const container = document.querySelector('.restaurants.container');
  if (!container) return;

  // Render first page
  const pageItems = currentResults.slice(0, PAGE_SIZE);
  pageItems.forEach((place) => renderPlace(place, container));

  // Add show more button if needed
  if (currentResults.length > PAGE_SIZE) {
    addShowMoreButton(container);
  }

  // Center map
  const filters = getCurrentFilters();
  centerMapOnResults(mapHelpers, currentResults, filters.region);
}

function renderPlace(place, container) {
  const card = createRestaurantCard(place, { mapHelpers });
  container.appendChild(card);

  // Add map marker
  if (place.location) {
    mapHelpers.addMarker(
      place.placeId,
      { lat: place.location.lat, lng: place.location.lng },
      {
        title: place.name,
        onClick: () => scrollToCard(place.placeId, container),
      },
    );
  }
}

function scrollToCard(placeId, container) {
  const card = container.querySelector(`[data-place-id='${placeId}']`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    mapHelpers.highlightMarker(placeId, { bounce: true });
  }
}

function addShowMoreButton(container) {
  // Remove existing button if any
  const existing = document.querySelector('#show-more-restaurants');
  if (existing) existing.remove();

  const btn = createShowMoreButton({
    id: 'show-more-restaurants',
    pageSize: PAGE_SIZE,
    maxClicks: MAX_SHOW_MORE_CLICKS,
    onShowMore: (start, end) => {
      const nextItems = currentResults.slice(
        start,
        Math.min(end, currentResults.length),
      );
      nextItems.forEach((place) => renderPlace(place, container));

      if (end >= currentResults.length) {
        btn.remove();
      }
    },
  });

  container.parentElement.appendChild(btn);
}

// ============================================================================
// STARTUP
// ============================================================================

document.addEventListener('DOMContentLoaded', init);
