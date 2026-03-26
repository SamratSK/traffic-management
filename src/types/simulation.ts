import type { Coordinate, RoadGraphFile, RouteResult } from './offline'
import type {
  ScenarioIncident,
  ScenarioProcession,
  ScenarioVehicleHotspot,
  SignalRuntimeCollection,
  SignalSourceCollection,
  SimulationLiveStats,
} from './runtime'

export type SimVehicleVisible = {
  id: number
  position: Coordinate
  speedKph: number
  rerouted: boolean
  targetName: string
  breakoutWaypoint: Coordinate | null
  routeVariant: number
  escapingClusterId: string | null
}

export type SimVehicleRouteVisible = {
  id: number
  speedKph: number
  start: Coordinate
  end: Coordinate
  route: RouteResult
  targetName: string
}

export type SimulationSnapshot = {
  visibleVehicles: SimVehicleVisible[]
  visibleRoutes: SimVehicleRouteVisible[]
  vehicleStates: Array<{
    id: number
    arrived: boolean
    currentSpeedKph: number
  }>
  vehicleHotspots: ScenarioVehicleHotspot[]
  signalRuntime: SignalRuntimeCollection
  stats: SimulationLiveStats
}

export type VehiclePlan = {
  id: number
  label: string
  start: Coordinate
  end: Coordinate
  speedKph: number
  targetName: string
  targetIncidentId: string | null
}

export type SimulationInitMessage = {
  type: 'init'
  graph: RoadGraphFile
  signals: SignalSourceCollection
}

export type SimulationSyncScenarioMessage = {
  type: 'sync-scenario'
  incidents: ScenarioIncident[]
  processions: ScenarioProcession[]
}

export type SimulationSpawnFleetMessage = {
  type: 'spawn-fleet'
  count: number
  sameStartPoint: boolean
  sameEndPoint: boolean
}

export type SimulationSetFleetMessage = {
  type: 'set-fleet'
  vehicles: VehiclePlan[]
}

export type SimulationGetVehicleRouteMessage = {
  type: 'get-vehicle-route'
  vehicleId: number
}

export type SimulationResetFleetMessage = {
  type: 'reset-fleet'
}

export type SimulationSetRunningMessage = {
  type: 'set-running'
  running: boolean
}

export type SimulationWorkerRequest =
  | SimulationInitMessage
  | SimulationSyncScenarioMessage
  | SimulationSpawnFleetMessage
  | SimulationSetFleetMessage
  | SimulationGetVehicleRouteMessage
  | SimulationSetRunningMessage
  | SimulationResetFleetMessage

export type SimulationSnapshotMessage = {
  type: 'snapshot'
  payload: SimulationSnapshot
}

export type SimulationVehicleRouteMessage = {
  type: 'vehicle-route'
  vehicleId: number
  route: RouteResult | null
}

export type SimulationWorkerResponse =
  | SimulationSnapshotMessage
  | SimulationVehicleRouteMessage
