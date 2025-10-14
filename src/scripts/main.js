import { loadHeaderFooter, isFavorite, toggleFavorite } from './util.mjs';
import OpenMeteoAPI from './OpenMeteoAPI.mjs';
import { dailySummary, WEATHER_ICONS } from './WeatherDetails.mjs';
import { REGION_VIEWS, DEFAULT_COUNTRY_VIEW } from './MapConfig.mjs';
import { addRegionToUrlString, getActiveRegionFromUI, getRegionFromQuery, applyRegionToUI } from './RegionState.mjs';
import PlacesAPI from './PlacesAPI.mjs';
import { attractionCard } from './PlaceDetails.mjs';
import { restaurantCard } from './RestaurantDetails.mjs';

// Main page: weather gadget wiring.
// Behavior:
// - On load, populate region filter buttons (main page shows only region buttons)
// - When region changes, fetch weather for a representative point in that region
// - Display 3 day summary in #weather-0, #weather-1, #weather-2 and update #weather-region

function formatTemp(t) { return `${t.toFixed(1)}°C`; }

async function showWeatherFor(lat, lon, regionName = 'Guatemala') {
	try {
		const resp = await OpenMeteoAPI.fetchDaily(lat, lon);
		const days = dailySummary(resp);
		if (!days) return;
		const names = ['weather-0', 'weather-1', 'weather-2'];
		for (let i = 0; i < 3; i++) {
			const el = document.getElementById(names[i]);
			if (!el) continue;
			const d = days[i];
			el.innerHTML = '';
			if (!d) continue;
			const dayName = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : (new Date(d.date).toLocaleDateString(undefined, { weekday: 'long' })));
			const pDay = document.createElement('h4'); pDay.textContent = dayName;
			const img = document.createElement('img');
			const iconFile = WEATHER_ICONS[d.code] || 'clear.svg';
			img.src = `/images/weather/${iconFile}`;
			img.alt = 'weather';
			img.width = 48; img.height = 48;
			const temp = document.createElement('div'); temp.textContent = formatTemp(d.max);
			el.appendChild(pDay);
			el.appendChild(img);
			el.appendChild(temp);
		}
		const regionEl = document.getElementById('weather-region');
		if (regionEl) regionEl.textContent = regionName;
	} catch (e) {
		console.error('Weather fetch failed', e);
	}
}

// Representative lat/lng per region (use MapConfig's REGION_VIEWS centers)
function regionToCoords(region) {
	if (!region || region === 'All') return DEFAULT_COUNTRY_VIEW.center;
	const v = REGION_VIEWS[region];
	return v ? v.center : DEFAULT_COUNTRY_VIEW.center;
}

function setupMainRegionButtons() {
	const filterContainer = document.querySelector('.filtering-buttons');
	if (!filterContainer) return;
	// build region buttons (All + regions from REGION_VIEWS)
	filterContainer.innerHTML = '';
	const allBtn = document.createElement('button');
	allBtn.dataset.region = 'All';
	allBtn.textContent = 'All';
	filterContainer.appendChild(allBtn);
	Object.keys(REGION_VIEWS).forEach(r => {
		const b = document.createElement('button');
		b.dataset.region = r;
		b.textContent = r;
		filterContainer.appendChild(b);
	});

	// set current based on URL query (if any)
	let activeRegion = 'All';
	try { const q = getRegionFromQuery(); if (q) activeRegion = q; } catch (e) {}
	applyRegionToUI(activeRegion);

	filterContainer.addEventListener('click', (e) => {
		const btn = e.target.closest('button');
		if (!btn) return;
		const region = btn.dataset.region || 'All';
		// navigate to same page with region param so the page will reload and fetch region-scoped gadgets
		try {
			const newUrl = addRegionToUrlString(location.href, region);
			location.href = newUrl;
		} catch (err) {
			// fallback: apply UI and update weather without reloading
			document.querySelectorAll('.filtering-buttons button').forEach(b => b.classList.toggle('current', b.dataset.region === region));
			const coords = regionToCoords(region);
			showWeatherFor(coords.lat, coords.lng, region === 'All' ? 'Guatemala' : region);
		}
	});
}

// Helper to mark active button (used when DOM loaded and after navigation)
function markCurrentRegion(region) {
  try { document.querySelectorAll('.filtering-buttons button').forEach(b => b.classList.toggle('current', b.dataset.region === (region || 'All'))); } catch (e) {}
}

// Add click handlers to Explore buttons so they pass the currently selected region
// as a query parameter to the target pages (e.g. destinations/index.html?region=Quetzaltenango)
function wireExploreButtons() {
	const exploreButtons = document.querySelectorAll('a.explore.button');
	if (!exploreButtons || exploreButtons.length === 0) return;
	exploreButtons.forEach(btn => {
		btn.addEventListener('click', (e) => {
			// determine selected region from the filtering buttons
			const region = getActiveRegionFromUI();
			const newHref = addRegionToUrlString(btn.href, region);
			e.preventDefault();
			location.href = newHref;
		});
	});
}

