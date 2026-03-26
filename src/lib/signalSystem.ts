import { metersBetween } from './geo'
import type { Coordinate } from '../types/offline'
import type {
  ScenarioIncident,
  ScenarioProcession,
  ScenarioVehicleHotspot,
  SignalRuntimeCollection,
  SignalRuntimeProperties,
  SignalSourceCollection,
} from '../types/runtime'

type VehicleDemandSource = {
  coordinate: Coordinate
  weight: number
}

type DemandSource = {
  coordinate: Coordinate
  radiusMeters: number
  weight: number
}

function demandFromIncidents(incidents: ScenarioIncident[]): DemandSource[] {
  return incidents.map((incident) => ({
    coordinate: incident.coordinate,
    radiusMeters: Math.max(180, incident.radiusKm * 1_000),
    weight: incident.kind === 'event' ? 1.45 : 1.05,
  }))
}

function demandFromProcessions(processions: ScenarioProcession[]): DemandSource[] {
  return processions.map((procession) => ({
    coordinate:
      procession.route.coordinates[Math.floor(procession.route.coordinates.length / 2)] ?? procession.start,
    radiusMeters: Math.max(220, procession.radiusKm * 1_000),
    weight: 1.8,
  }))
}

function demandFromVehicleHotspots(vehicleHotspots: ScenarioVehicleHotspot[]): DemandSource[] {
  return vehicleHotspots.map((hotspot) => ({
    coordinate: hotspot.coordinate,
    radiusMeters: hotspot.radiusMeters,
    weight: 1.2 + hotspot.vehicleShare * 6,
  }))
}

function computeDemandScore(coordinate: Coordinate, demandSources: DemandSource[]) {
  return demandSources.reduce((score, demand) => {
    const distance = metersBetween(coordinate, demand.coordinate)
    if (distance > demand.radiusMeters) {
      return score
    }

    return score + demand.weight * (1 - distance / demand.radiusMeters)
  }, 0)
}

function vehicleProximityScore(coordinate: Coordinate, vehicles: VehicleDemandSource[]) {
  return vehicles.reduce((score, vehicle) => {
    const distance = metersBetween(coordinate, vehicle.coordinate)
    if (distance > 700) {
      return score
    }

    return score + vehicle.weight * (1 - distance / 700)
  }, 0)
}

function downstreamCongestionScore(coordinate: Coordinate, vehicleHotspots: ScenarioVehicleHotspot[]) {
  return vehicleHotspots.reduce((score, hotspot) => {
    const distance = metersBetween(coordinate, hotspot.coordinate)
    const influenceRadius = Math.max(180, hotspot.radiusMeters * 1.2)
    if (distance > influenceRadius) {
      return score
    }

    return score + hotspot.vehicleShare * (1 - distance / influenceRadius) * 3.2
  }, 0)
}

export function buildSignalRuntimeCollection(
  signals: SignalSourceCollection,
  incidents: ScenarioIncident[],
  processions: ScenarioProcession[],
  vehicleHotspots: ScenarioVehicleHotspot[],
  movingVehicles: Coordinate[],
  timestampMs: number,
): SignalRuntimeCollection {
  const demandSources = [
    ...demandFromIncidents(incidents),
    ...demandFromProcessions(processions),
    ...demandFromVehicleHotspots(vehicleHotspots),
  ]

  const vehicleSources = movingVehicles.map((coordinate) => ({ coordinate, weight: 1 }))

  const features = signals.features.map((feature, index) => {
    const coordinate = feature.geometry.coordinates as Coordinate
    const demandScore = computeDemandScore(coordinate, demandSources)
    const movementScore = vehicleProximityScore(coordinate, vehicleSources)
    const downstreamCongestion = downstreamCongestionScore(coordinate, vehicleHotspots)
    const balancingScore = movementScore - downstreamCongestion * 0.85
    const optimized = movementScore > 0.12
    const cycleSeconds = Math.min(54, 28 + demandScore * 8)
    const targetGreenRatio = Math.max(
      0.22,
      Math.min(0.76, 0.34 + demandScore * 0.08 + balancingScore * 0.06),
    )
    const greenSeconds = Math.min(cycleSeconds - 1, Math.max(8, cycleSeconds * targetGreenRatio))
    const amberSeconds = 1
    const redSeconds = Math.max(1, cycleSeconds - greenSeconds - amberSeconds)
    const offsetSeconds = (Number(feature.properties?.signalId ?? index) % 19) * 0.9
    const cyclePositionSeconds = (timestampMs / 1000 + offsetSeconds) % cycleSeconds

    let signalState: SignalRuntimeProperties['signalState'] = 'stop'
    if (!optimized) {
      signalState = 'hold'
    } else if (cyclePositionSeconds <= greenSeconds) {
      signalState = 'go'
    } else if (cyclePositionSeconds <= greenSeconds + amberSeconds) {
      signalState = 'hold'
    } else if (cyclePositionSeconds <= greenSeconds + amberSeconds + redSeconds) {
      signalState = 'stop'
    }

    return {
      type: 'Feature' as const,
      properties: {
        signalId: Number(feature.properties?.signalId ?? index),
        kind: feature.properties?.kind ?? 'junction',
        signalState,
        optimized,
        cycleSeconds,
        greenRatio: greenSeconds / cycleSeconds,
        demandScore,
        downstreamCongestion,
        balancingScore,
        signalOpacity: optimized ? Math.min(0.98, 0.58 + demandScore * 0.16) : 0.22,
      },
      geometry: feature.geometry,
    }
  })

  return {
    type: 'FeatureCollection',
    features,
  }
}
