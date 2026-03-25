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

  for (let index = 1; index < cumulativeDistances.length; index += 1) {
    const segmentStartDistance = cumulativeDistances[index - 1]
    const segmentEndDistance = cumulativeDistances[index]

    if (distanceMeters <= segmentEndDistance) {
      const start = routePath[index - 1]
      const end = routePath[index]
      const segmentLength = segmentEndDistance - segmentStartDistance || 1
      const t = (distanceMeters - segmentStartDistance) / segmentLength

      return [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
      ] as Coordinate
    }
  }

  return routePath[routePath.length - 1]
}
