import type { Feature, FeatureCollection, Point } from 'geojson'

import type { OverpassResponse } from '../types/offline'

export function normalizeSignalsToGeoJson(
  payload: OverpassResponse,
): FeatureCollection<Point, { signalId: number; kind: string }> {
  const features: Feature<Point, { signalId: number; kind: string }>[] = (payload.elements ?? [])
    .filter((item) => typeof item.lon === 'number' && typeof item.lat === 'number')
    .map((item) => ({
      type: 'Feature',
      properties: {
        signalId: item.id,
        kind: item.tags?.crossing === 'traffic_signals' ? 'crossing' : 'junction',
      },
      geometry: {
        type: 'Point',
        coordinates: [item.lon!, item.lat!],
      },
    }))

  return {
    type: 'FeatureCollection',
    features,
  }
}
