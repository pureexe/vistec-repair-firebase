export function getPosition(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('no geolocation'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy), at: Date.now() }),
      reject,
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    )
  })
}

export function distanceM(a, b) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Closest building (with lat/lng) to a position, or null. */
export function nearestBuilding(pos, buildings) {
  let best = null
  for (const b of buildings) {
    if (typeof b.lat !== 'number' || typeof b.lng !== 'number') continue
    const d = distanceM(pos, b)
    if (!best || d < best.d) best = { b, d }
  }
  return best ? { building: best.b, distance: Math.round(best.d) } : null
}

export const mapUrl = (g) => `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}`
