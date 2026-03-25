import type { FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, Map } from 'maplibre-gl'

import type { CrowdHeatmapCollection, InfluenceHotspotCollection } from '../types/cityIntel'
import type { Coordinate, RouteResult, TrafficRoadProperties } from '../types/offline'

type VehicleFeature = {
  id: number
  position: Coordinate
}

type RoutePointPair = {
  start: Coordinate
  end: Coordinate
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

export function setSourceData(map: Map | null, sourceId: string, data: GeoJSON.GeoJSON) {
  if (!map) {
    return
  }

  const source = map.getSource(sourceId)
  if (source && 'setData' in source) {
    ;(source as GeoJSONSource).setData(data)
  }
}
