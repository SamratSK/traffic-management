import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { Map } from 'maplibre-gl'

import { BENGALURU_BOUNDS, BENGALURU_CENTER, MAP_SOURCE_IDS } from '../constants/map'
import { buildOfflineStyle } from './mapStyle'
import {
  emptyCrowdHeatmapCollection,
  emptyInfluenceCollection,
  emptyLineCollection,
  emptyPointCollection,
  emptyTrafficCollection,
  setSourceData,
} from './mapData'

let protocolRegistered = false

export function ensurePmtilesProtocol() {
  if (protocolRegistered) {
    return
  }

  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  protocolRegistered = true
}

export function createOfflineMap(container: HTMLDivElement) {
  return new maplibregl.Map({
    container,
    style: buildOfflineStyle(),
    center: BENGALURU_CENTER,
    zoom: 12.5,
    pitch: 52,
    bearing: -12,
    maxPitch: 60,
    minZoom: 10.8,
    maxZoom: 18.5,
    maxBounds: BENGALURU_BOUNDS,
  })
}

export function ensureMapLayers(map: Map) {
  const firstSymbolLayerId = map
    .getStyle()
    ?.layers?.find((layer) => layer.type === 'symbol')?.id

  if (!map.getSource(MAP_SOURCE_IDS.route)) {
    map.addSource(MAP_SOURCE_IDS.route, { type: 'geojson', data: emptyLineCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.shortestRoute)) {
    map.addSource(MAP_SOURCE_IDS.shortestRoute, { type: 'geojson', data: emptyLineCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.clickPoints)) {
    map.addSource(MAP_SOURCE_IDS.clickPoints, { type: 'geojson', data: emptyPointCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.trafficSignals)) {
    map.addSource(MAP_SOURCE_IDS.trafficSignals, { type: 'geojson', data: emptyPointCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.trafficLevels)) {
    map.addSource(MAP_SOURCE_IDS.trafficLevels, { type: 'geojson', data: emptyTrafficCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.crowdHeatmap)) {
    map.addSource(MAP_SOURCE_IDS.crowdHeatmap, {
      type: 'geojson',
      data: emptyCrowdHeatmapCollection(),
    })
  }

  if (!map.getSource(MAP_SOURCE_IDS.trafficInfluence)) {
    map.addSource(MAP_SOURCE_IDS.trafficInfluence, {
      type: 'geojson',
      data: emptyInfluenceCollection(),
    })
  }

  if (!map.getSource(MAP_SOURCE_IDS.eventInfluence)) {
    map.addSource(MAP_SOURCE_IDS.eventInfluence, {
      type: 'geojson',
      data: emptyInfluenceCollection(),
    })
  }

  if (!map.getSource(MAP_SOURCE_IDS.vehicle)) {
    map.addSource(MAP_SOURCE_IDS.vehicle, { type: 'geojson', data: emptyPointCollection() })
  }

  if (!map.getLayer('crowd-heatmap-layer')) {
    map.addLayer({
      id: 'crowd-heatmap-layer',
      type: 'heatmap',
      source: MAP_SOURCE_IDS.crowdHeatmap,
      maxzoom: 16,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'estimated_people_count'], 0, 0, 5000, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.35],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 22, 14, 42],
        'heatmap-opacity': 0.64,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0, 'rgba(37, 99, 235, 0)',
          0.18, 'rgba(59, 130, 246, 0.45)',
          0.4, 'rgba(16, 185, 129, 0.6)',
          0.65, 'rgba(249, 115, 22, 0.78)',
          1, 'rgba(220, 38, 38, 0.95)',
        ],
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('crowd-points-layer')) {
    map.addLayer({
      id: 'crowd-points-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.crowdHeatmap,
      minzoom: 12,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'estimated_people_count'], 250, 4, 5000, 10],
        'circle-color': ['match', ['get', 'density_status'], 'High', '#dc2626', 'Medium', '#f59e0b', '#2563eb'],
        'circle-opacity': 0.75,
        'circle-stroke-color': 'rgba(255,255,255,0.75)',
        'circle-stroke-width': 1,
      },
    })
  }

  if (!map.getLayer('traffic-influence-layer')) {
    map.addLayer({
      id: 'traffic-influence-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.trafficInfluence,
      paint: {
        'circle-color': ['match', ['get', 'severity'], 'Severe', '#991b1b', 'Major', '#dc2626', 'Moderate', '#f97316', '#f59e0b'],
        'circle-opacity': 0.18,
        'circle-stroke-width': 1.2,
        'circle-stroke-color': 'rgba(255,255,255,0.35)',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, ['match', ['get', 'severity'], 'Severe', 28, 'Major', 22, 'Moderate', 18, 14],
          14, ['match', ['get', 'severity'], 'Severe', 88, 'Major', 72, 'Moderate', 58, 46],
          17, ['match', ['get', 'severity'], 'Severe', 150, 'Major', 128, 'Moderate', 112, 92],
        ],
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('event-influence-layer')) {
    map.addLayer({
      id: 'event-influence-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.eventInfluence,
      paint: {
        'circle-color': ['match', ['get', 'severity'], 'Severe', '#be123c', 'Major', '#7c3aed', '#a855f7'],
        'circle-opacity': 0.14,
        'circle-stroke-width': 1.2,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10, ['match', ['get', 'severity'], 'Severe', 34, 'Major', 28, 22],
          14, ['match', ['get', 'severity'], 'Severe', 108, 'Major', 92, 76],
          17, ['match', ['get', 'severity'], 'Severe', 176, 'Major', 152, 128],
        ],
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('3d-buildings')) {
    map.addLayer({
      id: '3d-buildings',
      type: 'fill-extrusion',
      source: 'bengaluru',
      'source-layer': 'buildings',
      minzoom: 13.6,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], ['get', 'height'], 8], 0, '#dbe4ea', 120, '#94a3b8'],
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.88,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('route-layer-glow')) {
    map.addLayer({
      id: 'route-layer-glow',
      type: 'line',
      source: MAP_SOURCE_IDS.route,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#16a34a', 'line-width': 13, 'line-opacity': 0.18 },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('shortest-route-layer-glow')) {
    map.addLayer({
      id: 'shortest-route-layer-glow',
      type: 'line',
      source: MAP_SOURCE_IDS.shortestRoute,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#f97316', 'line-width': 11, 'line-opacity': 0.16 },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('traffic-levels-glow')) {
    map.addLayer({
      id: 'traffic-levels-glow',
      type: 'line',
      source: MAP_SOURCE_IDS.trafficLevels,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'trafficLevel'], 'red', '#ef4444', '#f59e0b'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'roadClass'], 'main', 6, 4], 15, ['match', ['get', 'roadClass'], 'main', 14, 9]],
        'line-opacity': 0.22,
        'line-blur': 1.2,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('traffic-levels-layer')) {
    map.addLayer({
      id: 'traffic-levels-layer',
      type: 'line',
      source: MAP_SOURCE_IDS.trafficLevels,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'trafficLevel'], 'red', '#dc2626', '#f59e0b'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, ['match', ['get', 'roadClass'], 'main', 3.2, 2.2], 15, ['match', ['get', 'roadClass'], 'main', 7.5, 4.5]],
        'line-opacity': 0.94,
        'line-dasharray': ['match', ['get', 'trafficLevel'], 'red', ['literal', [1, 0]], ['literal', [1.4, 0.7]]],
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('route-layer')) {
    map.addLayer({
      id: 'route-layer',
      type: 'line',
      source: MAP_SOURCE_IDS.route,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#16a34a', 'line-width': 7, 'line-opacity': 0.96 },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('shortest-route-layer')) {
    map.addLayer({
      id: 'shortest-route-layer',
      type: 'line',
      source: MAP_SOURCE_IDS.shortestRoute,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#f59e0b', 'line-width': 5.5, 'line-opacity': 0.9 },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('traffic-signals-layer')) {
    map.addLayer({
      id: 'traffic-signals-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.trafficSignals,
      minzoom: 11.5,
      paint: {
        'circle-color': ['match', ['get', 'signalState'], 'go', '#16a34a', '#dc2626'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11.5, 2.5, 14, 4.5, 17, 6.5],
        'circle-stroke-width': 1.2,
        'circle-stroke-color': 'rgba(255,255,255,0.9)',
        'circle-opacity': 0.92,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('click-points-layer')) {
    map.addLayer({
      id: 'click-points-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.clickPoints,
      paint: {
        'circle-radius': ['match', ['get', 'role'], 'start', 8, 9],
        'circle-color': ['match', ['get', 'role'], 'start', '#16a34a', '#2563eb'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    })
  }

  if (!map.getLayer('vehicle-circle-layer')) {
    map.addLayer({
      id: 'vehicle-circle-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.vehicle,
      paint: {
        'circle-radius': 12,
        'circle-color': '#0f172a',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    })
  }

  if (!map.getLayer('vehicle-label-layer')) {
    map.addLayer({
      id: 'vehicle-label-layer',
      type: 'symbol',
      source: MAP_SOURCE_IDS.vehicle,
      layout: {
        'text-field': ['to-string', ['get', 'id']],
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#ffffff' },
    })
  }
}

export function resetMapSources(map: Map) {
  setSourceData(map, MAP_SOURCE_IDS.trafficSignals, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.trafficLevels, emptyTrafficCollection())
  setSourceData(map, MAP_SOURCE_IDS.crowdHeatmap, emptyCrowdHeatmapCollection())
  setSourceData(map, MAP_SOURCE_IDS.trafficInfluence, emptyInfluenceCollection())
  setSourceData(map, MAP_SOURCE_IDS.eventInfluence, emptyInfluenceCollection())
  setSourceData(map, MAP_SOURCE_IDS.clickPoints, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.shortestRoute, emptyLineCollection())
  setSourceData(map, MAP_SOURCE_IDS.route, emptyLineCollection())
  setSourceData(map, MAP_SOURCE_IDS.vehicle, emptyPointCollection())
}
