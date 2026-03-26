import type { LngLatBoundsLike } from 'maplibre-gl'

import type { Coordinate } from '../types/offline'

export const BENGALURU_CENTER: Coordinate = [77.5946, 12.9716]
export const BENGALURU_BOUNDS: LngLatBoundsLike = [
  [77.4096, 12.8342],
  [77.8108, 13.1735],
]

export const MAP_SOURCE_IDS = {
  route: 'route-source',
  shortestRoute: 'shortest-route-source',
  clickPoints: 'click-points-source',
  trafficSignals: 'traffic-signals-source',
  trafficLevels: 'traffic-levels-source',
  crowdHeatmap: 'crowd-heatmap-source',
  heatmapRaster: 'heatmap-raster-source',
  trafficInfluence: 'traffic-influence-source',
  eventInfluence: 'event-influence-source',
  vehicle: 'vehicle-source',
  incidentPoints: 'incident-points-source',
  incidentZones: 'incident-zones-source',
  processions: 'processions-source',
  vehicleHotspots: 'vehicle-hotspots-source',
  debugBreakoutPoints: 'debug-breakout-points-source',
  debugBreakoutLines: 'debug-breakout-lines-source',
} as const
