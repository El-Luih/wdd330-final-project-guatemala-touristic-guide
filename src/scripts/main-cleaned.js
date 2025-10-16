import { loadHeaderFooter, isFavorite, toggleFavorite } from './util.mjs';
import OpenMeteoAPI from './OpenMeteoAPI.mjs';
import { dailySummary, WEATHER_ICONS } from './WeatherDetails.mjs';
import { REGION_VIEWS, DEFAULT_COUNTRY_VIEW } from './MapConfig.mjs';
import {
  addRegionToUrlString,
  getActiveRegionFromUI,
  getRegionFromQuery,
  applyRegionToUI,
} from './RegionState.mjs';
import PlacesAPI from './PlacesAPI.mjs';
import { attractionCard } from './PlaceDetails.mjs';
import { restaurantCard } from './RestaurantDetails.mjs';

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load header/footer as early as possible
(() => {
  const mount = () => {
    try {
      loadHeaderFooter();
    } catch (e) {
      console.error('Failed to load header/footer:', e);
    }
  };
  if (document.readyState !== 'loading') mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();

// ============================================================================
// WEATHER GADGET
// ============================================================================

function formatTemp(t) {
  return `${t.toFixed(1)}°C`;
}

function regionToCoords(region) {
  if (!region || region === 'All') return DEFAULT_COUNTRY_VIEW.center;
  const v = REGION_VIEWS[region];
  return v ? v.center : DEFAULT_COUNTRY_VIEW.center;
}

async function showWeatherFor(lat, lon, regionName = 'Guatemala') {
  try {
    const resp = await OpenMeteoAPI.fetchDaily(lat, lon);
    const days = dailySummary(resp);
    if (!days) return;

    const weatherIds = ['weather-0', 'weather-1', 'weather-2'];
    const dayNames = ['Today', 'Tomorrow'];

    for (let i = 0; i < 3; i++) {
      const el = document.getElementById(weatherIds[i]);
      if (!el || !days[i]) continue;

      const d = days[i];
      el.innerHTML = '';

      // Day name
      const dayName =
        i < 2
          ? dayNames[i]
          : new Date(d.date).toLocaleDateString(undefined, { weekday: 'long' });
      const h4 = document.createElement('h4');
      h4.textContent = dayName;
      el.appendChild(h4);

      // Weather icon
      const img = document.createElement('img');
      const iconFile = WEATHER_ICONS[d.code] || 'clear.svg';
      const baseUrl = import.meta?.env?.BASE_URL || '/';
      img.src = `${baseUrl}images/weather/${iconFile}`;
      img.alt = 'weather';
      img.width = 48;
      img.height = 48;
      img.onerror = () => {
        img.src = `${baseUrl}images/weather/clear.svg`;
      };
      el.appendChild(img);

      // Temperature
      const temp = document.createElement('div');
      temp.textContent = formatTemp(d.max);
      el.appendChild(temp);
    }

    const regionEl = document.getElementById('weather-region');
    if (regionEl) regionEl.textContent = regionName;
  } catch (e) {
    console.error('Weather fetch failed:', e);
  }
}

// ============================================================================
// REGION FILTER BUTTONS
// ============================================================================

function setupMainRegionButtons() {
  const filterContainer = document.querySelector('.filtering-buttons');
  if (!filterContainer) return;

  // Clear and build buttons
  filterContainer.innerHTML = '';

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.dataset.region = 'All';
  allBtn.textContent = 'All';
  filterContainer.appendChild(allBtn);

  // Region buttons
  Object.keys(REGION_VIEWS).forEach((region) => {
    const btn = document.createElement('button');
    btn.dataset.region = region;
    btn.textContent = region;
    filterContainer.appendChild(btn);
  });

  // Set active region from URL
  let activeRegion = 'All';
  try {
    const queryRegion = getRegionFromQuery();
    if (queryRegion) activeRegion = queryRegion;
  } catch (e) {
    console.error('Failed to get region from query:', e);
  }

  applyRegionToUI(activeRegion);

  // Handle button clicks
  filterContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !btn.dataset.region) return;

    const region = btn.dataset.region;
    try {
      const newUrl = addRegionToUrlString(location.href, region);
      location.href = newUrl;
    } catch (err) {
      console.error('Failed to navigate with region:', err);
      // Fallback: update UI without reload
      markCurrentRegion(region);
      const coords = regionToCoords(region);
      showWeatherFor(
        coords.lat,
        coords.lng,
        region === 'All' ? 'Guatemala' : region,
      );
    }
  });
}

