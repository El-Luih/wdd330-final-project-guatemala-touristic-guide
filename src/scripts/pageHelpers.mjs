/**
 * pageHelpers.mjs
 * Shared utilities for page initialization, filters, and map handling
 */

import { REGION_VIEWS, DEFAULT_COUNTRY_VIEW } from './MapConfig.mjs';
import { addRegionToUrlString, getRegionFromQuery, applyRegionToUI } from './RegionState.mjs';
import { debounce, loadFavorites } from './util.mjs';
import GoogleMapsAPI from './GoogleMapsAPI.mjs';

// ============================================================================
// MAP INITIALIZATION
// ============================================================================

/**
 * Initialize Google Maps with fallback to no-op helpers
 * @param {string} selector - CSS selector for map container
 * @returns {Object} mapHelpers - Map control methods
 */
export async function initializeMap(selector = '.map') {
	try {
		await GoogleMapsAPI.load();
		const mapEl = document.querySelector(selector);
		if (!mapEl) throw new Error('Map container not found');
		return GoogleMapsAPI.initMap(mapEl, DEFAULT_COUNTRY_VIEW);
	} catch (e) {
		console.warn('Map initialization failed, using fallback', e);
		return createNoOpMapHelpers();
	}
}

/**
 * Create no-op map helpers for when maps fail to load
 */
export function createNoOpMapHelpers() {
	return {
		addMarker: () => null,
		removeMarker: () => null,
		clearMarkers: () => null,
		highlightMarker: () => null,
		setView: () => null,
	};
}

// ============================================================================
// REGION FILTER UI
// ============================================================================

/**
 * Setup region filter buttons
 * @param {string} containerSelector - CSS selector for button container
 * @param {Function} onSelectRegion - Callback when region is selected
 */
export function setupRegionButtons(containerSelector, onSelectRegion) {
	const container = document.querySelector(containerSelector);
	if (!container) return;

	container.innerHTML = '';

	// "All" button
	const allBtn = document.createElement('button');
	allBtn.className = 'filter-button active';
	allBtn.textContent = 'All';
	allBtn.dataset.region = 'All';
	allBtn.addEventListener('click', () => onSelectRegion('All'));
	container.appendChild(allBtn);

	// Region buttons
	Object.keys(REGION_VIEWS).forEach(region => {
		const btn = document.createElement('button');
		btn.className = 'filter-button';
		btn.textContent = region;
		btn.dataset.region = region;
		btn.addEventListener('click', () => onSelectRegion(region));
		container.appendChild(btn);
	});
}

/**
 * Setup region select dropdown
 * @param {string} selectSelector - CSS selector for select element
 * @param {Function} onSelectRegion - Callback when region is selected
 */
export function setupRegionSelect(selectSelector, onSelectRegion) {
	const select = document.querySelector(selectSelector);
	if (!select) return;

	select.innerHTML = '';

	// "All" option
	const allOpt = document.createElement('option');
	allOpt.value = 'All';
	allOpt.textContent = 'All Regions';
	select.appendChild(allOpt);

	// Region options
	Object.keys(REGION_VIEWS).forEach(region => {
		const opt = document.createElement('option');
		opt.value = region;
		opt.textContent = region;
		select.appendChild(opt);
	});

	select.addEventListener('change', () => onSelectRegion(select.value));
}

/**
 * Navigate to current page with region parameter
 * @param {string} region - Region to navigate to
 */
export function navigateWithRegion(region) {
	try {
		const newUrl = addRegionToUrlString(location.href, region);
		location.href = newUrl;
	} catch (e) {
		console.error('Failed to navigate with region:', e);
	}
}

/**
 * Mark the current region as active in the UI
 * @param {string} region - Current region
 * @param {string} selector - CSS selector for buttons or select
 */
export function markActiveRegion(region, selector = '.filter-button') {
	const elements = document.querySelectorAll(selector);
	elements.forEach(el => {
		if (el.tagName === 'BUTTON') {
			el.classList.toggle('active', el.dataset.region === region);
		} else if (el.tagName === 'SELECT') {
			el.value = region;
		}
	});
}

// ============================================================================
// SEARCH AND FILTERS
// ============================================================================

/**
 * Setup search input with debouncing
 * @param {string} inputSelector - CSS selector for search input
 * @param {Function} onSearch - Callback when search changes
 * @param {number} delay - Debounce delay in ms
 */
export function setupSearch(inputSelector, onSearch, delay = 300) {
	const input = document.querySelector(inputSelector);
	if (!input) return;

	input.addEventListener('input', debounce(() => {
		const query = input.value.toLowerCase().trim();
		onSearch(query);
	}, delay));
}

/**
 * Setup status radio filters
 * @param {string} radioName - Name attribute of radio inputs
 * @param {Function} onStatusChange - Callback when status changes
 */
export function setupStatusFilters(radioName, onStatusChange) {
	const radios = document.querySelectorAll(`input[name="${radioName}"]`);
	radios.forEach(radio => {
		radio.addEventListener('change', () => {
			const status = document.querySelector(`input[name="${radioName}"]:checked`)?.value || 'all';
			onStatusChange(status);
		});
	});
}

/**
 * Get current filter values from UI
 * @returns {Object} Current filter state
 */
export function getCurrentFilters() {
	const searchInput = document.querySelector('#searchbar');
	const statusRadio = document.querySelector('input[name="status"]:checked');
	const regionSelect = document.querySelector('#regions');

	return {
		query: searchInput?.value?.toLowerCase()?.trim() || '',
		status: statusRadio?.value || 'all',
		region: regionSelect?.value || 'All',
	};
}

// ============================================================================
// FILTERING LOGIC
// ============================================================================

