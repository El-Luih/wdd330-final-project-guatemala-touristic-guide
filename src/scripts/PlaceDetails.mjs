/**
 * PlaceDetails
 * Small helpers to derive data used in UI cards for touristic attractions.
 * - pickAttractionImage: pick the best available photo URL or fallback to a placeholder.
 * - attractionCard: produce the trimmed object used by the UI renderer.
 */
import { googleKey } from './util.mjs';

export function pickAttractionImage(place) {
  // Prefer constructing a fresh photo URL from photo_reference when possible
  if (place && Array.isArray(place.photoRefs) && place.photoRefs.length && googleKey) {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(place.photoRefs[0])}&key=${googleKey}`;
  }
  if (place.photos && place.photos.length) return place.photos[0];
  // SVG placeholder provided in public/images; use base URL so dev/build paths work
  const base = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.BASE_URL || '/' : '/';
  return `${base}images/placeholder-2x1.svg`;
}

export function attractionCard(place) {
  return {
    id: place.placeId,
    name: place.name,
    image: pickAttractionImage(place),
    types: (place.types || []).slice(0, 3),
    status: place.status,
    coords: place.location,
    region: place.region,
  };
}

export default { pickAttractionImage, attractionCard };
