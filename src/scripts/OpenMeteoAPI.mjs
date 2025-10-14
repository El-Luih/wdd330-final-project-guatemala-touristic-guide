/**
 * OpenMeteoAPI
 * Minimal wrapper to request daily forecast data from Open-Meteo. The
 * function returns the JSON response that includes daily arrays which are
 * later formatted by WeatherDetails.
 */
const OpenMeteoAPI = (function () {
  const BASE = 'https://api.open-meteo.com/v1/forecast';

  async function fetchDaily(lat, lon) {
    const url = `${BASE}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('OpenMeteo fetch failed: ' + res.status);
    return res.json();
  }

  return { fetchDaily };
})();

export default OpenMeteoAPI;
import { ExternalData } from "./util.mjs";