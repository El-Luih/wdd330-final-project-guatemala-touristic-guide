/**
 * destinations.js - Cleaned up version
 * Shows destination attractions with search, filters, and map
 */

import { loadHeaderFooter } from './util.mjs';
import PlacesAPI from './PlacesAPI.mjs';
import { createAttractionCard } from './cardRenderer.mjs';
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
  createShowMoreButton,
} from './pageHelpers.mjs';

// ============================================================================
// STATE
// ============================================================================

let currentResults = [];
let allResults = [];
let mapHelpers = null;

const PAGE_SIZE = 6;
const MAX_SHOW_MORE_CLICKS = 3;

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
  loadHeaderFooter();

  // Setup UI elements
  setupRegionSelect('#regions', (region) => navigateWithRegion(region));
  setupSearch('#searchbar', () => applyFilters());
  setupStatusFilters('status', () => applyFilters());

  // Initialize map
  mapHelpers = await initializeMap();

  // Get region from URL and apply conservative budget
  const incomingRegion = getRegionFromQuery() || 'All';
  setConservativeBudget(incomingRegion);

  // Load data for region
  await loadRegion(incomingRegion);
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadRegion(region = 'All') {
  try {
    allResults = await PlacesAPI.fetchAttractionsForRegion(region, 18);
    currentResults = [...allResults];
    renderResults();
  } catch (e) {
    console.error('Failed to fetch attractions:', e);
    allResults = [];
    currentResults = [];
    renderResults();
  }
}

// ============================================================================
// FILTERING
// ============================================================================

function applyFilters() {
  const filters = getCurrentFilters();
  currentResults = applyAllFilters(allResults, filters, 'destinations');
  currentResults = currentResults.slice(0, 18); // Global cap
  renderResults();
}

// ============================================================================
// RENDERING
// ============================================================================

function clearResults() {
  const container = document.querySelector('.destinations.container');
  if (container) container.innerHTML = '';
  if (mapHelpers) mapHelpers.clearMarkers();
}

function renderResults() {
  clearResults();
  const container = document.querySelector('.destinations.container');
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
  const card = createAttractionCard(place, { mapHelpers });
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
  const existing = document.querySelector('#show-more-results');
  if (existing) existing.remove();

  const btn = createShowMoreButton({
    id: 'show-more-results',
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
