import { metersBetween, bucketKey } from '../lib/geo'
import { buildRouteMetrics, samplePositionAlongRoute } from '../lib/vehicle'
import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import type { Coordinate, RouteResult } from '../types/offline'
import type { ScenarioIncident, ScenarioProcession, ScenarioVehicleHotspot, SignalRuntimeCollection } from '../types/runtime'

type TrafficVehicleLike = {
  id: number
  end: Coordinate
  currentPosition: Coordinate
  currentDistanceMeters: number
  route: RouteResult
  displayRoute: RouteResult
  routeMetrics: ReturnType<typeof buildRouteMetrics>
  targetIncidentId: string | null
  targetName: string
  routeVariant: number
  arrived: boolean
}

type RoutingContext = {
  route: (start: Coordinate, end: Coordinate, options?: {
    hotspots?: RouteAvoidanceHotspot[]
    roadBias?: 'neutral' | 'prefer-local'
  }) => RouteResult | null
  findDirectionalLaunchCoordinate: (
    origin: Coordinate,
    destination: Coordinate,
    variant: number,
    variantCount: number,
    minRadiusMeters: number,
    maxRadiusMeters: number,
  ) => Coordinate | null
}

type WorkerHotspot = RouteAvoidanceHotspot & {
  sourceId: string
}

type CandidateRoute = {
  route: RouteResult
  displayRoute: RouteResult
  score: number
}

const CURRENT_CLUSTER_BUCKET = 0.0033
const CURRENT_CLUSTER_MERGE_METERS = 240
const ROUTE_PRESSURE_BUCKET = 0.0026
const ROUTE_PRESSURE_MERGE_METERS = 210
const ROUTE_PRESSURE_SAMPLE_STEP_METERS = 180
const ROUTE_PRESSURE_LOOKAHEAD_METERS = 1_800
const ROUTE_RESERVATION_SAMPLE_STEP_METERS = 160
const ROUTE_VARIANT_COUNT = 7

function combineRoutes(firstRoute: RouteResult, secondRoute: RouteResult): RouteResult {
  return {
    coordinates: [
      ...firstRoute.coordinates,
      ...secondRoute.coordinates.slice(1),
    ],
    distanceMeters: firstRoute.distanceMeters + secondRoute.distanceMeters,
    visitedNodes: firstRoute.visitedNodes + secondRoute.visitedNodes,
  }
}

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

function routePenaltyFromHotspots(route: RouteResult, hotspots: RouteAvoidanceHotspot[]) {
  if (hotspots.length === 0) {
    return 0
  }

  let totalPenalty = 0

  for (let routeIndex = 1; routeIndex < route.coordinates.length; routeIndex += 1) {
    const start = route.coordinates[routeIndex - 1]
    const end = route.coordinates[routeIndex]
    const segmentLength = metersBetween(start, end)

    hotspots.forEach((hotspot) => {
      const distance = pointToSegmentDistanceMeters(hotspot.coordinate, start, end)
      if (distance > hotspot.radiusMeters) {
        return
      }

      const influence = 1 - distance / hotspot.radiusMeters
      totalPenalty += segmentLength * hotspot.penalty * influence
    })
  }

  return totalPenalty
}

function buildReservationMap(vehicles: TrafficVehicleLike[], excludedVehicleId: number) {
  const reservations = new Map<string, number>()

  vehicles
    .filter((vehicle) => !vehicle.arrived && vehicle.id !== excludedVehicleId)
    .forEach((vehicle) => {
      const maxDistance = Math.min(
        vehicle.routeMetrics.totalDistanceMeters,
        vehicle.currentDistanceMeters + ROUTE_PRESSURE_LOOKAHEAD_METERS,
      )

      for (
        let distance = Math.max(vehicle.currentDistanceMeters, 0);
        distance <= maxDistance;
        distance += ROUTE_RESERVATION_SAMPLE_STEP_METERS
      ) {
        const coordinate = samplePositionAlongRoute(
          vehicle.routeMetrics.path,
          vehicle.routeMetrics.cumulativeDistances,
          distance,
        )
        if (!coordinate) {
          continue
        }

        const weight = 1 - ((distance - vehicle.currentDistanceMeters) / Math.max(ROUTE_PRESSURE_LOOKAHEAD_METERS, 1)) * 0.55
        const key = bucketKey(coordinate, ROUTE_PRESSURE_BUCKET)
        reservations.set(key, (reservations.get(key) ?? 0) + Math.max(0.22, weight))
      }
    })

  return reservations
}

