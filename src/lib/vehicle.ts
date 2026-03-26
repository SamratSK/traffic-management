import { metersBetween } from './geo'
import type { Coordinate } from '../types/offline'

export function buildRouteMetrics(path: Coordinate[]) {
  const cumulativeDistances = [0]
  let totalDistanceMeters = 0

  for (let index = 1; index < path.length; index += 1) {
    totalDistanceMeters += metersBetween(path[index - 1], path[index])
    cumulativeDistances.push(totalDistanceMeters)
  }

  return {
    path,
    cumulativeDistances,
    totalDistanceMeters,
  }
}

export function findRouteSegmentIndex(
  cumulativeDistances: number[],
  distanceMeters: number,
  hintIndex = 1,
) {
  const lastIndex = cumulativeDistances.length - 1
  if (lastIndex <= 0) {
    return 0
  }

  const clampedDistance = Math.max(0, distanceMeters)
  const boundedHintIndex = Math.min(Math.max(hintIndex, 1), lastIndex)
  const hintedStart = cumulativeDistances[boundedHintIndex - 1] ?? 0
  const hintedEnd = cumulativeDistances[boundedHintIndex] ?? hintedStart

  if (clampedDistance >= hintedStart && clampedDistance <= hintedEnd) {
    return boundedHintIndex
  }

  let low = 1
  let high = lastIndex

  if (clampedDistance > hintedEnd) {
    low = boundedHintIndex + 1
  } else if (clampedDistance < hintedStart) {
    high = boundedHintIndex - 1
  }

  while (low <= high) {
    const middle = (low + high) >> 1
    const segmentStartDistance = cumulativeDistances[middle - 1] ?? 0
    const segmentEndDistance = cumulativeDistances[middle] ?? segmentStartDistance

    if (clampedDistance < segmentStartDistance) {
      high = middle - 1
      continue
    }

    if (clampedDistance > segmentEndDistance) {
      low = middle + 1
      continue
    }

    return middle
  }

  return Math.min(lastIndex, Math.max(1, low))
}

export function samplePositionAlongRoute(
  routePath: Coordinate[],
  cumulativeDistances: number[],
  distanceMeters: number,
) {
  if (!routePath.length) {
    return null
  }

  if (distanceMeters <= 0) {
    return routePath[0]
  }

  const routeLength = cumulativeDistances[cumulativeDistances.length - 1] ?? 0
  if (distanceMeters >= routeLength) {
    return routePath[routePath.length - 1]
  }

  const index = findRouteSegmentIndex(cumulativeDistances, distanceMeters)
  const segmentStartDistance = cumulativeDistances[index - 1] ?? 0
  const segmentEndDistance = cumulativeDistances[index] ?? segmentStartDistance
  const start = routePath[index - 1]
  const end = routePath[index]
  const segmentLength = segmentEndDistance - segmentStartDistance || 1
  const t = (distanceMeters - segmentStartDistance) / segmentLength

  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ] as Coordinate
}