function markCurrentRegion(region) {
  try {
    document.querySelectorAll('.filtering-buttons button').forEach((btn) => {
      btn.classList.toggle('current', btn.dataset.region === (region || 'All'));
    });
  } catch (e) {
    console.error('Failed to mark current region:', e);
  }
}

// ============================================================================
// EXPLORE BUTTONS (pass region param when navigating)
// ============================================================================

function wireExploreButtons() {
  document.querySelectorAll('a.explore.button').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const region = getActiveRegionFromUI();
      const newHref = addRegionToUrlString(btn.href, region);
      location.href = newHref;
    });
  });
}

// ============================================================================
// CARD RENDERING HELPERS
// ============================================================================

function createSmallCard(data, type) {
  const card = document.createElement('article');
  card.className = 'small-card';

  // Image
  const imgWrap = document.createElement('div');
  imgWrap.className = `card-media ratio-${type === 'destination' ? '2x1' : '1x1'}`;
  const img = document.createElement('img');
  img.src = type === 'destination' ? data.image : data.logo;
  img.alt = data.name;

  const baseUrl = import.meta?.env?.BASE_URL || '/';
  const placeholder =
    type === 'destination'
      ? `${baseUrl}images/placeholder-2x1.svg`
      : `${baseUrl}images/restaurant-placeholder-1x1.svg`;
  img.onerror = () => {
    img.src = placeholder;
  };

  imgWrap.appendChild(img);
  card.appendChild(imgWrap);

  // Title
  const h4 = document.createElement('h4');
  h4.textContent = data.name;
  card.appendChild(h4);

  // Favorite button
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'fav-button';
  favBtn.textContent = isFavorite(data.id, type) ? '★' : '☆';
  favBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFavorite(data.id, type);
    favBtn.textContent = isFavorite(data.id, type) ? '★' : '☆';
  });
  card.appendChild(favBtn);

  return card;
}

// ============================================================================
// RENDER FEATURED CONTENT (destinations & restaurants)
// ============================================================================

async function renderFeaturedContent(region) {
  try {
    const [attractions, restaurants] = await Promise.all([
      PlacesAPI.fetchAttractionsForRegion(region, 6),
      PlacesAPI.fetchRestaurantsForRegion(region, 6),
    ]);

    // Render destinations
    const destContainer = document.querySelector('.destinations.container');
    if (destContainer) {
      destContainer.innerHTML = '';
      (attractions || []).slice(0, 6).forEach((place) => {
        const data = attractionCard(place);
        const card = createSmallCard(data, 'destination');
        destContainer.appendChild(card);
      });
    }

    // Render restaurants
    const restContainer = document.querySelector('.restaurants.container');
    if (restContainer) {
      restContainer.innerHTML = '';
      (restaurants || []).slice(0, 6).forEach((place) => {
        const data = restaurantCard(place);
        const card = createSmallCard(data, 'restaurant');
        restContainer.appendChild(card);
      });
    }
  } catch (e) {
    console.error('Failed rendering featured content:', e);
  }
}

// ============================================================================
// EVENTS GADGET
// ============================================================================

function parseMonthDay(md) {
  if (!md) return null;
  const parts = md.split('-').map((s) => s.padStart(2, '0'));
  if (parts.length !== 2) return null;
  return { mm: parseInt(parts[0], 10), dd: parseInt(parts[1], 10) };
}

function statusForEvent(startDate, endDate, today = new Date()) {
  const s = new Date(
    startDate.getFullYear(),
    startDate.getMonth(),
    startDate.getDate(),
  );
  const e = new Date(
    endDate.getFullYear(),
    endDate.getMonth(),
    endDate.getDate(),
  );
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (t < s) return 'upcoming';
  if (t > e) return 'past';
  return 'ongoing';
}

async function fetchEventsJSON() {
  const baseUrl = import.meta?.env?.BASE_URL || '/';
  const candidates = [
    `${baseUrl}json/guatemala-events.json`,
    'json/guatemala-events.json',
    '/json/guatemala-events.json',
    '/public/json/guatemala-events.json',
    '/src/public/json/guatemala-events.json',
    '../json/guatemala-events.json',
    './public/json/guatemala-events.json',
  ];

  const attempts = [];
  for (const path of candidates) {
    try {
      const res = await fetch(path);
      attempts.push({ path, ok: res.ok, status: res.status });
      console.log('Events fetch attempt:', {
        path,
        ok: res.ok,
        status: res.status,
      });

      if (res.ok) {
        const data = await res.json();
        console.log('Events data loaded:', data);
        return data;
      }
    } catch (e) {
      attempts.push({ path, ok: false, error: String(e) });
    }
  }

  console.warn('Events JSON fetch failed, attempted paths:', attempts);
  return null;
}

