import { loadHeaderFooter, loadFavorites, isFavorite, toggleFavorite, googleKey } from './util.mjs';
import { addRegionToUrlString } from './RegionState.mjs';
import PlacesAPI from './PlacesAPI.mjs';
import { createAttractionCard, createRestaurantCard, ensureImageObserver } from './cardRenderer.mjs';

let favDestinations = [];
let favRestaurants = [];
const PAGE_SIZE = 6;
let favPage = 0;
// use shared ensureImageObserver from cardRenderer

async function loadFavoriteDetails() {
	const fav = loadFavorites();
	const allAttractions = PlacesAPI._internal && PlacesAPI._internal.attractions ? PlacesAPI._internal.attractions : [];
	const allRestaurants = PlacesAPI._internal && PlacesAPI._internal.restaurants ? PlacesAPI._internal.restaurants : [];

	// Helper to find in-cache or ask API
	async function resolvePlace(id) {
		let found = allAttractions.find(x => x.placeId === id) || allRestaurants.find(x => x.placeId === id);
		if (found) return found;
		try {
			found = await PlacesAPI.getPlaceById(id);
			return found;
		} catch (e) {
			console.warn('Failed to fetch favorite detail', id, e);
			return null;
		}
	}

	const dests = [];
	for (const id of fav.destinations) {
		const d = await resolvePlace(id);
		// include favorites even if they lack photos so users can see their saved items;
		// image placeholders will be used by the renderer when needed
		if (d) dests.push(d);
	}
	favDestinations = dests;

	const rests = [];
	for (const id of fav.restaurants) {
		const r = await resolvePlace(id);
		if (r) rests.push(r);
	}
	favRestaurants = rests;
}

function populateRegionSelect() {
	const sel = document.querySelector('#regions');
	if (!sel) return;
	sel.innerHTML = '';
	const allOpt = document.createElement('option'); allOpt.value = 'All'; allOpt.textContent = 'All Regions'; sel.appendChild(allOpt);
	const regions = Object.keys(PlacesAPI.groupByRegion([...favDestinations, ...favRestaurants]));
	regions.forEach(r => {
		const o = document.createElement('option'); o.value = r; o.textContent = r; sel.appendChild(o);
	});
}

function renderFavorites() {
	const destContainer = document.querySelector('.destinations-module .container');
	const restContainer = document.querySelector('.restaurants-module .container');
	const noFavMsg = document.querySelector('.no-favorites-message');
	// remove any existing message
	if (noFavMsg) noFavMsg.remove();
	if (destContainer) {
		destContainer.innerHTML = '';
		favPage = 0;
		if (!favDestinations || favDestinations.length === 0) {
			const m = document.createElement('div'); m.className = 'no-favorites-message'; m.textContent = 'No favorites saved';
			destContainer.appendChild(m);
		} else {
			const pageItems = favDestinations.slice(0, PAGE_SIZE);
			pageItems.forEach(p => {
				const card = createAttractionCard(p, { onFiltersReapply: renderFavorites });
				destContainer.appendChild(card);
			});
		}
		if (favDestinations.length > PAGE_SIZE) {
			let btn = document.querySelector('#show-more-fav-dest');
			if (!btn) {
				btn = document.createElement('button'); btn.id = 'show-more-fav-dest'; btn.className = 'show-more'; btn.textContent = 'Show more';
				btn.addEventListener('click', () => {
					favPage++;
					const s = favPage * PAGE_SIZE; const e = Math.min(favDestinations.length, (favPage + 1) * PAGE_SIZE);
					const next = favDestinations.slice(s, e);
					next.forEach(p => {
						const card = createAttractionCard(p, { onFiltersReapply: renderFavorites });
						destContainer.appendChild(card);
					});
					if ((favPage + 1) * PAGE_SIZE >= favDestinations.length) btn.remove();
				});
				destContainer.parentElement.appendChild(btn);
			}
		}
	}
	if (restContainer) {
		restContainer.innerHTML = '';
		favPage = 0;
		if (!favRestaurants || favRestaurants.length === 0) {
			const m = document.createElement('div'); m.className = 'no-favorites-message'; m.textContent = 'No favorites saved';
			restContainer.appendChild(m);
		} else {
			const pageItems = favRestaurants.slice(0, PAGE_SIZE);
			pageItems.forEach(p => {
				const card = createRestaurantCard(p, { onFiltersReapply: renderFavorites });
				restContainer.appendChild(card);
			});
		}
		if (favRestaurants.length > PAGE_SIZE) {
			let btn = document.querySelector('#show-more-fav-rest');
			if (!btn) {
				btn = document.createElement('button'); btn.id = 'show-more-fav-rest'; btn.className = 'show-more'; btn.textContent = 'Show more';
				btn.addEventListener('click', () => {
					favPage++;
					const s = favPage * PAGE_SIZE; const e = Math.min(favRestaurants.length, (favPage + 1) * PAGE_SIZE);
					const next = favRestaurants.slice(s, e);
					next.forEach(p => {
						const card = createRestaurantCard(p, { onFiltersReapply: renderFavorites });
						restContainer.appendChild(card);
					});
					if ((favPage + 1) * PAGE_SIZE >= favRestaurants.length) btn.remove();
				});
				restContainer.parentElement.appendChild(btn);
			}
		}
	}
}

