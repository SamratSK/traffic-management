import type { FeatureCollection, LineString } from 'geojson'

import { metersBetween } from './geo'
import type { Coordinate, TrafficRoadProperties } from '../types/offline'
import type { SimVehicleRouteVisible, SimVehicleVisible } from '../types/simulation'

export type SignalCameraRoad = {
  id: string
  coordinates: Coordinate[]
  roadClass: 'main' | 'sub'
}

export type SignalCameraVehicle = {
  id: number
  coordinates: Coordinate[]
  speedKph: number
  currentPosition: Coordinate
}

export type SignalCameraSceneData = {
  center: Coordinate
  roads: SignalCameraRoad[]
  vehicles: SignalCameraVehicle[]
}

const SIGNAL_SCENE_RADIUS_METERS = 120
const SIGNAL_SCENE_ROUTE_WINDOW_METERS = 165

function pointToSegmentDistanceMeters(point: Coordinate, start: Coordinate, end: Coordinate) {
  const lngScale = 109_000
  const latScale = 111_320
  const px = point[0] * lngScale
  const py = point[1] * latScale
  const sx = start[0] * lngScale
  const sy = start[1] * latScale
  const ex = end[0] * lngScale
  const ey = end[1] * latScale
  const dx = ex - sx
  const dy = ey - sy
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared))
  const closestX = sx + t * dx
  const closestY = sy + t * dy

  return Math.hypot(px - closestX, py - closestY)
}

function routeIntersectsRadius(coordinates: Coordinate[], center: Coordinate, radiusMeters: number) {
  for (let index = 1; index < coordinates.length; index += 1) {
    if (pointToSegmentDistanceMeters(center, coordinates[index - 1], coordinates[index]) <= radiusMeters) {
      return true
    }
  }

  return false
}

function findNearestRouteDistance(coordinates: Coordinate[], point: Coordinate) {
  let cumulative = 0
  let bestDistanceAlongRoute = 0
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]
    const end = coordinates[index]
    const segmentLength = metersBetween(start, end)
    const distance = pointToSegmentDistanceMeters(point, start, end)
    if (distance < bestDistance) {
      bestDistance = distance
      bestDistanceAlongRoute = cumulative
    }
    cumulative += segmentLength
  }

  return bestDistanceAlongRoute
}

function sliceRouteAroundDistance(coordinates: Coordinate[], targetDistance: number, windowMeters: number) {
  if (coordinates.length <= 2) {
    return coordinates
  }

  let cumulative = 0
  const startDistance = Math.max(0, targetDistance - windowMeters)
  const endDistance = targetDistance + windowMeters
  const collected: Coordinate[] = [coordinates[0]]

  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]
    const end = coordinates[index]
    const segmentLength = metersBetween(start, end)
    const nextCumulative = cumulative + segmentLength

    if (nextCumulative >= startDistance && cumulative <= endDistance) {
      if (collected[collected.length - 1] !== start) {
        collected.push(start)
      }
      collected.push(end)
    }

    cumulative = nextCumulative
  }

  return collected.length >= 2 ? collected : coordinates
}

export function buildSignalCameraSceneData(
  signalCoordinate: Coordinate,
  trafficLevels: FeatureCollection<LineString, TrafficRoadProperties>,
  visibleRoutes: SimVehicleRouteVisible[],
  visibleVehicles: SimVehicleVisible[],
): SignalCameraSceneData {
  const roads = trafficLevels.features
    .filter((feature) => routeIntersectsRadius(feature.geometry.coordinates as Coordinate[], signalCoordinate, SIGNAL_SCENE_RADIUS_METERS))
    .slice(0, 18)
    .map((feature, index) => ({
      id: `${feature.properties.roadName}-${index}`,
      coordinates: feature.geometry.coordinates as Coordinate[],
      roadClass: feature.properties.roadClass,
    }))

  const vehicleById = new Map(visibleVehicles.map((vehicle) => [vehicle.id, vehicle]))
  const vehicles = visibleRoutes
    .filter((route) => routeIntersectsRadius(route.route.coordinates, signalCoordinate, SIGNAL_SCENE_RADIUS_METERS))
    .map((route) => {
      const vehicle = vehicleById.get(route.id)
      if (!vehicle) {
        return null
      }

      const nearestDistance = findNearestRouteDistance(route.route.coordinates, vehicle.position)
      return {
        id: route.id,
        coordinates: sliceRouteAroundDistance(route.route.coordinates, nearestDistance, SIGNAL_SCENE_ROUTE_WINDOW_METERS),
        speedKph: vehicle.speedKph,
        currentPosition: vehicle.position,
      }
    })
    .filter((vehicle): vehicle is SignalCameraVehicle => vehicle !== null)
    .slice(0, 12)

  return {
    center: signalCoordinate,
    roads,
    vehicles,
  }
}