function renderEventsDiagnostic(container, attempts) {
  container.innerHTML = '';

  const msg = document.createElement('div');
  msg.className = 'no-events';
  msg.textContent = 'No events this month';
  container.appendChild(msg);

  const diag = document.createElement('details');
  diag.style.marginTop = '10px';

  const summary = document.createElement('summary');
  summary.textContent = 'Debug: attempted event JSON paths (click to expand)';
  diag.appendChild(summary);

  const list = document.createElement('ul');
  attempts.forEach((a) => {
    const li = document.createElement('li');
    li.textContent = a.error
      ? `${a.path} → error: ${a.error}`
      : `${a.path} → ok: ${a.ok} ${a.status ? `(HTTP ${a.status})` : ''}`;
    list.appendChild(li);
  });
  diag.appendChild(list);
  container.appendChild(diag);
}

async function renderMainEventsGadget() {
  const container = document.querySelector('.events.container.table');
  if (!container) return;

  const data = await fetchEventsJSON();
  if (!data) {
    renderEventsDiagnostic(container, []);
    return;
  }

  const now = new Date();
  const currentMonth = now.getMonth();

  // Normalize and filter events
  const events = data
    .map((raw) => {
      const startMD = parseMonthDay(raw.date?.start);
      const endMD = parseMonthDay(raw.date?.end) || startMD;
      if (!startMD) return null;

      const startDate = new Date(now.getFullYear(), startMD.mm - 1, startMD.dd);
      let endDate = new Date(now.getFullYear(), endMD.mm - 1, endMD.dd);

      // Handle year wrap
      if (endDate < startDate) {
        endDate = new Date(
          endDate.getFullYear() + 1,
          endDate.getMonth(),
          endDate.getDate(),
        );
      }

      const status = statusForEvent(startDate, endDate, now);
      return { raw, startDate, endDate, status };
    })
    .filter((e) => e && e.startDate.getMonth() === currentMonth);

  // Sort by date, then by status
  const statusRank = { ongoing: 0, upcoming: 1, past: 2 };
  events.sort((a, b) => {
    const dateDiff = a.startDate - b.startDate;
    return dateDiff !== 0
      ? dateDiff
      : statusRank[a.status] - statusRank[b.status];
  });

  // Render
  container.innerHTML = '';
  if (events.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'no-events';
    msg.textContent = 'No events this month';
    container.appendChild(msg);
    return;
  }

  events.forEach((e) => {
    const card = document.createElement('article');
    card.className = `mini-event-card mini-event--${e.status}`;

    const left = document.createElement('div');
    left.className = 'mini-event__left';

    const name = document.createElement('div');
    name.className = 'mini-event__name';
    name.textContent = e.raw.name;

    const date = document.createElement('div');
    date.className = 'mini-event__date';
    date.textContent = e.startDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });

    left.appendChild(name);
    left.appendChild(date);
    card.appendChild(left);
    container.appendChild(card);
  });
}

// ============================================================================
// MAIN INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // Setup region buttons
  setupMainRegionButtons();

  // Get active region
  let activeRegion = 'All';
  try {
    const queryRegion = getRegionFromQuery();
    if (queryRegion) activeRegion = queryRegion;
  } catch (e) {
    console.error('Failed to get region from query:', e);
  }

  // Mark current region button
  markCurrentRegion(activeRegion);

  // Wire explore buttons
  wireExploreButtons();

  // Show weather for selected region
  const coords = regionToCoords(activeRegion);
  const regionName = activeRegion === 'All' ? 'Guatemala' : activeRegion;
  showWeatherFor(coords.lat, coords.lng, regionName);

  // Render featured content (destinations & restaurants)
  await renderFeaturedContent(activeRegion);

  // Render events gadget
  try {
    await renderMainEventsGadget();
  } catch (err) {
    console.error('Failed to render events:', err);
    const container = document.querySelector('.events.container.table');
    if (container) {
      container.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'no-events';
      msg.textContent = 'Events could not be loaded (see console for details)';
      container.appendChild(msg);
    }
  }
});