function routeReservationPenalty(route: RouteResult, reservations: Map<string, number>) {
  if (reservations.size === 0) {
    return 0
  }

  const metrics = buildRouteMetrics(route.coordinates)
  let penalty = 0

  for (let distance = 0; distance <= metrics.totalDistanceMeters; distance += ROUTE_RESERVATION_SAMPLE_STEP_METERS) {
    const coordinate = samplePositionAlongRoute(metrics.path, metrics.cumulativeDistances, distance)
    if (!coordinate) {
      continue
    }

    const key = bucketKey(coordinate, ROUTE_PRESSURE_BUCKET)
    const reservation = reservations.get(key)
    if (!reservation) {
      continue
    }

    penalty += reservation * 135
  }

  return penalty
}

function scoreCandidateRoute(
  route: RouteResult,
  hotspots: RouteAvoidanceHotspot[],
  reservations: Map<string, number>,
) {
  return route.distanceMeters
    + routePenaltyFromHotspots(route, hotspots)
    + routeReservationPenalty(route, reservations)
}

function buildCandidateOptions(
  routingContext: RoutingContext,
  vehicle: TrafficVehicleLike,
  hotspots: RouteAvoidanceHotspot[],
  reservations: Map<string, number>,
) {
  const candidates: CandidateRoute[] = []

  const directNeutral = routingContext.route(vehicle.currentPosition, vehicle.end, {
    hotspots,
    roadBias: 'neutral',
  }) ?? routingContext.route(vehicle.currentPosition, vehicle.end)

  if (directNeutral) {
    candidates.push({
      route: directNeutral,
      displayRoute: directNeutral,
      score: scoreCandidateRoute(directNeutral, hotspots, reservations),
    })
  }

  const directLocal = routingContext.route(vehicle.currentPosition, vehicle.end, {
    hotspots,
    roadBias: 'prefer-local',
  })

  if (directLocal) {
    candidates.push({
      route: directLocal,
      displayRoute: directLocal,
      score: scoreCandidateRoute(directLocal, hotspots, reservations) - 30,
    })
  }

  for (let variantOffset = -2; variantOffset <= 2; variantOffset += 1) {
    const variant = ((vehicle.routeVariant + variantOffset) % ROUTE_VARIANT_COUNT + ROUTE_VARIANT_COUNT) % ROUTE_VARIANT_COUNT
    const launchCoordinate = routingContext.findDirectionalLaunchCoordinate(
      vehicle.currentPosition,
      vehicle.end,
      variant,
      ROUTE_VARIANT_COUNT,
      260,
      1_350,
    )

    if (!launchCoordinate) {
      continue
    }

    const launchRoute = routingContext.route(vehicle.currentPosition, launchCoordinate, {
      hotspots,
      roadBias: 'prefer-local',
    })
    const completionRoute = routingContext.route(launchCoordinate, vehicle.end, {
      hotspots,
      roadBias: 'neutral',
    }) ?? routingContext.route(launchCoordinate, vehicle.end)

    if (!launchRoute || !completionRoute) {
      continue
    }

    const combinedRoute = combineRoutes(launchRoute, completionRoute)
    const variantPenalty = Math.abs(variantOffset) * 18
    candidates.push({
      route: launchRoute,
      displayRoute: combinedRoute,
      score: scoreCandidateRoute(combinedRoute, hotspots, reservations) + variantPenalty,
    })
  }

  return candidates
}

function mergeCoordinateClusters(
  seeds: Array<{ key: string; coordinate: Coordinate; weight: number }>,
  mergeDistanceMeters: number,
) {
  const mergedClusters: Array<{ keys: string[]; coordinate: Coordinate; weight: number }> = []

  seeds.forEach((seed) => {
    const targetCluster = mergedClusters.find(
      (cluster) => metersBetween(cluster.coordinate, seed.coordinate) <= mergeDistanceMeters,
    )

    if (!targetCluster) {
      mergedClusters.push({
        keys: [seed.key],
        coordinate: seed.coordinate,
        weight: seed.weight,
      })
      return
    }

    const nextWeight = targetCluster.weight + seed.weight
    targetCluster.coordinate = [
      (targetCluster.coordinate[0] * targetCluster.weight + seed.coordinate[0] * seed.weight) / nextWeight,
      (targetCluster.coordinate[1] * targetCluster.weight + seed.coordinate[1] * seed.weight) / nextWeight,
    ]
    targetCluster.weight = nextWeight
    targetCluster.keys.push(seed.key)
  })

  return mergedClusters
}

