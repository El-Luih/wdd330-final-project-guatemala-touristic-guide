import { loadHeaderFooter, debounce, isFavorite, toggleFavorite, loadFavorites } from './util.mjs';
import PlacesAPI from './PlacesAPI.mjs';
import GoogleMapsAPI from './GoogleMapsAPI.mjs';
import { createRestaurantCard, ensureImageObserver } from './cardRenderer.mjs';
import { REGION_VIEWS, DEFAULT_COUNTRY_VIEW } from './MapConfig.mjs';
import { addRegionToUrlString, getRegionFromQuery, applyRegionToUI } from './RegionState.mjs';

let allRestaurants = [];
let currentResults = [];
let mapHelpers = null;
const PAGE_SIZE = 6;
let currentPage = 0;
const MAX_SHOW_MORE_CLICKS = 3;
let showMoreClicks = 0;
// use shared ensureImageObserver and shared card renderer

async function initCuisine() {
	// runtime marker to help verify the served bundle is the updated one
	try {
		console.info('CUISINE PAGE: full-card renderer active', { tag: 'cuisine-v2' });
		// expose a simple flag so you can inspect window.__CUISINE_RENDERER in devtools
		window.__CUISINE_RENDERER = 'full-v2';
	} catch (e) {}
	loadHeaderFooter();
	// Reduce image load concurrency specifically for this page to avoid hitting the
	// Google Places photo endpoint too hard. We adjust the shared imageLoader at
	// runtime rather than changing the global default so other pages keep their
	// behavior.
	try {
		const mod = await import('./util.mjs');
		if (mod && mod.imageLoader) {
			// make this page very conservative
			mod.imageLoader.concurrency = 1;
			mod.imageLoader.baseDelay = 1000; // ms
			mod.imageLoader.maxRetries = 8;
		}
	} catch (e) {
		// non-fatal if import fails — we'll still attempt to render
		console.warn('Failed to adjust imageLoader for cuisine page', e);
	}
	// populate regions select
	const regionsSelect = document.querySelector('#regions');
	if (regionsSelect) {
		regionsSelect.innerHTML = '';
		const allOpt = document.createElement('option'); allOpt.value = 'All'; allOpt.textContent = 'All Regions';
		regionsSelect.appendChild(allOpt);
		Object.keys(REGION_VIEWS).forEach(r => {
			const o = document.createElement('option'); o.value = r; o.textContent = r; regionsSelect.appendChild(o);
		});
	}

	// try to load maps but don't block
	let mapsLoaded = true;
	try { await GoogleMapsAPI.load(); } catch (e) { console.warn('Maps load failed', e); mapsLoaded = false; }

	// Determine incoming region from the URL (if present) and apply to the UI
	let incomingRegion = 'All';
	try {
		const r = getRegionFromQuery();
		if (r) incomingRegion = r;
	} catch (e) {}
	try { applyRegionToUI(incomingRegion); } catch (e) {}

	// Cold-session mitigation: if a specific region is requested on first load,
	// set a conservative session budget to avoid bulk photo fetches in incognito.
	try {
		const BUDGET_KEY = '__photoRefSessionBudget_v1';
		if (incomingRegion && incomingRegion !== 'All' && !sessionStorage.getItem(BUDGET_KEY)) {
			sessionStorage.setItem(BUDGET_KEY, String(6));
		}
	} catch (e) {}

	// initial load: fetch region-scoped restaurants up to the page cap
	allRestaurants = await PlacesAPI.fetchRestaurantsForRegion(incomingRegion || 'All', 18);
	// If a region-specific fetch returns empty, try falling back to a global list
	if ((!allRestaurants || allRestaurants.length === 0) && incomingRegion && incomingRegion !== 'All') {
		console.debug('Cuisine: region fetch empty for', incomingRegion, ' — falling back to global fetch');
		const global = await PlacesAPI.fetchRestaurantsForRegion('All', 18);
		if (global && global.length) allRestaurants = global;
	}
	// diagnostic: log distribution by region
	try {
		const map = {};
		(allRestaurants || []).forEach(r => { const k = r.region || 'Unknown'; map[k] = (map[k] || 0) + 1; });
		console.debug('Cuisine: fetched restaurants count', (allRestaurants || []).length, 'by region', map);
	} catch (e) {}

	if (mapsLoaded) {
		try { initMap(); } catch (e) { console.warn('initMap failed', e); mapsLoaded = false; }
	}
	if (!mapsLoaded) {
		mapHelpers = { addMarker: () => null, removeMarker: () => null, clearMarkers: () => null, highlightMarker: () => null, setView: () => null };
	}

	setupSearchAndFilters();
	applyFilters();
}

function initMap() {
	const mapEl = document.querySelector('.map');
	mapHelpers = GoogleMapsAPI.initMap(mapEl, DEFAULT_COUNTRY_VIEW);
}

function setupSearchAndFilters() {
	const input = document.querySelector('#searchbar');
	if (input) input.addEventListener('input', debounce(() => applyFilters(), 250));
	document.querySelectorAll('input[name="status"]').forEach(r => r.addEventListener('change', () => applyFilters()));
	const regionsSelect = document.querySelector('#regions');
	if (regionsSelect) regionsSelect.addEventListener('change', () => {
		const region = regionsSelect.value || 'All';
		try { location.href = addRegionToUrlString(location.href, region); } catch (e) { loadRegion(region); }
	});
}

