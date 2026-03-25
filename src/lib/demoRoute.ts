import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import type { Coordinate } from '../types/offline'

function jitterCoordinate([lng, lat]: Coordinate, lngOffset: number, latOffset: number): Coordinate {
  return [lng + lngOffset, lat + latOffset]
}

export function pickBusyDemoPoints(hotspots: RouteAvoidanceHotspot[]): {
  startPoint: Coordinate
  endPoint: Coordinate
} | null {
  if (hotspots.length < 2) {
    return null
  }

  const sorted = [...hotspots].sort((left, right) => right.penalty - left.penalty)
  const pool = sorted.slice(0, Math.min(8, sorted.length))
  const startIndex = Math.floor(Math.random() * pool.length)
  let endIndex = Math.floor(Math.random() * pool.length)

  while (endIndex === startIndex && pool.length > 1) {
    endIndex = Math.floor(Math.random() * pool.length)
  }

  const startHotspot = pool[startIndex]
  const endHotspot = pool[endIndex]

  return {
    startPoint: jitterCoordinate(startHotspot.coordinate, -0.006, -0.0035),
    endPoint: jitterCoordinate(endHotspot.coordinate, 0.006, 0.0035),
  }
}
