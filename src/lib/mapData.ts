import type { FeatureCollection, LineString, Point, Polygon } from 'geojson'
import type { GeoJSONSource, Map } from 'maplibre-gl'

import type { CrowdHeatmapCollection, InfluenceHotspotCollection } from '../types/cityIntel'
import type { Coordinate, RouteResult, TrafficRoadProperties } from '../types/offline'
import type { ScenarioIncident, ScenarioProcession, ScenarioVehicleHotspot } from '../types/runtime'
import { BENGALURU_BOUNDS } from '../constants/map'

type VehicleFeature = {
  id: number
  position: Coordinate
}

type RoutePointPair = {
  start: Coordinate
  end: Coordinate
}

type BreakoutDebugItem = {
  id: number
  position: Coordinate
  breakoutWaypoint: Coordinate | null
  routeVariant: number
  escapingClusterId: string | null
}

export function emptyLineCollection(): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function emptyPointCollection(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function emptyPolygonCollection(): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function emptyTrafficCollection(): FeatureCollection<LineString, TrafficRoadProperties> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function emptyCrowdHeatmapCollection(): CrowdHeatmapCollection {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function emptyInfluenceCollection(): InfluenceHotspotCollection {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

export function buildRouteGeoJson(route: RouteResult | null): FeatureCollection<LineString> {
  if (!route) {
    return emptyLineCollection()
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: route.coordinates,
        },
      },
    ],
  }
}

export function buildRoutePairGeoJson(route: RouteResult | null, label: string): FeatureCollection<LineString> {
  if (!route) {
    return emptyLineCollection()
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { label },
        geometry: {
          type: 'LineString',
          coordinates: route.coordinates,
        },
      },
    ],
  }
}

export function buildRouteCollectionGeoJson(
  routes: Array<{ route: RouteResult; label: string; id: number }>,
): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map((item) => ({
      type: 'Feature',
      properties: { label: item.label, id: item.id },
      geometry: {
        type: 'LineString',
        coordinates: item.route.coordinates,
      },
    })),
  }
}

export function buildClickPointsGeoJson(
  start: Coordinate | null,
  end: Coordinate | null,
): FeatureCollection<Point, { role: 'start' | 'end' }> {
  const features = []

  if (start) {
    features.push({
      type: 'Feature' as const,
      properties: { role: 'start' as const },
      geometry: { type: 'Point' as const, coordinates: start },
    })
  }

  if (end) {
    features.push({
      type: 'Feature' as const,
      properties: { role: 'end' as const },
      geometry: { type: 'Point' as const, coordinates: end },
    })
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

export function buildMultiClickPointsGeoJson(
  pairs: RoutePointPair[],
): FeatureCollection<Point, { role: 'start' | 'end'; id: number }> {
  return {
    type: 'FeatureCollection',
    features: pairs.flatMap((pair, index) => [
      {
        type: 'Feature' as const,
        properties: { role: 'start' as const, id: index + 1 },
        geometry: { type: 'Point' as const, coordinates: pair.start },
      },
      {
        type: 'Feature' as const,
        properties: { role: 'end' as const, id: index + 1 },
        geometry: { type: 'Point' as const, coordinates: pair.end },
      },
    ]),
  }
}

export function buildVehicleMarkersGeoJson(
  pairs: RoutePointPair[],
  draftStart: Coordinate | null,
  draftEnd: Coordinate | null,
): FeatureCollection<Point, { role: 'start' | 'end'; id: number }> {
  const persisted = buildMultiClickPointsGeoJson(pairs).features
  const draftFeatures = buildClickPointsGeoJson(draftStart, draftEnd).features.map((feature, index) => ({
    ...feature,
    properties: {
      role: feature.properties.role,
      id: -1 - index,
    },
  }))

  return {
    type: 'FeatureCollection',
    features: [...persisted, ...draftFeatures],
  }
}

export function buildVehicleGeoJson(position: Coordinate | null): FeatureCollection<Point> {
  if (!position) {
    return emptyPointCollection()
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { id: 1 },
        geometry: {
          type: 'Point',
          coordinates: position,
        },
      },
    ],
  }
}

function buildCirclePolygon(coordinate: Coordinate, radiusMeters: number, steps = 36): Coordinate[] {
  const [lng, lat] = coordinate
  const latDelta = radiusMeters / 111_320
  const lngDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180) || 1)
  const coordinates: Coordinate[] = []

  for (let step = 0; step <= steps; step += 1) {
    const theta = (step / steps) * Math.PI * 2
    coordinates.push([
      lng + Math.cos(theta) * lngDelta,
      lat + Math.sin(theta) * latDelta,
    ])
  }

  return coordinates
}

export function buildIncidentPointsGeoJson(incidents: ScenarioIncident[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: incidents.map((incident) => ({
      type: 'Feature',
      properties: {
        id: incident.id,
        kind: incident.kind,
        name: incident.name,
        description: incident.description,
        category: incident.category,
        radiusKm: incident.radiusKm,
      },
      geometry: {
        type: 'Point',
        coordinates: incident.coordinate,
      },
    })),
  }
}

export function buildIncidentZonesGeoJson(incidents: ScenarioIncident[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: incidents.map((incident) => ({
      type: 'Feature',
      properties: {
        id: incident.id,
        kind: incident.kind,
        name: incident.name,
        description: incident.description,
        category: incident.category,
        radiusKm: incident.radiusKm,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [buildCirclePolygon(incident.coordinate, incident.radiusKm * 1_000)],
      },
    })),
  }
}

