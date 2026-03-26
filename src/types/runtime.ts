import type { FeatureCollection, Point } from 'geojson'

import type { Coordinate, RouteResult } from './offline'

export type ScenarioItemCategory =
  | 'religious'
  | 'institute'
  | 'cultural'
  | 'civic'
  | 'medical'
  | 'commercial'
  | 'crowd'
  | 'other'

export type ScenarioIncidentKind = 'event' | 'hotspot'
export type ScenarioEditorMode = 'inspect' | 'add-event' | 'add-hotspot' | 'draw-procession'

export type ScenarioIncident = {
  id: string
  kind: ScenarioIncidentKind
  name: string
  description: string
  category: ScenarioItemCategory
  coordinate: Coordinate
  radiusKm: number
  createdAt: number
}

export type ScenarioProcession = {
  id: string
  name: string
  description: string
  category: ScenarioItemCategory
  start: Coordinate
  end: Coordinate
  route: RouteResult
  radiusKm: number
  createdAt: number
}

export type ScenarioVehicleHotspot = {
  id: string
  coordinate: Coordinate
  vehicleCount: number
  vehicleShare: number
  radiusMeters: number
  penalty: number
}

export type SignalPhase = 'go' | 'hold' | 'stop'

export type SignalSourceProperties = {
  signalId: number
  kind: string
}

export type SignalSourceCollection = FeatureCollection<Point, SignalSourceProperties>

export type SignalRuntimeProperties = {
  signalId: number
  kind: string
  signalState: SignalPhase
  optimized: boolean
  cycleSeconds: number
  greenRatio: number
  demandScore: number
  downstreamCongestion: number
  balancingScore: number
  allowForward: boolean
  allowLeft: boolean
  allowRight: boolean
  directionLabel: string
  directionAngle: number
  signalOpacity: number
}

export type SignalRuntimeCollection = FeatureCollection<Point, SignalRuntimeProperties>

export type SimulationLiveStats = {
  fleetSize: number
  activeEvents: number
  activeHotspots: number
  activeProcessions: number
  dynamicVehicleHotspots: number
  rerouteQueueSize: number
  reroutedVehicles: number
  arrivedVehicles: number
  averageSpeedKph: number
}