document.addEventListener('DOMContentLoaded', () => {
	loadHeaderFooter();
	setupMainRegionButtons();
	// ensure current button is highlighted according to query
	let incoming = 'All'; try { const r = getRegionFromQuery(); if (r) incoming = r; } catch (e) {}
	markCurrentRegion(incoming);
	wireExploreButtons();
	// show default country weather
	const c = regionToCoords(incoming);
	showWeatherFor(c.lat, c.lng, incoming === 'All' ? 'Guatemala' : incoming);

	// render featured destinations (first N attractions that have photos)
	// and featured restaurants — both region-scoped to incoming region, 6 each
	(async () => {
		try {
			const region = incoming || 'All';
			// fetch up to 6 attractions and restaurants for this region
			const [at, rs] = await Promise.all([
				PlacesAPI.fetchAttractionsForRegion(region, 6),
				PlacesAPI.fetchRestaurantsForRegion(region, 6),
			]);
			// render attractions
			const destContainer = document.querySelector('.destinations.container');
			if (destContainer) {
				destContainer.innerHTML = '';
				(at || []).slice(0,6).forEach(p => {
					const d = attractionCard(p);
					const card = document.createElement('article'); card.className = 'small-card';
					const imgWrap = document.createElement('div'); imgWrap.className = 'card-media ratio-2x1';
					const img = document.createElement('img'); img.src = d.image; img.alt = d.name;
					img.onerror = () => { const base = import.meta.env.BASE_URL || '/'; img.src = `${base}images/placeholder-2x1.svg`; };
					imgWrap.appendChild(img); card.appendChild(imgWrap);
					const h = document.createElement('h4'); h.textContent = d.name; card.appendChild(h);
					const favBtn = document.createElement('button'); favBtn.type = 'button'; favBtn.className = 'fav-button'; favBtn.textContent = isFavorite(d.id, 'destination') ? '★' : '☆';
					favBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleFavorite(d.id, 'destination'); favBtn.textContent = isFavorite(d.id, 'destination') ? '★' : '☆'; });
					card.appendChild(favBtn);
					destContainer.appendChild(card);
				});
			}
			// render restaurants
			const restContainer = document.querySelector('.restaurants.container');
			if (restContainer) {
				restContainer.innerHTML = '';
				(rs || []).slice(0,6).forEach(p => {
					const r = restaurantCard(p);
					const card = document.createElement('article'); card.className = 'small-card';
					const imgWrap = document.createElement('div'); imgWrap.className = 'card-media ratio-1x1';
					const img = document.createElement('img'); img.src = r.logo; img.alt = r.name;
					img.onerror = () => { const base = import.meta.env.BASE_URL || '/'; img.src = `${base}images/restaurant-placeholder-1x1.svg`; };
					imgWrap.appendChild(img); card.appendChild(imgWrap);
					const h = document.createElement('h4'); h.textContent = r.name; card.appendChild(h);
					const favBtn = document.createElement('button'); favBtn.type = 'button'; favBtn.className = 'fav-button'; favBtn.textContent = isFavorite(r.id, 'restaurant') ? '★' : '☆';
					favBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleFavorite(r.id, 'restaurant'); favBtn.textContent = isFavorite(r.id, 'restaurant') ? '★' : '☆'; });
					card.appendChild(favBtn);
					restContainer.appendChild(card);
				});
			}
		} catch (e) {
			console.warn('Failed rendering main page gadgets', e);
		}
	})();
	// render featured destinations (first N attractions that have photos)
	(async () => {
		try {
			// fetch up to 18 attractions for the 'All' region (includes favorites)
			const at = await PlacesAPI.fetchAttractionsForRegion('All', 18);
			const container = document.querySelector('.destinations.container');
			if (!container) return;
			container.innerHTML = '';
			at.slice(0,6).forEach(p => {
				const d = attractionCard(p);
				const card = document.createElement('article'); card.className = 'small-card';
				const imgWrap = document.createElement('div'); imgWrap.className = 'card-media ratio-2x1';
				const img = document.createElement('img'); img.src = d.image; img.alt = d.name;
				img.onerror = () => { const base = import.meta.env.BASE_URL || '/'; img.src = `${base}images/placeholder-2x1.svg`; };
				imgWrap.appendChild(img); card.appendChild(imgWrap);
				const h = document.createElement('h4'); h.textContent = d.name; card.appendChild(h);
				const favBtn = document.createElement('button'); favBtn.type = 'button'; favBtn.className = 'fav-button'; favBtn.textContent = isFavorite(d.id, 'destination') ? '★' : '☆';
				favBtn.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); toggleFavorite(d.id, 'destination'); favBtn.textContent = isFavorite(d.id, 'destination') ? '★' : '☆'; });
				card.appendChild(favBtn);
				container.appendChild(card);
			});
		} catch (e) {
			console.warn('Failed rendering featured destinations', e);
		}
	})();
});
