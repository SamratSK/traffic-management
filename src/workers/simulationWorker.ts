import { OfflineRouter } from '../lib/router'
import { metersBetween } from '../lib/geo'
import { buildSignalRuntimeCollection } from '../lib/signalSystem'
import { buildRouteMetrics, findRouteSegmentIndex, samplePositionAlongRoute } from '../lib/vehicle'
import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import type { Coordinate, RouteResult } from '../types/offline'
import type {
  ScenarioIncident,
  ScenarioProcession,
  ScenarioVehicleHotspot,
  SignalRuntimeCollection,
  SignalSourceCollection,
  SimulationLiveStats,
} from '../types/runtime'
import type {
  SimVehicleRouteVisible,
  SimVehicleVisible,
  SimulationSnapshot,
  VehiclePlan,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from '../types/simulation'
import {
  buildReservationMap,
  buildTrafficDistributionHotspots,
  chooseManagedRoute,
  buildScenarioAvoidanceHotspots,
  stabilizeTrafficHotspots,
} from './trafficControl'

type SimVehicle = {
  id: number
  baseSpeedKph: number
  currentSpeedKph: number
  start: Coordinate
  end: Coordinate
  currentPosition: Coordinate
  currentDistanceMeters: number
  route: RouteResult
  displayRoute: RouteResult
  routeMetrics: ReturnType<typeof buildRouteMetrics>
  targetIncidentId: string | null
  targetName: string
  rerouted: boolean
  arrived: boolean
  lastRerouteAt: number
  routeVariant: number
  routeSegmentIndex: number
  escapingClusterId: string | null
  breakoutWaypoint: Coordinate | null
  waypointQueue: Coordinate[]
  lastRouteEvaluationAt: number
}

const MAX_VISIBLE_ROUTES = 18
const SIMULATION_SPEED_MULTIPLIER = 7
const HOTSPOT_REROUTE_LOOKAHEAD_METERS = 140
const REROUTE_COOLDOWN_MS = 4200
const DIRECT_ROUTE_REEVALUATION_MS = 5600
const CLUSTER_ESCAPE_RADIUS_METERS = 520
const CLUSTER_ESCAPE_VARIANT_COUNT = 24
const CLUSTER_RELEASE_FACTOR = 1.35
const SIGNAL_LOOKAHEAD_METERS = 85
const SIGNAL_CAPTURE_RADIUS_METERS = 18
const SIGNAL_STOP_BUFFER_METERS = 10
const RAD_TO_DEG = 180 / Math.PI
const SNAPSHOT_EVERY_N_TICKS = 1

function normalizedAngleRadians(from: Coordinate, to: Coordinate) {
  return Math.atan2(to[1] - from[1], to[0] - from[0])
}

function normalizeAngleDelta(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function analyzeSignalTurnAtProjection(vehicle: SimVehicle, segmentIndex: number, projectionT: number) {
  if (segmentIndex < 1 || segmentIndex >= vehicle.routeMetrics.path.length) {
    return {
      turn: 'forward' as const,
      headingDegrees: 0,
    }
  }

  const segmentStartDistance = vehicle.routeMetrics.cumulativeDistances[segmentIndex - 1] ?? 0
  const segmentEndDistance = vehicle.routeMetrics.cumulativeDistances[segmentIndex] ?? segmentStartDistance
  const signalDistanceAlongRoute =
    segmentStartDistance + (segmentEndDistance - segmentStartDistance) * projectionT

  const incomingStart =
    samplePositionAlongRoute(
      vehicle.routeMetrics.path,
      vehicle.routeMetrics.cumulativeDistances,
      Math.max(0, signalDistanceAlongRoute - 32),
    ) ?? vehicle.routeMetrics.path[Math.max(0, segmentIndex - 1)]
  const incomingEnd =
    samplePositionAlongRoute(
      vehicle.routeMetrics.path,
      vehicle.routeMetrics.cumulativeDistances,
      Math.max(0, signalDistanceAlongRoute - 4),
    ) ?? vehicle.routeMetrics.path[segmentIndex - 1]
  const outgoingStart =
    samplePositionAlongRoute(
      vehicle.routeMetrics.path,
      vehicle.routeMetrics.cumulativeDistances,
      Math.min(vehicle.routeMetrics.totalDistanceMeters, signalDistanceAlongRoute + 4),
    ) ?? vehicle.routeMetrics.path[segmentIndex]
  const outgoingEnd =
    samplePositionAlongRoute(
      vehicle.routeMetrics.path,
      vehicle.routeMetrics.cumulativeDistances,
      Math.min(vehicle.routeMetrics.totalDistanceMeters, signalDistanceAlongRoute + 32),
    ) ?? vehicle.routeMetrics.path[Math.min(vehicle.routeMetrics.path.length - 1, segmentIndex + 1)]

  const incomingAngle = normalizedAngleRadians(incomingStart, incomingEnd)
  const outgoingAngle = normalizedAngleRadians(outgoingStart, outgoingEnd)
  const delta = normalizeAngleDelta(outgoingAngle - incomingAngle)
  const headingDegrees = outgoingAngle * RAD_TO_DEG

  if (Math.abs(delta) < Math.PI / 9) {
    return {
      turn: 'forward' as const,
      headingDegrees,
    }
  }

  return {
    turn: delta > 0 ? 'left' as const : 'right' as const,
    headingDegrees,
  }
}

function sectorOffsetFromVariant(variant: number) {
  if (variant === 0) {
    return 0
  }

  const step = Math.ceil(variant / 2)
  return variant % 2 === 1 ? step : -step
}

function directionalSectorIndex(origin: Coordinate, destination: Coordinate, variant: number) {
  const baseAngle = normalizedAngleRadians(origin, destination)
  const sectorAngle = (Math.PI * 2) / CLUSTER_ESCAPE_VARIANT_COUNT
  const baseSector = Math.round(baseAngle / sectorAngle)
  const offset = sectorOffsetFromVariant(variant)
  return ((baseSector + offset) % CLUSTER_ESCAPE_VARIANT_COUNT + CLUSTER_ESCAPE_VARIANT_COUNT) % CLUSTER_ESCAPE_VARIANT_COUNT
}

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

let router: OfflineRouter | null = null
let signals: SignalSourceCollection = { type: 'FeatureCollection', features: [] }
let signalRuntime: SignalRuntimeCollection = { type: 'FeatureCollection', features: [] }
let incidents: ScenarioIncident[] = []
let processions: ScenarioProcession[] = []
let vehicles: SimVehicle[] = []
const vehicleById = new Map<number, SimVehicle>()
let dynamicVehicleHotspots: ScenarioVehicleHotspot[] = []
let sharedReservations = new Map<string, number>()
const signalDirectionMemory = new Map<number, { glyph: '' | '↑' | '←' | '→'; headingDegrees: number; visibleUntil: number }>()
let rerouteQueue: number[] = []
let intervalId: number | null = null
let lastTickTimestamp = 0
let lastVehicleHotspotHash = ''
let tickCount = 0
let isRunning = false

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

function projectPointOntoSegment(point: Coordinate, start: Coordinate, end: Coordinate) {
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

  return {
    t,
    distanceMeters: Math.hypot(px - closestX, py - closestY),
  }
}

function routeIntersectsHotspot(route: RouteResult, hotspot: RouteAvoidanceHotspot) {
  for (let index = 1; index < route.coordinates.length; index += 1) {
    const distance = pointToSegmentDistanceMeters(
      hotspot.coordinate,
      route.coordinates[index - 1],
      route.coordinates[index],
    )

    if (distance <= hotspot.radiusMeters) {
      return true
    }
  }

  return false
}

function getNearbyVehicleCluster(vehicle: SimVehicle): ScenarioVehicleHotspot | null {
  let bestCluster: ScenarioVehicleHotspot | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  dynamicVehicleHotspots.forEach((hotspot) => {
    const distance = metersBetween(vehicle.currentPosition, hotspot.coordinate)
    if (distance <= hotspot.radiusMeters && distance < bestDistance) {
      bestCluster = hotspot
      bestDistance = distance
    }
  })

  return bestCluster
}

function buildHotspotsForVehicle(vehicle: SimVehicle, excludedHotspotSourceIds: string[] = []) {
  return buildScenarioAvoidanceHotspots(
    incidents,
    processions,
    dynamicVehicleHotspots,
    signalRuntime,
    vehicle.targetIncidentId,
    excludedHotspotSourceIds,
  )
}

function computeBreakoutWaypoint(cluster: ScenarioVehicleHotspot, vehicle: SimVehicle) {
  const currentRouter = router
  if (!currentRouter) {
    return null
  }

  const sector = directionalSectorIndex(cluster.coordinate, vehicle.end, vehicle.routeVariant)
  return currentRouter.findBreakoutCoordinate(
    cluster.coordinate,
    sector,
    CLUSTER_ESCAPE_VARIANT_COUNT,
    Math.max(cluster.radiusMeters * 1.1, 320),
    Math.max(CLUSTER_ESCAPE_RADIUS_METERS * 2.2, cluster.radiusMeters * 2.8),
  )
}

function buildVehicleRoute(
  vehicle: SimVehicle,
  targetCoordinate: Coordinate,
  options: { roadBias?: 'neutral' | 'prefer-local'; excludedHotspotSourceIds?: string[] } = {},
) {
  if (!router) {
    return null
  }

  const managed = chooseManagedRoute(
    router,
    {
      ...vehicle,
      end: targetCoordinate,
    },
    vehicles,
    incidents,
    processions,
    dynamicVehicleHotspots,
    signalRuntime,
    options.excludedHotspotSourceIds ?? [],
    sharedReservations,
  )

  if (managed) {
    return managed
  }

  const hotspots = buildHotspotsForVehicle(vehicle, options.excludedHotspotSourceIds ?? [])
  const fallbackRoute = router.route(vehicle.currentPosition, targetCoordinate, {
    hotspots,
    roadBias: options.roadBias ?? 'neutral',
  }) ?? router.route(vehicle.currentPosition, targetCoordinate)

  if (!fallbackRoute) {
    return null
  }

  return {
    route: fallbackRoute,
    displayRoute: fallbackRoute,
    score: fallbackRoute.distanceMeters,
  }
}

function applyRouteToVehicle(vehicle: SimVehicle, route: { route: RouteResult; displayRoute: RouteResult }) {
  vehicle.route = route.route
  vehicle.displayRoute = route.displayRoute
  vehicle.routeMetrics = buildRouteMetrics(route.route.coordinates)
  vehicle.currentDistanceMeters = 0
  vehicle.routeSegmentIndex = vehicle.routeMetrics.path.length > 1 ? 1 : 0
  vehicle.currentPosition = route.route.coordinates[0] ?? vehicle.currentPosition
}

function rebuildVehicleIndex() {
  vehicleById.clear()
  vehicles.forEach((vehicle) => {
    vehicleById.set(vehicle.id, vehicle)
  })
}

function rebuildSharedReservations() {
  sharedReservations = buildReservationMap(vehicles)
}

function routeVehicle(vehicle: SimVehicle) {
  const currentRouter = router
  if (!currentRouter) {
    return false
  }

  const now = Date.now()
  if (now - vehicle.lastRerouteAt < REROUTE_COOLDOWN_MS) {
    return false
  }

  const nearbyCluster = getNearbyVehicleCluster(vehicle)
  if (nearbyCluster && vehicle.escapingClusterId === nearbyCluster.id) {
    return false
  }
  const breakoutWaypoint = nearbyCluster ? computeBreakoutWaypoint(nearbyCluster, vehicle) : null
  const targetCoordinate = breakoutWaypoint ?? vehicle.end
  const excludedHotspots = nearbyCluster ? [nearbyCluster.id] : []
  const rerouted = buildVehicleRoute(vehicle, targetCoordinate, {
    roadBias: nearbyCluster ? 'prefer-local' : 'neutral',
    excludedHotspotSourceIds: excludedHotspots,
  })

  if (!rerouted) {
    return false
  }

  vehicle.start = vehicle.currentPosition
  applyRouteToVehicle(vehicle, rerouted)
  vehicle.rerouted = true
  vehicle.lastRerouteAt = now
  vehicle.escapingClusterId = nearbyCluster?.id ?? null
  vehicle.breakoutWaypoint = breakoutWaypoint

  if (breakoutWaypoint) {
    const continuation = buildVehicleRoute(
      {
        ...vehicle,
        currentPosition: breakoutWaypoint,
        breakoutWaypoint: null,
        escapingClusterId: null,
        waypointQueue: [],
      },
      vehicle.end,
      {
        roadBias: 'neutral',
        excludedHotspotSourceIds: excludedHotspots,
      },
    )

    if (continuation) {
      vehicle.displayRoute = combineRoutes(rerouted.route, continuation.displayRoute)
    }
  }

  return true
}

function tryRecoverDirectRoute(vehicle: SimVehicle, now: number) {
  if (vehicle.arrived || !vehicle.rerouted) {
    return false
  }

  if (now - vehicle.lastRouteEvaluationAt < DIRECT_ROUTE_REEVALUATION_MS) {
    return false
  }

  vehicle.lastRouteEvaluationAt = now

  const nearbyCluster = getNearbyVehicleCluster(vehicle)
  if (nearbyCluster) {
    return false
  }

  const directRoute = buildVehicleRoute(vehicle, vehicle.end, { roadBias: 'neutral' })
  if (!directRoute) {
    return false
  }

  const remainingDistance = Math.max(0, vehicle.routeMetrics.totalDistanceMeters - vehicle.currentDistanceMeters)
  const shouldRecover =
    vehicle.breakoutWaypoint !== null
    || vehicle.waypointQueue.length > 0
    || directRoute.displayRoute.distanceMeters + 40 < remainingDistance

  if (!shouldRecover) {
    return false
  }

  vehicle.start = vehicle.currentPosition
  applyRouteToVehicle(vehicle, directRoute)
  vehicle.breakoutWaypoint = null
  vehicle.waypointQueue = []
  vehicle.escapingClusterId = null
  vehicle.lastRerouteAt = now

  return true
}

function refreshSignalRuntime(now: number) {
  signalRuntime = buildSignalRuntimeCollection(
    signals,
    incidents,
    processions,
    dynamicVehicleHotspots,
    vehicles.filter((vehicle) => !vehicle.arrived).map((vehicle) => vehicle.currentPosition),
    now,
  )
  annotateSignalDirections()
}

function annotateSignalDirections() {
  const now = Date.now()
  signalRuntime.features.forEach((feature) => {
    const signalCoordinate = feature.geometry.coordinates as Coordinate
    let nearestArrow: '' | '↑' | '←' | '→' = ''
    let nearestHeadingDegrees = 0
    let nearestDistance = Number.POSITIVE_INFINITY

    vehicles.forEach((vehicle) => {
      if (vehicle.arrived || metersBetween(vehicle.currentPosition, signalCoordinate) > SIGNAL_LOOKAHEAD_METERS + 40) {
        return
      }

      const startIndex = Math.max(1, vehicle.routeSegmentIndex)
      for (let index = startIndex; index < vehicle.routeMetrics.path.length; index += 1) {
        const segmentStartDistance = vehicle.routeMetrics.cumulativeDistances[index - 1] ?? 0
        const segmentEndDistance = vehicle.routeMetrics.cumulativeDistances[index] ?? 0

        if (segmentEndDistance < vehicle.currentDistanceMeters - 2) {
          continue
        }

        if (segmentStartDistance > vehicle.currentDistanceMeters + SIGNAL_LOOKAHEAD_METERS) {
          break
        }

        const start = vehicle.routeMetrics.path[index - 1]
        const end = vehicle.routeMetrics.path[index]
        const projection = projectPointOntoSegment(signalCoordinate, start, end)
        if (projection.distanceMeters > SIGNAL_CAPTURE_RADIUS_METERS) {
          continue
        }

        const distanceAlongRoute =
          segmentStartDistance + (segmentEndDistance - segmentStartDistance) * projection.t
        const distanceAheadMeters = distanceAlongRoute - vehicle.currentDistanceMeters
        if (distanceAheadMeters < 0 || distanceAheadMeters > SIGNAL_LOOKAHEAD_METERS) {
          continue
        }

        const turnAnalysis = analyzeSignalTurnAtProjection(vehicle, index, projection.t)
        let glyph: '' | '↑' | '←' | '→' = ''
        if (turnAnalysis.turn === 'forward' && feature.properties.allowForward) {
          glyph = '↑'
        } else if (turnAnalysis.turn === 'left' && feature.properties.allowLeft) {
          glyph = '←'
        } else if (turnAnalysis.turn === 'right' && feature.properties.allowRight) {
          glyph = '→'
        }

        if (glyph && distanceAheadMeters < nearestDistance) {
          nearestDistance = distanceAheadMeters
          nearestArrow = glyph
          nearestHeadingDegrees = turnAnalysis.headingDegrees
        }
        break
      }
    })

    const signalId = feature.properties.signalId
    const remembered = signalDirectionMemory.get(signalId)

    if (nearestArrow) {
      signalDirectionMemory.set(signalId, {
        glyph: nearestArrow,
        headingDegrees: nearestHeadingDegrees,
        visibleUntil: now + 3000,
      })
      feature.properties.directionLabel = nearestArrow
      feature.properties.directionAngle = nearestHeadingDegrees
      return
    }

    if (remembered && remembered.visibleUntil > now) {
      feature.properties.directionLabel = remembered.glyph
      feature.properties.directionAngle = remembered.headingDegrees
      return
    }

    signalDirectionMemory.delete(signalId)
    feature.properties.directionLabel = ''
    feature.properties.directionAngle = 0
  })
}

function findBlockingSignal(vehicle: SimVehicle): {
  signalId: number
  distanceAheadMeters: number
  signalState: 'hold' | 'stop'
} | null {
  let bestMatch: { signalId: number; distanceAheadMeters: number; signalState: 'hold' | 'stop' } | null = null

  signalRuntime.features.forEach((feature) => {
    if (!feature.properties.optimized) {
      return
    }

    const signalCoordinate = feature.geometry.coordinates as Coordinate
    if (metersBetween(vehicle.currentPosition, signalCoordinate) > SIGNAL_LOOKAHEAD_METERS + 30) {
      return
    }

    const startIndex = Math.max(1, vehicle.routeSegmentIndex)
    for (let index = startIndex; index < vehicle.routeMetrics.path.length; index += 1) {
      const segmentStartDistance = vehicle.routeMetrics.cumulativeDistances[index - 1] ?? 0
      const segmentEndDistance = vehicle.routeMetrics.cumulativeDistances[index] ?? 0

      if (segmentEndDistance < vehicle.currentDistanceMeters - 2) {
        continue
      }

      if (segmentStartDistance > vehicle.currentDistanceMeters + SIGNAL_LOOKAHEAD_METERS) {
        break
      }

      const start = vehicle.routeMetrics.path[index - 1]
      const end = vehicle.routeMetrics.path[index]
      const projection = projectPointOntoSegment(signalCoordinate, start, end)
      if (projection.distanceMeters > SIGNAL_CAPTURE_RADIUS_METERS) {
        continue
      }

      const distanceAlongRoute =
        segmentStartDistance + (segmentEndDistance - segmentStartDistance) * projection.t
      const distanceAheadMeters = distanceAlongRoute - vehicle.currentDistanceMeters
      if (distanceAheadMeters < 0 || distanceAheadMeters > SIGNAL_LOOKAHEAD_METERS) {
        continue
      }

      const intendedTurn = analyzeSignalTurnAtProjection(vehicle, index, projection.t).turn
      const turnAllowed =
        (intendedTurn === 'forward' && feature.properties.allowForward)
        || (intendedTurn === 'left' && feature.properties.allowLeft)
        || (intendedTurn === 'right' && feature.properties.allowRight)

      let effectiveState: 'hold' | 'stop' | null = null
      if (!turnAllowed) {
        effectiveState = 'stop'
      } else if (feature.properties.signalState === 'hold') {
        effectiveState = 'hold'
      } else if (feature.properties.signalState === 'stop') {
        effectiveState = 'stop'
      }

      if (!effectiveState) {
        break
      }

      if (!bestMatch || distanceAheadMeters < bestMatch.distanceAheadMeters) {
        bestMatch = {
          signalId: feature.properties.signalId,
          distanceAheadMeters,
          signalState: effectiveState,
        }
      }
      break
    }
  })

  return bestMatch
}

function buildRouteForSpawn(start: Coordinate, end: Coordinate, targetIncidentId: string | null, targetName: string) {
  const currentRouter = router
  if (!currentRouter) {
    return null
  }

  const routeSeedVehicle: SimVehicle = {
    id: -1,
    baseSpeedKph: 0,
    currentSpeedKph: 0,
    start,
    end,
    currentPosition: start,
    currentDistanceMeters: 0,
    route: { coordinates: [], distanceMeters: 0, visitedNodes: 0 },
    displayRoute: { coordinates: [], distanceMeters: 0, visitedNodes: 0 },
    routeMetrics: buildRouteMetrics([]),
    targetIncidentId,
    targetName,
    rerouted: false,
    arrived: false,
    lastRerouteAt: 0,
    routeVariant: 0,
    routeSegmentIndex: 0,
    escapingClusterId: null,
    breakoutWaypoint: null,
    waypointQueue: [],
    lastRouteEvaluationAt: 0,
  }

  const route = buildVehicleRoute(routeSeedVehicle, end)

  if (!route) {
    return null
  }

  return route
}

function createVehicleFromPlan(plan: VehiclePlan, index: number) {
  const vehicle: SimVehicle = {
    id: plan.id,
    baseSpeedKph: plan.speedKph,
    currentSpeedKph: 0,
    start: plan.start,
    end: plan.end,
    currentPosition: plan.start,
    currentDistanceMeters: 0,
    route: { coordinates: [], distanceMeters: 0, visitedNodes: 0 },
    displayRoute: { coordinates: [], distanceMeters: 0, visitedNodes: 0 },
    routeMetrics: buildRouteMetrics([]),
    targetIncidentId: plan.targetIncidentId,
    targetName: plan.targetName,
    rerouted: false,
    arrived: false,
    lastRerouteAt: 0,
    routeVariant: index % CLUSTER_ESCAPE_VARIANT_COUNT,
    routeSegmentIndex: 0,
    escapingClusterId: null,
    breakoutWaypoint: null,
    waypointQueue: [],
    lastRouteEvaluationAt: 0,
  }

  const route = buildVehicleRoute(vehicle, plan.end, { roadBias: 'neutral' })
    ?? buildRouteForSpawn(plan.start, plan.end, plan.targetIncidentId, plan.targetName)

  if (!route) {
    return null
  }

  applyRouteToVehicle(vehicle, route)

  return vehicle
}

function buildVehicleHotspots() {
  return buildTrafficDistributionHotspots(vehicles)
}

function densityHotspotHash(hotspots: ScenarioVehicleHotspot[]) {
  return hotspots
    .map((hotspot) => `${hotspot.id}:${hotspot.vehicleCount}:${hotspot.coordinate[0].toFixed(4)}:${hotspot.coordinate[1].toFixed(4)}`)
    .join('|')
}

function toVisibleVehicle(vehicle: SimVehicle): SimVehicleVisible {
  return {
    id: vehicle.id,
    position: vehicle.currentPosition,
    speedKph: vehicle.currentSpeedKph,
    rerouted: vehicle.rerouted,
    targetName: vehicle.targetName,
    breakoutWaypoint: vehicle.breakoutWaypoint,
    routeVariant: vehicle.routeVariant,
    escapingClusterId: vehicle.escapingClusterId,
  }
}

function toVisibleRoute(vehicle: SimVehicle): SimVehicleRouteVisible {
  return {
    id: vehicle.id,
    speedKph: vehicle.currentSpeedKph,
    start: vehicle.start,
    end: vehicle.end,
    route: vehicle.displayRoute,
    targetName: vehicle.targetName,
  }
}

function buildStats(): SimulationLiveStats {
  const movingVehicles = vehicles.filter((vehicle) => !vehicle.arrived)
  const averageSpeedKph =
    movingVehicles.length > 0
      ? movingVehicles.reduce((sum, vehicle) => sum + vehicle.currentSpeedKph, 0) / movingVehicles.length
      : 0

  return {
    fleetSize: vehicles.length,
    activeEvents: incidents.filter((incident) => incident.kind === 'event').length,
    activeHotspots: incidents.filter((incident) => incident.kind === 'hotspot').length,
    activeProcessions: processions.length,
    dynamicVehicleHotspots: dynamicVehicleHotspots.length,
    rerouteQueueSize: rerouteQueue.length,
    reroutedVehicles: vehicles.filter((vehicle) => vehicle.rerouted).length,
    arrivedVehicles: vehicles.filter((vehicle) => vehicle.arrived).length,
    averageSpeedKph,
  }
}

function postSnapshot() {
  const visibleVehicles = vehicles.filter((vehicle) => !vehicle.arrived)

  const visibleRoutes = [
    ...vehicles.filter((vehicle) => vehicle.rerouted).slice(0, 12),
    ...vehicles.filter((vehicle) => !vehicle.arrived).slice(0, MAX_VISIBLE_ROUTES),
  ]
    .slice(0, MAX_VISIBLE_ROUTES)
    .map(toVisibleRoute)

  const payload: SimulationSnapshot = {
    visibleVehicles: visibleVehicles.map(toVisibleVehicle),
    visibleRoutes,
    vehicleStates: vehicles.map((vehicle) => ({
      id: vehicle.id,
      arrived: vehicle.arrived,
      currentSpeedKph: vehicle.currentSpeedKph,
    })),
    vehicleHotspots: dynamicVehicleHotspots,
    signalRuntime,
    stats: buildStats(),
  }

  const message: SimulationWorkerResponse = {
    type: 'snapshot',
    payload,
  }

  self.postMessage(message)
}

function queueVehiclesForReroute(vehicleIds: number[]) {
  rerouteQueue = [...new Set([...rerouteQueue, ...vehicleIds])]
}

function resetFleet() {
  vehicles = []
  rebuildVehicleIndex()
  rebuildSharedReservations()
  dynamicVehicleHotspots = []
  rerouteQueue = []
  lastTickTimestamp = 0
  lastVehicleHotspotHash = ''
  isRunning = false
  refreshSignalRuntime(Date.now())
  postSnapshot()
}

function ensureTicker() {
  if (intervalId !== null) {
    return
  }

  intervalId = self.setInterval(() => {
    if (!router) {
      return
    }

    if (!isRunning) {
      return
    }

    const now = Date.now()
    if (lastTickTimestamp === 0) {
      lastTickTimestamp = now
      return
    }

    const deltaSeconds = Math.min(0.45, (now - lastTickTimestamp) / 1000)
    lastTickTimestamp = now
    tickCount += 1

    if (rerouteQueue.length > 0) {
      rebuildSharedReservations()
    }

    const rerouteBatch = rerouteQueue.splice(0, 48)
    rerouteBatch.forEach((vehicleId) => {
      const vehicle = vehicleById.get(vehicleId)
      if (!vehicle || vehicle.arrived) {
        return
      }

      routeVehicle(vehicle)
    })

    refreshSignalRuntime(now)

    vehicles.forEach((vehicle) => {
      if (vehicle.arrived) {
        return
      }

      const intendedAdvance = deltaSeconds * SIMULATION_SPEED_MULTIPLIER * (vehicle.baseSpeedKph / 3.6)
      const blockingSignal = findBlockingSignal(vehicle)
      const blockingDistanceAhead = blockingSignal?.distanceAheadMeters ?? null
      const signalStateAhead = blockingSignal?.signalState ?? null
      let nextDistance = vehicle.currentDistanceMeters + intendedAdvance

      if (blockingDistanceAhead !== null && signalStateAhead === 'stop') {
        const stopDistance = Math.max(
          vehicle.currentDistanceMeters,
          vehicle.currentDistanceMeters + blockingDistanceAhead - SIGNAL_STOP_BUFFER_METERS,
        )
        nextDistance = Math.min(nextDistance, stopDistance)
      } else if (blockingDistanceAhead !== null && signalStateAhead === 'hold') {
        const holdFactor = blockingDistanceAhead < 26 ? 0.2 : blockingDistanceAhead < 52 ? 0.45 : 0.7
        nextDistance = vehicle.currentDistanceMeters + intendedAdvance * holdFactor
      }

      vehicle.currentDistanceMeters = Math.min(nextDistance, vehicle.routeMetrics.totalDistanceMeters)
      vehicle.routeSegmentIndex = findRouteSegmentIndex(
        vehicle.routeMetrics.cumulativeDistances,
        vehicle.currentDistanceMeters,
        vehicle.routeSegmentIndex || 1,
      )
      vehicle.currentPosition =
        samplePositionAlongRoute(
          vehicle.routeMetrics.path,
          vehicle.routeMetrics.cumulativeDistances,
          vehicle.currentDistanceMeters,
        ) ?? vehicle.currentPosition

      const remainingDistance = vehicle.routeMetrics.totalDistanceMeters - vehicle.currentDistanceMeters
      if (
        blockingDistanceAhead !== null
        && signalStateAhead === 'stop'
        && blockingDistanceAhead <= SIGNAL_STOP_BUFFER_METERS + 2
      ) {
        vehicle.currentSpeedKph = 0
      } else if (blockingDistanceAhead !== null && signalStateAhead === 'hold') {
        vehicle.currentSpeedKph =
          Math.max(8, vehicle.baseSpeedKph * SIMULATION_SPEED_MULTIPLIER * (blockingDistanceAhead < 26 ? 0.2 : blockingDistanceAhead < 52 ? 0.45 : 0.7))
      } else {
        vehicle.currentSpeedKph =
          remainingDistance < 50
            ? Math.max(10, vehicle.baseSpeedKph * SIMULATION_SPEED_MULTIPLIER * 0.45)
            : vehicle.baseSpeedKph * SIMULATION_SPEED_MULTIPLIER
      }

      if (vehicle.escapingClusterId) {
        const escapeCluster = dynamicVehicleHotspots.find((hotspot) => hotspot.id === vehicle.escapingClusterId)
        if (!escapeCluster || metersBetween(vehicle.currentPosition, escapeCluster.coordinate) > escapeCluster.radiusMeters * CLUSTER_RELEASE_FACTOR) {
          vehicle.escapingClusterId = null
          vehicle.breakoutWaypoint = null
        }
      }

      if (!vehicle.breakoutWaypoint && vehicle.waypointQueue.length === 0) {
        tryRecoverDirectRoute(vehicle, now)
      }

      if (vehicle.currentDistanceMeters >= vehicle.routeMetrics.totalDistanceMeters - 1) {
        if (vehicle.breakoutWaypoint) {
          vehicle.currentPosition = vehicle.breakoutWaypoint
          vehicle.breakoutWaypoint = vehicle.waypointQueue.shift() ?? null
          if (!vehicle.breakoutWaypoint) {
            vehicle.escapingClusterId = null
          }
          queueVehiclesForReroute([vehicle.id])
          return
        }
        vehicle.currentPosition = vehicle.end
        vehicle.currentSpeedKph = 0
        vehicle.arrived = true
        vehicle.escapingClusterId = null
        vehicle.breakoutWaypoint = null
        vehicle.waypointQueue = []
        vehicle.currentDistanceMeters = vehicle.routeMetrics.totalDistanceMeters
      }
    })

    if (tickCount % 5 === 0) {
      const nextHotspots = stabilizeTrafficHotspots(dynamicVehicleHotspots, buildVehicleHotspots())
      const nextHash = densityHotspotHash(nextHotspots)
      if (nextHash !== lastVehicleHotspotHash) {
        dynamicVehicleHotspots = nextHotspots
        lastVehicleHotspotHash = nextHash

        const impactedVehicleIds = vehicles
          .filter((vehicle) => !vehicle.arrived)
          .filter((vehicle) =>
            nextHotspots.some((hotspot) =>
              metersBetween(vehicle.currentPosition, hotspot.coordinate) > HOTSPOT_REROUTE_LOOKAHEAD_METERS
                && routeIntersectsHotspot(vehicle.route, {
                  coordinate: hotspot.coordinate,
                  radiusMeters: hotspot.radiusMeters,
                  penalty: hotspot.penalty,
                  label: hotspot.id,
                  category: 'crowd',
                }),
            ),
          )
          .map((vehicle) => vehicle.id)

        queueVehiclesForReroute(impactedVehicleIds)
      }
    }

    if (tickCount % SNAPSHOT_EVERY_N_TICKS === 0) {
      postSnapshot()
    }
  }, 200)
}

function spawnFleet(count: number, sameStartPoint: boolean, sameEndPoint: boolean) {
  if (!router) {
    return
  }

  vehicles = []
  dynamicVehicleHotspots = []
  rebuildSharedReservations()
  rerouteQueue = []
  lastVehicleHotspotHash = ''

  const sharedStart = sameStartPoint ? router.randomRoadCoordinate() : null
  const sharedEnd = sameEndPoint ? router.randomRoadCoordinate() : null

  for (let index = 0; index < count; index += 1) {
    const start = sharedStart ?? router.randomRoadCoordinate()
    const end = sharedEnd ?? router.randomRoadCoordinate()
    if (!start || !end) {
      continue
    }

    const vehicle: SimVehicle = {
      id: index + 1,
      baseSpeedKph: (38 + Math.floor(Math.random() * 38)) * 4,
      currentSpeedKph: 0,
      start,
      end,
      currentPosition: start,
      currentDistanceMeters: 0,
      route: { coordinates: [], distanceMeters: 0, visitedNodes: 0 },
      displayRoute: { coordinates: [], distanceMeters: 0, visitedNodes: 0 },
      routeMetrics: buildRouteMetrics([]),
      targetIncidentId: null,
      targetName: sameEndPoint ? 'Shared city route' : 'Random city route',
      rerouted: false,
      arrived: false,
      lastRerouteAt: sameStartPoint || sameEndPoint ? Date.now() - REROUTE_COOLDOWN_MS : 0,
      routeVariant: index % CLUSTER_ESCAPE_VARIANT_COUNT,
      routeSegmentIndex: 0,
      escapingClusterId: null,
      breakoutWaypoint: null,
      waypointQueue: [],
      lastRouteEvaluationAt: 0,
    }

    const route = buildVehicleRoute(
      vehicle,
      end,
      { roadBias: 'neutral' },
    ) ?? buildRouteForSpawn(start, end, null, vehicle.targetName)

    if (!route) {
      continue
    }

    applyRouteToVehicle(vehicle, route)

    vehicles.push(vehicle)
  }

  rebuildVehicleIndex()
  rebuildSharedReservations()
  refreshSignalRuntime(Date.now())
  postSnapshot()
}

function setFleet(plans: VehiclePlan[]) {
  if (!router) {
    return
  }

  vehicles = []
  dynamicVehicleHotspots = []
  rebuildSharedReservations()
  rerouteQueue = []
  lastVehicleHotspotHash = ''
  isRunning = false
  lastTickTimestamp = 0

  plans.forEach((plan, index) => {
    const vehicle = createVehicleFromPlan(plan, index)
    if (vehicle) {
      vehicles.push(vehicle)
    }
  })

  rebuildVehicleIndex()
  rebuildSharedReservations()
  refreshSignalRuntime(Date.now())
  postSnapshot()
}

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const message = event.data

  switch (message.type) {
    case 'init': {
      router = new OfflineRouter(message.graph)
      signals = message.signals
      refreshSignalRuntime(Date.now())
      ensureTicker()
      postSnapshot()
      break
    }
    case 'sync-scenario': {
      incidents = message.incidents
      processions = message.processions
      queueVehiclesForReroute(vehicles.map((vehicle) => vehicle.id))
      refreshSignalRuntime(Date.now())
      postSnapshot()
      break
    }
    case 'spawn-fleet': {
      spawnFleet(message.count, message.sameStartPoint, message.sameEndPoint)
      break
    }
    case 'set-fleet': {
      setFleet(message.vehicles)
      break
    }
    case 'get-vehicle-route': {
      const vehicle = vehicleById.get(message.vehicleId)
      const response: SimulationWorkerResponse = {
        type: 'vehicle-route',
        vehicleId: message.vehicleId,
        route: vehicle?.displayRoute ?? null,
      }
      self.postMessage(response)
      break
    }
    case 'set-running': {
      isRunning = message.running
      lastTickTimestamp = 0
      postSnapshot()
      break
    }
    case 'reset-fleet': {
      resetFleet()
      break
    }
  }
}
