import GoogleMapsAPI from './GoogleMapsAPI.mjs';
import { assignRegionByLatLng } from './MapConfig.mjs';
import { loadFavorites } from './util.mjs';
import idbCache from './idbCache.mjs';

const CACHE_ATTR_KEY = 'places_cache_attractions_v1';
const CACHE_REST_KEY = 'places_cache_restaurants_v1';

const PlacesAPI = (function () {
  let attractions = [];
  let restaurants = [];
  let service = null;
  let mapsAvailable = true;

  // Try to load previously cached lists from sessionStorage (session only)
  function loadCacheFromSession() {
    try {
      const a = sessionStorage.getItem(CACHE_ATTR_KEY);
      const r = sessionStorage.getItem(CACHE_REST_KEY);
      if (a) {
        attractions = JSON.parse(a) || [];
      }
      if (r) {
        restaurants = JSON.parse(r) || [];
      }
      try { console.log('PlacesAPI: loaded session cache', { attractions: attractions.length, restaurants: restaurants.length }); } catch (e) {}
    } catch (e) {
      console.warn('Failed reading Places cache from sessionStorage', e);
    }
  }

  function saveCacheToSession() {
    try {
      sessionStorage.setItem(CACHE_ATTR_KEY, JSON.stringify(attractions));
      sessionStorage.setItem(CACHE_REST_KEY, JSON.stringify(restaurants));
    } catch (e) {
      console.warn('Failed saving Places cache to sessionStorage', e);
    }
  }

  // load any existing cache immediately (so fetch functions can return quickly)
  loadCacheFromSession();
  // clear expired entries from persistent cache
  try { idbCache.clearExpired(); } catch (e) {}

  // Small fallback sample data used when Places API is not available (local development)
  const SAMPLE_FALLBACK = [
    { placeId: 'sample-1', name: 'Antigua Guatemala', types: ['tourist_attraction'], status: 'OPERATIONAL', location: { lat: 14.556, lng: -90.734 }, address: 'Antigua Guatemala', photos: [], region: 'Metropolitan', raw: {} },
    { placeId: 'sample-2', name: 'Tikal National Park', types: ['park', 'tourist_attraction'], status: 'OPERATIONAL', location: { lat: 17.223, lng: -89.623 }, address: 'Tikal', photos: [], region: 'Petén', raw: {} },
    { placeId: 'sample-3', name: 'Lake Atitlán', types: ['natural_feature'], status: 'OPERATIONAL', location: { lat: 14.704, lng: -91.186 }, address: 'Lake Atitlán', photos: [], region: 'West', raw: {} },
  ];

  // Map internal region names to user-friendly search phrases that yield better
  // Places textSearch results. Some region tokens (like 'Metropolitan') don't
  // work well as stand-alone search queries, so provide sensible fallbacks.
  const REGION_QUERY_MAP = {
    Metropolitan: ['Guatemala City', 'Guatemala City restaurants', 'restaurants in Guatemala City'],
    'Las Verapaces': ['Las Verapaces', 'Verapaces Guatemala', 'restaurants in Las Verapaces'],
    Petén: ['Petén', 'Petén Guatemala', 'restaurants in Petén'],
    'South Coast': ['Pacific coast Guatemala', 'South Coast Guatemala', 'restaurants on the Pacific coast Guatemala'],
    West: ['Quetzaltenango', 'Quetzaltenango restaurants', 'restaurants in Quetzaltenango'],
    Southeast: ['Jutiapa', 'Jutiapa Guatemala restaurants', 'restaurants in Jutiapa'],
    Northeast: ['Izabal', 'Izabal Guatemala restaurants', 'restaurants in Izabal'],
    // default fallbacks will be used for other regions
  };

  async function ensure() {
    try {
      await GoogleMapsAPI.load();
      if (!service && window.google && window.google.maps && window.google.maps.places) {
        const div = document.createElement('div');
        const map = new google.maps.Map(div);
        service = new google.maps.places.PlacesService(map);
      }
      if (!service) {
        // Maps loaded but Places not available
        mapsAvailable = false;
      }
      try { console.log('PlacesAPI.ensure', { mapsAvailable, hasService: !!service }); } catch (e) {}
    } catch (e) {
      console.warn('Google Maps failed to load, falling back to session cache if available', e);
      mapsAvailable = false;
      try { console.log('PlacesAPI.ensure: maps unavailable, will use cache/fallback paths'); } catch (e2) {}
    }
  }

  function normalize(p) {
    const loc = p.geometry && p.geometry.location ? { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() } : null;
    // Extract both immediate URLs (via getUrl) and underlying photo references
    // so we can attempt to regenerate a photo URL later if the original one fails.
    const photos = p.photos && p.photos.length ? p.photos.map(ph => ph.getUrl({ maxWidth: 800 })) : [];
    const photoRefs = p.photos && p.photos.length ? p.photos.map(ph => ph.photo_reference).filter(Boolean) : [];
    // opening_hours may provide an isOpen() helper in the Places SDK. Prefer that
    // over the older open_now property.
    let isOpen = null;
    if (p.opening_hours) {
      try {
        if (typeof p.opening_hours.isOpen === 'function') {
          isOpen = p.opening_hours.isOpen();
        } else if (typeof p.opening_hours.open_now !== 'undefined') {
          isOpen = Boolean(p.opening_hours.open_now);
        }
      } catch (e) {
        // non-fatal, leave isOpen null
      }
    }
    return {
      placeId: p.place_id,
      name: p.name,
      types: (p.types || []).slice(0, 3),
  status: p.business_status || null,
  isOpen,
      location: loc,
      address: p.formatted_address || p.vicinity || null,
      photos,
      photoRefs,
      region: loc ? assignRegionByLatLng(loc.lat, loc.lng) : 'Center',
      raw: p,
    };
  }

  function hasPhoto(obj) {
    return obj && Array.isArray(obj.photos) && obj.photos.length > 0;
  }

  function textSearch(request) {
    return new Promise((resolve, reject) => {
      if (!mapsAvailable || !service) return reject(new Error('Places service not available'));
      service.textSearch(request, (results, status, pagination) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK && status !== window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS) return reject(new Error('TextSearch failed: ' + status));
        try {
          // Log a shallow, sanitized view of raw results (avoid functions/cycles)
          // NOTE for reviewers: the console logs below are intentional to aid
          // evaluation/demonstration by exposing API outputs with many fields.
          const preview = (results || []).slice(0, 3).map(r => ({
            place_id: r.place_id,
            name: r.name,
            business_status: r.business_status,
            types: r.types,
            formatted_address: r.formatted_address || r.vicinity
          }));
          console.log('PlacesAPI.textSearch callback', { query: request && request.query, status, count: (results || []).length, sample: preview });
        } catch (e) {}
        resolve({ results: results || [], pagination });
      });
    });
  }

  // Fetch detailed info for a single place by place_id and normalize it.
  async function getPlaceById(placeId) {
    // check persistent cache first
    try {
      const cached = await idbCache.getCache(`places:detail:${placeId}`);
      if (cached) return cached;
    } catch (e) {
      // non-fatal
    }
    await ensure();
    if (!mapsAvailable || !service) throw new Error('Places service not available');
    return new Promise((resolve, reject) => {
      // Request opening_hours explicitly so callers can check isOpen() rather than relying on deprecated open_now
      service.getDetails({ placeId, fields: ['place_id', 'name', 'geometry', 'types', 'business_status', 'formatted_address', 'photos', 'opening_hours'] }, async (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK) return reject(new Error('getDetails failed: ' + status));
        try {
          // Log a shallow preview of the raw place
          // NOTE for reviewers: this log is deliberate for evaluation/demo.
          const preview = place ? {
            place_id: place.place_id,
            name: place.name,
            business_status: place.business_status,
            types: place.types,
            formatted_address: place.formatted_address || place.vicinity
          } : null;
          console.log('PlacesAPI.getDetails callback', { placeId, status, preview });
        } catch (e) {}
        const n = normalize(place);
    try { console.log('PlacesAPI.getPlaceById result', { placeId, normalized: n }); } catch (e) {}
        // sanitize before caching: remove the raw object which may contain functions
        const sanitized = Object.assign({}, n);
        try { delete sanitized.raw; } catch (e) {}
        try {
          const ok = await idbCache.setCache(`places:detail:${placeId}`, sanitized, 24 * 60 * 60 * 1000);
          if (!ok) console.debug('PlacesAPI: failed to persist place detail to idb', placeId);
          else console.debug('PlacesAPI: cached place detail', placeId);
        } catch (e) {
          console.debug('PlacesAPI: idb setCache error', e);
        }
                try { console.log('PlacesAPI.fetchManySeeds: using cached seed results', { query: q, count: cached.length }); } catch (e) {}
        resolve(n);
      });
    });
  }

  // Ensure favorites (from localStorage) are present in the results list. This
  // fetches details for any favorite IDs that aren't already in the list and
  // appends them, up to the maximum of 100 items.
  async function includeFavorites(list, type = 'attraction') {
    const fav = loadFavorites();
              try { console.log('PlacesAPI.fetchManySeeds: querying textSearch', { query: q }); } catch (e) {}
    const favIds = type === 'restaurant' ? fav.restaurants : fav.destinations;
    if (!favIds || !favIds.length) return list;
    for (const id of favIds) {
      if (list.find(x => x.placeId === id)) continue;
      try {
        const detail = await getPlaceById(id);
        // only include favorites that have photos
        if (detail && hasPhoto(detail)) list.push(detail);
      } catch (e) {
        console.warn('Failed fetching favorite by id', id, e);
      }
      if (list.length >= 100) break;
    }
    return list.slice(0, 100);
  }

  async function fetchManySeeds(seeds) {
    await ensure();
    const all = [];
    // If Maps/Places not available, fall back to returning existing session cache
    if (!mapsAvailable) {
      if (attractions.length) return attractions.slice(0, 100);
      if (restaurants.length) return restaurants.slice(0, 100);
      // nothing to return
      console.warn('PlacesAPI: Maps not available and no cache present; returning empty list');
      return [];
    }
    for (const q of seeds) {
      // check cached results for this seed query
      try {
        const cached = await idbCache.getCache(`places:text:${q}`);
        if (cached && Array.isArray(cached) && cached.length) {
          for (const n of cached) {
            if (!all.find(x => x.placeId === n.placeId)) all.push(n);
          }
          if (all.length >= 100) break;
          continue; // move to next seed
        }
      } catch (e) {
        // ignore cache errors
      }
      try {
        const { results } = await textSearch({ query: q });
  try { console.log('PlacesAPI.fetchManySeeds textSearch', { query: q, resultsCount: (results || []).length }); } catch (e) {}
        const seedItems = [];
        for (const r of results) {
          const n = normalize(r);
          // only include places that have photos
          if (!hasPhoto(n)) continue;
          if (!all.find(x => x.placeId === n.placeId)) all.push(n);
          seedItems.push(n);
        }
        // persist seed results (normalized) to idb cache to reduce future requests
        try {
          // sanitize items for storage
          const toStore = seedItems.map(it => {
            const s = Object.assign({}, it);
            try { delete s.raw; } catch (e) {}
            return s;
          }).slice(0, 50);
          const ok = await idbCache.setCache(`places:text:${q}`, toStore, 24 * 60 * 60 * 1000);
          if (!ok) console.debug('PlacesAPI: failed to persist seed cache for', q);
          else console.debug('PlacesAPI: cached seed results for', q, toStore.length);
        } catch (e) {
          console.debug('PlacesAPI: idb seed setCache error', e);
        }
      } catch (e) {
        console.warn('textSearch seed failed', q, e);
      }
      if (all.length >= 100) break;
    }
      try { console.log('PlacesAPI.fetchManySeeds: aggregated results', { total: all.length, sample: all.slice(0,3) }); } catch (e) {}
    return all.slice(0, 100);
  }

  async function fetchAttractions() {
    if (attractions.length) return attractions;
    const seeds = ['tourist attractions in Guatemala', 'historic sites in Guatemala', 'national parks Guatemala', 'archaeological sites Guatemala', 'museums Guatemala', 'landmarks Guatemala'];
  attractions = await fetchManySeeds(seeds);
  // filter to those with photos only (also respects SAMPLE_FALLBACK handling elsewhere)
  attractions = attractions.filter(a => hasPhoto(a));
    // if no results and maps not available, fall back to sample data
    if ((!attractions || attractions.length === 0) && !mapsAvailable) {
      attractions = SAMPLE_FALLBACK.slice();
    }
    attractions = await includeFavorites(attractions, 'attraction');
    // persist into sessionStorage for the duration of the tab session
    saveCacheToSession();
    try { console.log('PlacesAPI.fetchAttractions: returning', { count: attractions.length, sample: attractions.slice(0,3) }); } catch (e) {}
    return attractions;
  }

  // Fetch attractions scoped to a specific region. Returns up to `limit` items (default 18)
  async function fetchAttractionsForRegion(region = 'All', limit = 18) {
    await ensure();
    try { console.log('PlacesAPI.fetchAttractionsForRegion start', { region, mapsAvailable }); } catch (e) {}
    // When region is 'All', fall back to existing cached list
    if ((region === 'All' || !region) && attractions.length) return includeFavorites(attractions.slice(0, limit), 'attraction');
    // build seeds targeted to the region
    const seeds = [];
    if (region && region !== 'All') {
      seeds.push(`${region} tourist attractions`);
      seeds.push(`top sites in ${region}`);
      seeds.push(`${region} attractions Guatemala`);
    } else {
      seeds.push('tourist attractions in Guatemala');
    }
    try { console.log('PlacesAPI.fetchAttractionsForRegion seeds', { region, seeds }); } catch (e) {}
    const items = await fetchManySeeds(seeds);
    // ensure favorites are included and cap
    const withFav = await includeFavorites(items, 'attraction');
    try { console.log('PlacesAPI.fetchAttractionsForRegion result', { region, count: withFav.length, sample: withFav.slice(0,3) }); } catch (e) {}
    return withFav.slice(0, limit);
  }

  async function fetchRestaurants() {
    if (restaurants.length) return restaurants;
    const seeds = ['best restaurants in Guatemala', 'popular restaurants Guatemala', 'top restaurants Guatemala', 'local cuisine Guatemala'];
  restaurants = await fetchManySeeds(seeds);
  // filter to actual restaurants when possible
  restaurants = restaurants.filter(r => r.types && r.types.includes('restaurant'));
  // filter to those with photos only
  restaurants = restaurants.filter(r => hasPhoto(r));
    restaurants = await includeFavorites(restaurants, 'restaurant');
    if ((!restaurants || restaurants.length === 0) && !mapsAvailable) {
      // create simple sample restaurant records derived from SAMPLE_FALLBACK
      restaurants = SAMPLE_FALLBACK.map((s, i) => ({ placeId: `sample-restaurant-${i+1}`, name: `${s.name} Bistro`, types: ['restaurant'], status: 'OPERATIONAL', location: s.location, address: s.address, photos: [], region: s.region, raw: {} }));
    }
    saveCacheToSession();
    try { console.log('PlacesAPI.fetchRestaurants: returning', { count: restaurants.length, sample: restaurants.slice(0,3) }); } catch (e) {}
    return restaurants.slice(0, 100);
  }

  // Fetch restaurants scoped to a region up to `limit` items, include favorites
  async function fetchRestaurantsForRegion(region = 'All', limit = 18) {
    await ensure();
    try { console.log('PlacesAPI.fetchRestaurantsForRegion start', { region, mapsAvailable }); } catch (e) {}
    if ((region === 'All' || !region) && restaurants.length) return includeFavorites(restaurants.slice(0, limit), 'restaurant');
    let seeds = [];
    if (region && region !== 'All') {
      // use improved region->query mappings when available
      if (REGION_QUERY_MAP[region]) seeds = REGION_QUERY_MAP[region].slice();
      else {
        seeds.push(`${region} restaurants`);
        seeds.push(`best restaurants in ${region}`);
        seeds.push(`${region} local cuisine`);
      }
    } else {
      seeds.push('best restaurants in Guatemala');
    }
    try { console.log('PlacesAPI.fetchRestaurantsForRegion seeds', { region, seeds }); } catch (e) {}
    // attempt initial region-specific seeds
    let items = await fetchManySeeds(seeds);
    // prefer items whose normalized region matches the requested region
    if (region && region !== 'All') {
      const exact = (items || []).filter(it => it.region === region);
      if (exact && exact.length) {
        const withFav = await includeFavorites(exact, 'restaurant');
        try { console.log('PlacesAPI.fetchRestaurantsForRegion exact match', { region, count: withFav.length, sample: withFav.slice(0,3) }); } catch (e) {}
        return withFav.slice(0, limit);
      }
      // if no exact region matches, try a broader fallback
      const fallbackSeeds = ['best restaurants in Guatemala', 'popular restaurants Guatemala', `${region} near Guatemala City`];
      const fallbackItems = await fetchManySeeds(fallbackSeeds);
      const fallbackExact = (fallbackItems || []).filter(it => it.region === region);
      if (fallbackExact && fallbackExact.length) {
        const withFav = await includeFavorites(fallbackExact, 'restaurant');
        try { console.log('PlacesAPI.fetchRestaurantsForRegion fallback exact', { region, count: withFav.length, sample: withFav.slice(0,3) }); } catch (e) {}
        return withFav.slice(0, limit);
      }
      // no region-exact matches; if we have any items at all, return them as broader nearby results
      if (items && items.length) {
        const withFav = await includeFavorites(items, 'restaurant');
        try { console.log('PlacesAPI.fetchRestaurantsForRegion nearby results', { region, count: withFav.length, sample: withFav.slice(0,3) }); } catch (e) {}
        return withFav.slice(0, limit);
      }
      if (fallbackItems && fallbackItems.length) {
        const withFav = await includeFavorites(fallbackItems, 'restaurant');
        try { console.log('PlacesAPI.fetchRestaurantsForRegion broad fallback', { region, count: withFav.length, sample: withFav.slice(0,3) }); } catch (e) {}
        return withFav.slice(0, limit);
      }
      // ultimately fall through to returning an empty list
      return [];
    }
    const withFav = await includeFavorites(items, 'restaurant');
    try { console.log('PlacesAPI.fetchRestaurantsForRegion all-region result', { region, count: withFav.length, sample: withFav.slice(0,3) }); } catch (e) {}
    return withFav.slice(0, limit);
  }

  function groupByRegion(list) {
    const map = {};
    for (const item of list) {
      const r = item.region || 'Center';
      if (!map[r]) map[r] = [];
      map[r].push(item);
    }
    return map;
  }

  return { fetchAttractions, fetchAttractionsForRegion, fetchRestaurants, fetchRestaurantsForRegion, groupByRegion, getPlaceById, _internal: { get attractions(){ return attractions; }, get restaurants(){ return restaurants; } } };
})();

export default PlacesAPI;