function wireExploreFromFavorites() {
	const exploreLinks = document.querySelectorAll('a.explore.button');
	if (!exploreLinks || exploreLinks.length === 0) return;
	exploreLinks.forEach(link => {
		link.addEventListener('click', (e) => {
			const sel = document.querySelector('#regions');
			const region = sel ? sel.value : 'All';
			const newHref = addRegionToUrlString(link.href, region);
			e.preventDefault();
			location.href = newHref;
		});
	});
}

document.addEventListener('DOMContentLoaded', async () => {
	loadHeaderFooter();
	wireExploreFromFavorites();
	await loadFavoriteDetails();
	populateRegionSelect();
	renderFavorites();

	// wire search and status filters
	const search = document.querySelector('#searchbar');
	if (search) search.addEventListener('input', () => applyFavoritesFilters());
	document.querySelectorAll('input[name="status"]').forEach(r => r.addEventListener('change', () => applyFavoritesFilters()));
	const regionsSel = document.querySelector('#regions');
	if (regionsSel) regionsSel.addEventListener('change', () => applyFavoritesFilters());
	function applyFavoritesFilters() {
		const q = document.querySelector('#searchbar')?.value?.toLowerCase()?.trim();
		const status = document.querySelector('input[name="status"]:checked')?.value || 'all';
		const region = document.querySelector('#regions')?.value || 'All';
		// filter favorites arrays and re-render
		const fd = favDestinations.filter(p => {
			if (region && region !== 'All' && p.region !== region) return false;
			if (status !== 'all') {
				if (status === 'open' && (typeof p.isOpen === 'boolean' ? !p.isOpen : !((p.status || '').toLowerCase().includes('operational')))) return false;
				if (status === 'closed' && (typeof p.isOpen === 'boolean' ? p.isOpen : !((p.status || '').toLowerCase().includes('closed')))) return false;
			}
			if (q) {
				const name = (p.name || '').toLowerCase();
				const types = (p.types || []).join(' ').toLowerCase();
				if (!name.includes(q) && !types.includes(q)) return false;
			}
			return true;
		});
		const fr = favRestaurants.filter(p => {
			if (region && region !== 'All' && p.region !== region) return false;
			if (status !== 'all') {
				if (status === 'open' && !((p.status || '').toLowerCase().includes('operational'))) return false;
				if (status === 'closed' && !((p.status || '').toLowerCase().includes('closed'))) return false;
			}
			if (q) {
				const name = (p.name || '').toLowerCase();
				const types = (p.types || []).join(' ').toLowerCase();
				if (!name.includes(q) && !types.includes(q)) return false;
			}
			return true;
		});
		// Temporarily set favorites arrays to filtered values and render
		const prevDest = favDestinations; const prevRest = favRestaurants;
		favDestinations = fd; favRestaurants = fr;
		renderFavorites();
		favDestinations = prevDest; favRestaurants = prevRest;
	}
});
