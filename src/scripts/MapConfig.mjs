export const REGIONS = [
  'Metropolitan', 'Las Verapaces', 'Northeast', 'Southeast', 'Center', 'West', 'Northwest', 'Petén', 'South Coast'
];

export const REGION_VIEWS = {
  Metropolitan: { center: { lat: 14.6349, lng: -90.5069 }, zoom: 11 },
  'Las Verapaces': { center: { lat: 15.2000, lng: -90.0000 }, zoom: 9 },
  Northeast: { center: { lat: 15.8000, lng: -88.5000 }, zoom: 8 },
  Southeast: { center: { lat: 14.9000, lng: -90.2000 }, zoom: 8 },
  Center: { center: { lat: 15.0000, lng: -90.0000 }, zoom: 8 },
  West: { center: { lat: 14.8000, lng: -91.5000 }, zoom: 8 },
  Northwest: { center: { lat: 15.3000, lng: -91.0000 }, zoom: 8 },
  Petén: { center: { lat: 16.5000, lng: -89.9000 }, zoom: 7 },
  'South Coast': { center: { lat: 14.0000, lng: -91.7000 }, zoom: 8 },
};

export const DEFAULT_COUNTRY_VIEW = { center: { lat: 15.5000, lng: -90.2300 }, zoom: 7 };

export function assignRegionByLatLng(lat, lng) {
  if (lat >= 16.0) return 'Petén';
  // Northeast region: north-east area of the country (approx)
  if (lat >= 15.5 && lng >= -89.5) return 'Northeast';
  if (lat >= 14.9 && lat < 16.0 && lng >= -90.5 && lng <= -89.0) return 'Las Verapaces';
  if (lat >= 14.4 && lat <= 14.9 && lng >= -90.9 && lng <= -90.2) return 'Metropolitan';
  if (lat < 14.4 && lng <= -90.5) return 'South Coast';
  if (lng <= -91.0) return 'West';
  if (lat >= 15.0 && lng <= -90.8) return 'Northwest';
  if (lat < 15.0 && lng >= -90.3 && lng <= -89.0) return 'Southeast';
  return 'Center';
}
