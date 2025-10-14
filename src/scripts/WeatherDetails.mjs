/**
 * WeatherDetails
 * Converts OpenMeteo daily forecast responses into a simple array of day
 * summaries and provides a mapping from OpenMeteo weather codes to local
 * SVG icon filenames.
 */
export function dailySummary(openMeteoResponse) {
  try {
    if (!openMeteoResponse || !openMeteoResponse.daily) return null;
    const { time, temperature_2m_max, temperature_2m_min, weathercode } = openMeteoResponse.daily;
    if (!Array.isArray(time)) return null;
    return time.map((t, i) => ({ date: t, max: temperature_2m_max?.[i] ?? null, min: temperature_2m_min?.[i] ?? null, code: weathercode?.[i] ?? null }));
  } catch (e) {
    console.error('dailySummary: failed to parse OpenMeteo response', e);
    return null;
  }
}

export const WEATHER_ICONS = {
  0: 'clear.svg',
  1: 'mainly_clear.svg',
  2: 'partly_cloudy.svg',
  3: 'overcast.svg',
  45: 'fog.svg',
  48: 'depositing_rime_fog.svg',
  51: 'drizzle_light.svg',
  53: 'drizzle_moderate.svg',
  55: 'drizzle_dense.svg',
  61: 'rain_light.svg',
  63: 'rain_moderate.svg',
  65: 'rain_heavy.svg',
  71: 'snow_light.svg',
  73: 'snow_moderate.svg',
  75: 'snow_heavy.svg',
  80: 'rain_showers_light.svg',
  81: 'rain_showers_moderate.svg',
  82: 'rain_showers_violent.svg',
};

export default { dailySummary, WEATHER_ICONS };