function buildCurrentPositionHotspots(vehicles: TrafficVehicleLike[]) {
  const buckets = new Map<string, { coordinate: Coordinate; weight: number }>()

  vehicles
    .filter((vehicle) => {
      const remainingDistance = vehicle.routeMetrics.totalDistanceMeters - vehicle.currentDistanceMeters
      return !vehicle.arrived && vehicle.currentDistanceMeters >= 140 && remainingDistance >= 140
    })
    .forEach((vehicle) => {
      const key = bucketKey(vehicle.currentPosition, CURRENT_CLUSTER_BUCKET)
      const existing = buckets.get(key)
      if (existing) {
        existing.coordinate = [
          (existing.coordinate[0] * existing.weight + vehicle.currentPosition[0]) / (existing.weight + 1),
          (existing.coordinate[1] * existing.weight + vehicle.currentPosition[1]) / (existing.weight + 1),
        ]
        existing.weight += 1
        return
      }

      buckets.set(key, {
        coordinate: vehicle.currentPosition,
        weight: 1,
      })
    })

  return mergeCoordinateClusters(
    [...buckets.entries()].map(([key, value]) => ({ key, coordinate: value.coordinate, weight: value.weight })),
    CURRENT_CLUSTER_MERGE_METERS,
  )
}

function buildProjectedRouteHotspots(vehicles: TrafficVehicleLike[]) {
  const buckets = new Map<string, { coordinate: Coordinate; weight: number }>()

  vehicles
    .filter((vehicle) => !vehicle.arrived)
    .forEach((vehicle) => {
      const maxDistance = Math.min(
        vehicle.routeMetrics.totalDistanceMeters,
        vehicle.currentDistanceMeters + ROUTE_PRESSURE_LOOKAHEAD_METERS,
      )

      for (
        let distance = Math.max(vehicle.currentDistanceMeters + ROUTE_PRESSURE_SAMPLE_STEP_METERS, ROUTE_PRESSURE_SAMPLE_STEP_METERS);
        distance <= maxDistance;
        distance += ROUTE_PRESSURE_SAMPLE_STEP_METERS
      ) {
        const coordinate = samplePositionAlongRoute(
          vehicle.routeMetrics.path,
          vehicle.routeMetrics.cumulativeDistances,
          distance,
        )
        if (!coordinate) {
          continue
        }

        const weight = 0.35 + (1 - ((distance - vehicle.currentDistanceMeters) / Math.max(ROUTE_PRESSURE_LOOKAHEAD_METERS, 1))) * 0.85
        const key = bucketKey(coordinate, ROUTE_PRESSURE_BUCKET)
        const existing = buckets.get(key)
        if (existing) {
          existing.coordinate = [
            (existing.coordinate[0] * existing.weight + coordinate[0] * weight) / (existing.weight + weight),
            (existing.coordinate[1] * existing.weight + coordinate[1] * weight) / (existing.weight + weight),
          ]
          existing.weight += weight
          continue
        }

        buckets.set(key, {
          coordinate,
          weight,
        })
      }
    })

  return mergeCoordinateClusters(
    [...buckets.entries()].map(([key, value]) => ({ key, coordinate: value.coordinate, weight: value.weight })),
    ROUTE_PRESSURE_MERGE_METERS,
  )
}

export function buildTrafficDistributionHotspots(vehicles: TrafficVehicleLike[]) {
  if (vehicles.length === 0) {
    return []
  }

  const currentClusters = buildCurrentPositionHotspots(vehicles)
  const routePressureClusters = buildProjectedRouteHotspots(vehicles)
  const threshold = Math.max(2, vehicles.length * 0.055)

  return [
    ...currentClusters
      .filter((cluster) => cluster.weight >= threshold)
      .map((cluster, index) => ({
        id: `traffic-live-${index}-${cluster.keys.join('_')}`,
        coordinate: cluster.coordinate,
        vehicleCount: Math.round(cluster.weight),
        vehicleShare: cluster.weight / vehicles.length,
        radiusMeters: 230 + cluster.weight * 24,
        penalty: 2.6 + (cluster.weight / vehicles.length) * 10,
      })),
    ...routePressureClusters
      .filter((cluster) => cluster.weight >= threshold * 1.4)
      .map((cluster, index) => ({
        id: `traffic-route-${index}-${cluster.keys.join('_')}`,
        coordinate: cluster.coordinate,
        vehicleCount: Math.round(cluster.weight),
        vehicleShare: cluster.weight / vehicles.length,
        radiusMeters: 180 + cluster.weight * 20,
        penalty: 1.6 + (cluster.weight / vehicles.length) * 8,
      })),
  ] satisfies ScenarioVehicleHotspot[]
}

