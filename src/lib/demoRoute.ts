import type { OfflineRouter } from './router'
import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import type { Coordinate } from '../types/offline'

function projectedHotspotPoints(router: OfflineRouter, hotspots: RouteAvoidanceHotspot[]) {
  return hotspots
    .map((hotspot) => ({
      hotspot,
      roadPoint: router.nearestRoadCoordinate(hotspot.coordinate),
    }))
    .filter(
      (item): item is { hotspot: RouteAvoidanceHotspot; roadPoint: Coordinate } =>
        item.roadPoint !== null,
    )
}

function farEnoughApart(pointA: Coordinate, pointB: Coordinate) {
  const lngDelta = Math.abs(pointA[0] - pointB[0])
  const latDelta = Math.abs(pointA[1] - pointB[1])
  return lngDelta + latDelta > 0.03
}

export function pickBusyDemoPoints(
  router: OfflineRouter,
  hotspots: RouteAvoidanceHotspot[],
): {
  startPoint: Coordinate
  endPoint: Coordinate
} | null {
  if (hotspots.length < 2) {
    return null
  }

  const pool = projectedHotspotPoints(
    router,
    [...hotspots].sort((left, right) => right.penalty - left.penalty).slice(0, Math.min(12, hotspots.length)),
  )

  if (pool.length < 2) {
    return null
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const startCandidate = pool[Math.floor(Math.random() * pool.length)]
    const endCandidate = pool[Math.floor(Math.random() * pool.length)]

    if (startCandidate.hotspot.label === endCandidate.hotspot.label) {
      continue
    }

    if (!farEnoughApart(startCandidate.roadPoint, endCandidate.roadPoint)) {
      continue
    }

    const candidateRoute = router.route(startCandidate.roadPoint, endCandidate.roadPoint)
    if (!candidateRoute || candidateRoute.distanceMeters < 2500) {
      continue
    }

    return {
      startPoint: startCandidate.roadPoint,
      endPoint: endCandidate.roadPoint,
    }
  }

  return {
    startPoint: pool[0].roadPoint,
    endPoint: pool[pool.length - 1].roadPoint,
  }
}