async function loadRegion(region = 'All') {
	try {
		currentResults = await PlacesAPI.fetchRestaurantsForRegion(region, 18);
	} catch (e) {
		console.warn('Failed to fetch region restaurants', e);
		currentResults = [];
	}
	renderRestaurants();
}

function applyFilters() {
	const q = document.querySelector('#searchbar')?.value?.toLowerCase()?.trim();
	const status = document.querySelector('input[name="status"]:checked')?.value || 'all';
	const region = document.querySelector('#regions')?.value || 'All';
	let list = [...allRestaurants];
	if (region && region !== 'All') list = list.filter(p => p.region === region);
	if (status && status !== 'all') {
	if (status === 'open') list = list.filter(p => (typeof p.isOpen === 'boolean') ? p.isOpen : (p.status || '').toLowerCase().includes('operational'));
		if (status === 'closed') list = list.filter(p => (p.status || '').toLowerCase().includes('closed'));
	}
	if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.types || []).some(t => t.toLowerCase().includes(q)));
	const fav = loadFavorites();
	list.sort((a,b)=> (fav.restaurants.includes(a.placeId)?0:1) - (fav.restaurants.includes(b.placeId)?0:1));
	// Build prioritized results with a global cap and a per-region minimum
	const GLOBAL_CAP = 18;
	const REGION_MIN = 10;
	const activeRegion = document.querySelector('#regions')?.value || 'All';
	let prioritized = [];
	if (activeRegion && activeRegion !== 'All') {
		const regionList = list.filter(p => p.region === activeRegion);
	const others = list.filter(p => p.region !== activeRegion);
		prioritized = regionList.slice(0, REGION_MIN);
		const remaining = GLOBAL_CAP - prioritized.length;
		prioritized = prioritized.concat(others.slice(0, remaining));
	} else {
		prioritized = list.slice(0, GLOBAL_CAP);
	}
	currentResults = prioritized.slice(0, GLOBAL_CAP);
	renderRestaurants();
}

function clearResults() {
	const container = document.querySelector('.restaurants.container');
	if (container) container.innerHTML = '';
	if (mapHelpers) mapHelpers.clearMarkers();
}

function renderRestaurants() {
	clearResults();
	const container = document.querySelector('.restaurants.container');
	if (!container) return;
	currentPage = 0;
	const pageItems = currentResults.slice(0, PAGE_SIZE);

	pageItems.forEach(p => {
		const card = createRestaurantCard(p, { mapHelpers });
		container.appendChild(card);
		// add marker
		if (p.location) {
			mapHelpers.addMarker(p.placeId, { lat: p.location.lat, lng: p.location.lng }, { title: p.name, onClick: () => {
				const el = container.querySelector(`[data-place-id='${p.placeId}']`);
				if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
				mapHelpers.highlightMarker(p.placeId, { bounce: true });
			}});
		}
	});

	// show more button for restaurants
	if (currentResults.length > PAGE_SIZE) {
		let btn = document.querySelector('#show-more-restaurants');
		if (!btn) {
			btn = document.createElement('button'); btn.id = 'show-more-restaurants'; btn.className = 'show-more'; btn.textContent = 'Show more';
			btn.addEventListener('click', () => {
				if (showMoreClicks >= MAX_SHOW_MORE_CLICKS) {
					btn.disabled = true;
					btn.textContent = 'Show more (limit reached)';
					return;
				}
				showMoreClicks++;
				currentPage++;
				const s = currentPage * PAGE_SIZE; const e = Math.min(currentResults.length, (currentPage + 1) * PAGE_SIZE);
				const next = currentResults.slice(s, e);
				next.forEach(p => {
					const card = createRestaurantCard(p, { mapHelpers });
					container.appendChild(card);
					if (p.location) {
						mapHelpers.addMarker(p.placeId, { lat: p.location.lat, lng: p.location.lng }, { title: p.name, onClick: () => {
							const el = container.querySelector(`[data-place-id='${p.placeId}']`);
							if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
							mapHelpers.highlightMarker(p.placeId, { bounce: true });
						}});
					}
				});
				if ((currentPage + 1) * PAGE_SIZE >= currentResults.length) btn.remove();
				else if (showMoreClicks >= MAX_SHOW_MORE_CLICKS) {
					btn.disabled = true;
					btn.textContent = 'Show more (limit reached)';
				}
			});
			container.parentElement.appendChild(btn);
		}
	}

	// center map based on region or country view
	if (!currentResults || currentResults.length === 0) mapHelpers.setView(DEFAULT_COUNTRY_VIEW);
	else if (currentResults.length === 1) { const p = currentResults[0]; if (p.location) mapHelpers.setView({ lat: p.location.lat, lng: p.location.lng, zoom: 14 }); }
	else { const sel = document.querySelector('#regions'); const active = sel ? sel.value : 'All'; if (active && active !== 'All') mapHelpers.setView(active); else mapHelpers.setView(DEFAULT_COUNTRY_VIEW); }
}

document.addEventListener('DOMContentLoaded', initCuisine);
