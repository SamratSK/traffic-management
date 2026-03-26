import type { OfflineRouter } from './router'
import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import type { Coordinate } from '../types/offline'

type DemoPointPair = {
  startPoint: Coordinate
  endPoint: Coordinate
}

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

function expandedRoadCandidates(router: OfflineRouter, hotspots: RouteAvoidanceHotspot[]) {
  const offsets = [
    [0, 0],
    [0.003, 0],
    [-0.003, 0],
    [0, 0.003],
    [0, -0.003],
    [0.004, 0.002],
    [-0.004, 0.002],
    [0.004, -0.002],
    [-0.004, -0.002],
    [0.006, 0],
    [-0.006, 0],
  ] as const

  const seen = new Set<string>()
  const candidates: Array<{ hotspot: RouteAvoidanceHotspot; roadPoint: Coordinate }> = []

  for (const hotspot of hotspots) {
    for (const [lngOffset, latOffset] of offsets) {
      const snapped = router.nearestRoadCoordinate([
        hotspot.coordinate[0] + lngOffset,
        hotspot.coordinate[1] + latOffset,
      ])

      if (!snapped) {
        continue
      }

      const key = coordinateKey(snapped)
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      candidates.push({
        hotspot,
        roadPoint: snapped,
      })
    }
  }

  return candidates
}

function farEnoughApart(pointA: Coordinate, pointB: Coordinate) {
  const lngDelta = Math.abs(pointA[0] - pointB[0])
  const latDelta = Math.abs(pointA[1] - pointB[1])
  return lngDelta + latDelta > 0.03
}

function coordinateKey([lng, lat]: Coordinate) {
  return `${lng.toFixed(5)}:${lat.toFixed(5)}`
}

export function pickBusyDemoPoints(
  router: OfflineRouter,
  hotspots: RouteAvoidanceHotspot[],
): DemoPointPair | null {
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

export function pickBusyDemoFleetPoints(
  router: OfflineRouter,
  hotspots: RouteAvoidanceHotspot[],
  vehicleCount: number,
): DemoPointPair[] {
  if (vehicleCount <= 0 || hotspots.length < 2) {
    return []
  }

  const pool = projectedHotspotPoints(
    router,
    [...hotspots].sort((left, right) => right.penalty - left.penalty).slice(0, Math.min(24, hotspots.length)),
  )

  if (pool.length < 2) {
    return []
  }

  const uniqueStarts = new Map<string, Coordinate>()
  for (const item of expandedRoadCandidates(router, [...hotspots].sort((left, right) => right.penalty - left.penalty))) {
    uniqueStarts.set(coordinateKey(item.roadPoint), item.roadPoint)
  }

  const startCandidates = [...uniqueStarts.values()]
  const endCandidates = pool.map((item) => item.roadPoint)
  const results: DemoPointPair[] = []
  const usedStartKeys = new Set<string>()

  const sharedVehicles = Math.min(
    Math.max(0, Math.round(vehicleCount * 0.1)),
    Math.max(0, vehicleCount - 1),
  )
  const sharedGroupCount = sharedVehicles > 0 ? Math.min(3, Math.max(1, Math.ceil(sharedVehicles / 3))) : 0
  const sharedEnds = Array.from({ length: sharedGroupCount }, (_, index) => endCandidates[index % endCandidates.length])

  for (let vehicleIndex = 0; vehicleIndex < vehicleCount; vehicleIndex += 1) {
    let pair: DemoPointPair | null = null
    const forcedSharedEnd = vehicleIndex < sharedVehicles && sharedEnds.length > 0
      ? sharedEnds[vehicleIndex % sharedEnds.length]
      : null

    for (let attempt = 0; attempt < 80; attempt += 1) {
      const availableStarts = startCandidates.filter((point) => !usedStartKeys.has(coordinateKey(point)))
      if (availableStarts.length === 0) {
        break
      }

      const startPoint = availableStarts[Math.floor(Math.random() * availableStarts.length)]
      const endPoint = forcedSharedEnd ?? endCandidates[Math.floor(Math.random() * endCandidates.length)]

      if (coordinateKey(startPoint) === coordinateKey(endPoint)) {
        continue
      }

      if (!farEnoughApart(startPoint, endPoint)) {
        continue
      }

      const candidateRoute = router.route(startPoint, endPoint)
      if (!candidateRoute || candidateRoute.distanceMeters < 2500) {
        continue
      }

      pair = { startPoint, endPoint }
      break
    }

    if (!pair) {
      continue
    }

    usedStartKeys.add(coordinateKey(pair.startPoint))
    results.push(pair)
  }

  return results
}