export function buildScenarioHeatmapGeoJson(incidents: ScenarioIncident[]): CrowdHeatmapCollection {
  const [[minLng, minLat], [maxLng, maxLat]] = BENGALURU_BOUNDS as [[number, number], [number, number]]
  const lngSteps = 42
  const latSteps = 36
  const backgroundFeatures = Array.from({ length: lngSteps * latSteps }, (_, index) => {
    const x = index % lngSteps
    const y = Math.floor(index / lngSteps)
    const lng = minLng + ((x + 0.5) / lngSteps) * (maxLng - minLng)
    const lat = minLat + ((y + 0.5) / latSteps) * (maxLat - minLat)
    const coordinate: Coordinate = [lng, lat]

    let fieldStrength = 0.06

    incidents.forEach((incident) => {
      const [incidentLng, incidentLat] = incident.coordinate
      const lngKm = (lng - incidentLng) * 111.32 * Math.cos(((lat + incidentLat) * 0.5 * Math.PI) / 180)
      const latKm = (lat - incidentLat) * 111.32
      const distanceKm = Math.sqrt((lngKm ** 2) + (latKm ** 2))
      const spreadKm = Math.max(0.45, incident.radiusKm * (incident.kind === 'event' ? 1.9 : 1.45))
      const amplitude = incident.kind === 'event' ? 0.92 : 0.64
      fieldStrength += amplitude * Math.exp(-((distanceKm ** 2) / (2 * (spreadKm ** 2))))
    })

    const normalizedIntensity = Math.min(1, fieldStrength)
    const estimatedPeople = Math.round(220 + normalizedIntensity * 4_600)
    const densityStatus =
      normalizedIntensity >= 0.7 ? 'High' : normalizedIntensity >= 0.34 ? 'Medium' : 'Low'

    return {
      type: 'Feature' as const,
      properties: {
        pincode: 'baseline',
        sub_location: `Baseline ${x}-${y}`,
        density_status: densityStatus as 'Low' | 'Medium' | 'High',
        estimated_people_count: estimatedPeople,
        intensity: normalizedIntensity,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: coordinate,
      },
    }
  })

  return {
    type: 'FeatureCollection',
    features: [
      ...backgroundFeatures,
      ...incidents.map((incident) => {
        const estimatedPeople = incident.kind === 'event'
          ? 2800 + Math.round(incident.radiusKm * 2600)
          : 1700 + Math.round(incident.radiusKm * 1900)
        const densityStatus =
          estimatedPeople >= 2600 ? 'High' : estimatedPeople >= 1400 ? 'Medium' : 'Low'

        return {
          type: 'Feature' as const,
          properties: {
            pincode: 'dynamic',
            sub_location: incident.name,
            density_status: densityStatus as 'Low' | 'Medium' | 'High',
            estimated_people_count: estimatedPeople,
            intensity: Math.min(1, estimatedPeople / 4000),
          },
          geometry: {
            type: 'Point' as const,
            coordinates: incident.coordinate,
          },
        }
      }),
    ],
  }
}

export function buildProcessionGeoJson(processions: ScenarioProcession[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: processions.map((procession) => ({
      type: 'Feature',
      properties: {
        id: procession.id,
        name: procession.name,
        description: procession.description,
        category: procession.category,
        radiusKm: procession.radiusKm,
      },
      geometry: {
        type: 'LineString',
        coordinates: procession.route.coordinates,
      },
    })),
  }
}

export function buildVehicleHotspotZonesGeoJson(
  hotspots: ScenarioVehicleHotspot[],
): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: hotspots.map((hotspot) => ({
      type: 'Feature',
      properties: {
        id: hotspot.id,
        name: `Vehicle Hotspot`,
        description: `${hotspot.vehicleCount} vehicles clustered here`,
        category: 'crowd',
        vehicleCount: hotspot.vehicleCount,
        vehicleShare: hotspot.vehicleShare,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [buildCirclePolygon(hotspot.coordinate, hotspot.radiusMeters)],
      },
    })),
  }
}

export function buildVehiclesGeoJson(vehicles: VehicleFeature[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((vehicle) => ({
      type: 'Feature',
      properties: { id: vehicle.id },
      geometry: {
        type: 'Point',
        coordinates: vehicle.position,
      },
    })),
  }
}

export function buildBreakoutWaypointGeoJson(items: BreakoutDebugItem[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: items
      .filter((item) => item.breakoutWaypoint !== null)
      .map((item) => ({
        type: 'Feature' as const,
        properties: {
          id: item.id,
          routeVariant: item.routeVariant,
          escapingClusterId: item.escapingClusterId,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: item.breakoutWaypoint!,
        },
      })),
  }
}

export function buildBreakoutGuideGeoJson(items: BreakoutDebugItem[]): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: items
      .filter((item) => item.breakoutWaypoint !== null)
      .map((item) => ({
        type: 'Feature' as const,
        properties: {
          id: item.id,
          routeVariant: item.routeVariant,
          escapingClusterId: item.escapingClusterId,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: [item.position, item.breakoutWaypoint!],
        },
      })),
  }
}

export function setSourceData(map: Map | null, sourceId: string, data: GeoJSON.GeoJSON) {
  if (!map) {
    return
  }

  const source = map.getSource(sourceId)
  if (source && 'setData' in source) {
    ;(source as GeoJSONSource).setData(data)
  }
}
