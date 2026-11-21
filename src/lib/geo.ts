/** Straight-line distance in kilometres between two points (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const ROAD_FACTOR = 1.4; // roads are longer than the straight line
const CITY_SPEED_KMH = 22; // a motorbike or car in Egyptian city traffic

/**
 * A rough arrival time from the straight-line distance. It is an estimate, not a route: it ignores the actual roads and traffic, and the
 * page says so. Returns whole minutes, at least 1.
 */
export function estimateEtaMinutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  return Math.max(1, Math.round(((distanceKm(from, to) * ROAD_FACTOR) / CITY_SPEED_KMH) * 60));
}
