/**
 * RestaurantDetails
 * Helpers to choose a square logo for restaurant cards and shape the
 * small object used by UI renderers.
 */
import { googleKey } from './util.mjs';

export function pickRestaurantLogo(place) {
  if (place && Array.isArray(place.photoRefs) && place.photoRefs.length && googleKey) {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(place.photoRefs[0])}&key=${googleKey}`;
  }
  if (place.photos && place.photos.length) return place.photos[0];
  const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL || '/' : '/';
  return `${base}images/restaurant-placeholder-1x1.svg`;
}

export function restaurantCard(place) {
  return {
    id: place.placeId,
    name: place.name,
    logo: pickRestaurantLogo(place),
    types: (place.types || []).slice(0, 3),
    status: place.status,
    coords: place.location,
    region: place.region,
  };
}

export default { pickRestaurantLogo, restaurantCard };