/**
 * Filter places by search query
 * @param {Array} places - Array of place objects
 * @param {string} query - Search query
 * @returns {Array} Filtered places
 */
export function filterBySearch(places, query) {
	if (!query) return places;
	return places.filter(p => 
		(p.name || '').toLowerCase().includes(query) ||
		(p.types || []).some(t => t.toLowerCase().includes(query))
	);
}

/**
 * Filter places by region
 * @param {Array} places - Array of place objects
 * @param {string} region - Region filter ('All' or specific region)
 * @returns {Array} Filtered places
 */
export function filterByRegion(places, region) {
	if (!region || region === 'All') return places;
	return places.filter(p => p.region === region);
}

/**
 * Filter places by status (open/closed)
 * @param {Array} places - Array of place objects
 * @param {string} status - Status filter ('all', 'open', 'closed')
 * @returns {Array} Filtered places
 */
export function filterByStatus(places, status) {
	if (!status || status === 'all') return places;
	
	return places.filter(p => {
		if (status === 'open') {
			return typeof p.isOpen === 'boolean' 
				? p.isOpen 
				: (p.status || '').toLowerCase().includes('operational');
		}
		if (status === 'closed') {
			return typeof p.isOpen === 'boolean' 
				? !p.isOpen 
				: (p.status || '').toLowerCase().includes('closed');
		}
		return true;
	});
}

/**
 * Sort places with favorites first
 * @param {Array} places - Array of place objects
 * @param {string} type - Type of place ('destinations' or 'restaurants')
 * @returns {Array} Sorted places
 */
export function sortWithFavoritesFirst(places, type) {
	const favorites = loadFavorites();
	const favIds = favorites[type] || [];
	
	return [...places].sort((a, b) => {
		const aFav = favIds.includes(a.placeId) ? 0 : 1;
		const bFav = favIds.includes(b.placeId) ? 0 : 1;
		return aFav - bFav;
	});
}

/**
 * Apply all filters to a list of places
 * @param {Array} places - Array of place objects
 * @param {Object} filters - Filter configuration
 * @param {string} filters.query - Search query
 * @param {string} filters.status - Status filter
 * @param {string} filters.region - Region filter
 * @param {string} type - Type of place for favorites sorting
 * @returns {Array} Filtered and sorted places
 */
export function applyAllFilters(places, filters, type) {
	let filtered = [...places];
	
	filtered = filterByRegion(filtered, filters.region);
	filtered = filterByStatus(filtered, filters.status);
	filtered = filterBySearch(filtered, filters.query);
	filtered = sortWithFavoritesFirst(filtered, type);
	
	return filtered;
}

// ============================================================================
// MAP CENTERING
// ============================================================================

/**
 * Center map based on results
 * @param {Object} mapHelpers - Map control methods
 * @param {Array} results - Current results
 * @param {string} activeRegion - Active region filter
 */
export function centerMapOnResults(mapHelpers, results, activeRegion) {
	if (!results || results.length === 0) {
		mapHelpers.setView(DEFAULT_COUNTRY_VIEW);
	} else if (results.length === 1) {
		const place = results[0];
		if (place.location) {
			mapHelpers.setView({
				lat: place.location.lat,
				lng: place.location.lng,
				zoom: 14
			});
		}
	} else {
		if (activeRegion && activeRegion !== 'All') {
			mapHelpers.setView(activeRegion);
		} else {
			mapHelpers.setView(DEFAULT_COUNTRY_VIEW);
		}
	}
}

// ============================================================================
// SESSION BUDGET HELPERS
// ============================================================================

/**
 * Set conservative photo budget for region-specific loads
 * @param {string} region - Selected region
 */
export function setConservativeBudget(region) {
	if (!region || region === 'All') return;
	
	try {
		const BUDGET_KEY = '__photoRefSessionBudget_v1';
		if (!sessionStorage.getItem(BUDGET_KEY)) {
			sessionStorage.setItem(BUDGET_KEY, String(6));
		}
	} catch (e) {
		console.warn('Failed to set photo budget:', e);
	}
}

/**
 * Set auto-load limit for photos
 * @param {number} limit - Number of images to auto-load
 */
export function setPhotoAutoLimit(limit) {
	try {
		sessionStorage.setItem('__photoRefAutoLimit_v1', String(limit));
		sessionStorage.setItem('__photoRefAutoUsed_v1', String(0));
	} catch (e) {
		console.warn('Failed to set photo auto-limit:', e);
	}
}

// ============================================================================
// PAGINATION HELPERS
// ============================================================================

/**
 * Create a "Show More" button with click limit
 * @param {Object} config - Button configuration
 * @param {string} config.id - Button ID
 * @param {number} config.pageSize - Items per page
 * @param {number} config.maxClicks - Maximum clicks allowed
 * @param {Function} config.onShowMore - Callback with (start, end) indices
 * @returns {HTMLButtonElement} The show more button
 */
export function createShowMoreButton(config) {
	const { id, pageSize, maxClicks, onShowMore } = config;
	let currentPage = 0;
	let clickCount = 0;

	const btn = document.createElement('button');
	btn.id = id;
	btn.className = 'show-more';
	btn.textContent = 'Show more';

	btn.addEventListener('click', () => {
		if (clickCount >= maxClicks) {
			btn.disabled = true;
			btn.textContent = 'Show more (limit reached)';
			return;
		}

		clickCount++;
		currentPage++;
		const start = currentPage * pageSize;
		const end = (currentPage + 1) * pageSize;
		
		onShowMore(start, end);

		if (clickCount >= maxClicks) {
			btn.disabled = true;
			btn.textContent = 'Show more (limit reached)';
		}
	});

	return btn;
}
