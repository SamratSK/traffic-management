import type { Coordinate } from '../types/offline'

export function metersBetween(pointA: Coordinate, pointB: Coordinate) {
  const latFactor = 111_320
  const averageLatRadians = ((pointA[1] + pointB[1]) / 2) * (Math.PI / 180)
  const lngFactor = Math.cos(averageLatRadians) * latFactor
  const dx = (pointB[0] - pointA[0]) * lngFactor
  const dy = (pointB[1] - pointA[1]) * latFactor

  return Math.hypot(dx, dy)
}

export function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1_000) {
    return `${Math.round(distanceMeters)} m`
  }

  return `${(distanceMeters / 1_000).toFixed(2)} km`
}

export function bucketKey(point: Coordinate, precision = 0.01) {
  const lngBucket = Math.round(point[0] / precision)
  const latBucket = Math.round(point[1] / precision)
  return `${lngBucket}:${latBucket}`
}