export function stabilizeTrafficHotspots(
  previousHotspots: ScenarioVehicleHotspot[],
  nextHotspots: ScenarioVehicleHotspot[],
) {
  return nextHotspots.map((hotspot) => {
    const previous = previousHotspots.find(
      (candidate) => metersBetween(candidate.coordinate, hotspot.coordinate) <= Math.max(candidate.radiusMeters, hotspot.radiusMeters) * 0.65,
    )

    if (!previous) {
      return hotspot
    }

    return {
      ...hotspot,
      coordinate: [
        previous.coordinate[0] * 0.55 + hotspot.coordinate[0] * 0.45,
        previous.coordinate[1] * 0.55 + hotspot.coordinate[1] * 0.45,
      ] as Coordinate,
      radiusMeters: previous.radiusMeters * 0.58 + hotspot.radiusMeters * 0.42,
      penalty: previous.penalty * 0.6 + hotspot.penalty * 0.4,
      vehicleShare: previous.vehicleShare * 0.52 + hotspot.vehicleShare * 0.48,
      vehicleCount: Math.round(previous.vehicleCount * 0.52 + hotspot.vehicleCount * 0.48),
    }
  }) satisfies ScenarioVehicleHotspot[]
}

export function buildScenarioAvoidanceHotspots(
  incidents: ScenarioIncident[],
  processions: ScenarioProcession[],
  dynamicVehicleHotspots: ScenarioVehicleHotspot[],
  signalRuntime: SignalRuntimeCollection,
  targetIncidentId: string | null,
  excludedHotspotSourceIds: string[] = [],
) {
  const blockedIds = new Set<string>(excludedHotspotSourceIds)
  if (targetIncidentId) {
    blockedIds.add(targetIncidentId)
  }

  const hotspots: WorkerHotspot[] = [
    ...incidents.map((incident) => ({
      sourceId: incident.id,
      coordinate: incident.coordinate,
      radiusMeters: Math.max(160, incident.radiusKm * 1_000),
      penalty: incident.kind === 'event' ? 3.6 : 2.5,
      label: incident.name,
      category: incident.kind === 'event' ? 'event' as const : 'crowd' as const,
    })),
    ...processions.map((procession) => ({
      sourceId: procession.id,
      coordinate:
        procession.route.coordinates[Math.floor(procession.route.coordinates.length / 2)] ?? procession.start,
      radiusMeters: Math.max(220, procession.radiusKm * 1_000),
      penalty: 4.8,
      label: procession.name,
      category: 'event' as const,
    })),
    ...dynamicVehicleHotspots.map((hotspot) => ({
      sourceId: hotspot.id,
      coordinate: hotspot.coordinate,
      radiusMeters: hotspot.radiusMeters,
      penalty: hotspot.penalty,
      label: hotspot.id,
      category: 'crowd' as const,
    })),
    ...signalRuntime.features
      .filter((signal) => signal.properties.optimized && signal.properties.signalState !== 'go')
      .map((signal) => ({
        sourceId: `signal:${signal.properties.signalId}`,
        coordinate: signal.geometry.coordinates as Coordinate,
        radiusMeters: 110 + signal.properties.downstreamCongestion * 42,
        penalty: 1.15 + signal.properties.downstreamCongestion * 2.6 + Math.max(0, -signal.properties.balancingScore) * 1.8,
        label: `Signal ${signal.properties.signalId}`,
        category: 'live_traffic' as const,
      })),
  ]

  return hotspots.filter((hotspot) => !blockedIds.has(hotspot.sourceId))
}

export function chooseManagedRoute(
  routingContext: RoutingContext,
  vehicle: TrafficVehicleLike,
  vehicles: TrafficVehicleLike[],
  incidents: ScenarioIncident[],
  processions: ScenarioProcession[],
  dynamicVehicleHotspots: ScenarioVehicleHotspot[],
  signalRuntime: SignalRuntimeCollection,
  excludedHotspotSourceIds: string[] = [],
) {
  const hotspots = buildScenarioAvoidanceHotspots(
    incidents,
    processions,
    dynamicVehicleHotspots,
    signalRuntime,
    vehicle.targetIncidentId,
    excludedHotspotSourceIds,
  )
  const reservations = buildReservationMap(vehicles, vehicle.id)
  const candidates = buildCandidateOptions(routingContext, vehicle, hotspots, reservations)

  if (candidates.length === 0) {
    return null
  }

  candidates.sort((left, right) => left.score - right.score)
  return candidates[0]
}
