/**
 * PlaceDetails
 * Small helpers to derive data used in UI cards for touristic attractions.
 * - pickAttractionImage: pick the best available photo URL or fallback to a placeholder.
 * - attractionCard: produce the trimmed object used by the UI renderer.
 */
import { googleKey } from './util.mjs';

export function pickAttractionImage(place) {
  // Prefer constructing a fresh photo URL from photo_reference when possible
  // Prefer using the Places SDK provided URL (place.photos) when available. This
  // avoids constructing the maps/photo endpoint which redirects to the
  // googleusercontent CDN and can easily hit rate limits. Use photo_reference
  // only as a fallback when no direct photo URL is present.
  if (place.photos && place.photos.length) return place.photos[0];
  if (place && Array.isArray(place.photoRefs) && place.photoRefs.length && googleKey) {
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(place.photoRefs[0])}&key=${googleKey}`;
  }
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
