import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { Map } from 'maplibre-gl'

import { BENGALURU_BOUNDS, BENGALURU_CENTER, MAP_SOURCE_IDS } from '../constants/map'
import { getHeatmapImageCoordinates } from './heatmapRaster'
import { buildOfflineStyle } from './mapStyle'
import {
  emptyCrowdHeatmapCollection,
  emptyInfluenceCollection,
  emptyLineCollection,
  emptyPointCollection,
  emptyPolygonCollection,
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

  if (!map.getSource(MAP_SOURCE_IDS.trafficSignalDirections)) {
    map.addSource(MAP_SOURCE_IDS.trafficSignalDirections, { type: 'geojson', data: emptyPointCollection() })
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

  if (!map.getSource(MAP_SOURCE_IDS.heatmapRaster)) {
    map.addSource(MAP_SOURCE_IDS.heatmapRaster, {
      type: 'image',
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAr7dxyzAAAAAAElFTkSuQmCC',
      coordinates: getHeatmapImageCoordinates(),
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

  if (!map.getSource(MAP_SOURCE_IDS.incidentPoints)) {
    map.addSource(MAP_SOURCE_IDS.incidentPoints, { type: 'geojson', data: emptyPointCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.incidentZones)) {
    map.addSource(MAP_SOURCE_IDS.incidentZones, { type: 'geojson', data: emptyPolygonCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.processions)) {
    map.addSource(MAP_SOURCE_IDS.processions, { type: 'geojson', data: emptyLineCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.vehicleHotspots)) {
    map.addSource(MAP_SOURCE_IDS.vehicleHotspots, { type: 'geojson', data: emptyPolygonCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.debugBreakoutPoints)) {
    map.addSource(MAP_SOURCE_IDS.debugBreakoutPoints, { type: 'geojson', data: emptyPointCollection() })
  }

  if (!map.getSource(MAP_SOURCE_IDS.debugBreakoutLines)) {
    map.addSource(MAP_SOURCE_IDS.debugBreakoutLines, { type: 'geojson', data: emptyLineCollection() })
  }

  if (!map.getLayer('scenario-heatmap-raster-layer')) {
    map.addLayer({
      id: 'scenario-heatmap-raster-layer',
      type: 'raster',
      source: MAP_SOURCE_IDS.heatmapRaster,
      paint: {
        'raster-opacity': 0.56,
        'raster-fade-duration': 0,
        'raster-resampling': 'linear',
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
        'circle-opacity': 0,
        'circle-stroke-color': 'rgba(255,255,255,0)',
        'circle-stroke-width': 0,
      },
      layout: {
        visibility: 'none',
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
        'circle-color': '#22c55e',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11.5,
          ['case', ['get', 'optimized'], 5.6, 4.2],
          14,
          ['case', ['get', 'optimized'], 8.5, 6.6],
          17,
          ['case', ['get', 'optimized'], 11, 8.8],
        ],
        'circle-stroke-width': ['case', ['get', 'optimized'], 2, 1.3],
        'circle-stroke-color': '#f8fafc',
        'circle-opacity': 0.9,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('traffic-signals-pulse-layer')) {
    map.addLayer({
      id: 'traffic-signals-pulse-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.trafficSignals,
      minzoom: 11.5,
      paint: {
        'circle-color': '#22c55e',
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11.5,
          ['case', ['get', 'optimized'], 11, 8],
          14,
          ['case', ['get', 'optimized'], 18, 14],
          17,
          ['case', ['get', 'optimized'], 25, 18],
        ],
        'circle-opacity': ['case', ['get', 'optimized'], 0.18, 0.08],
        'circle-blur': 0.9,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('traffic-signals-direction-layer')) {
    map.addLayer({
      id: 'traffic-signals-direction-layer',
      type: 'symbol',
      source: MAP_SOURCE_IDS.trafficSignalDirections,
      minzoom: 12.2,
      layout: {
        'text-field': ['get', 'glyph'],
        'text-size': 22,
        'text-rotate': ['get', 'rotation'],
        'text-rotation-alignment': 'map',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: {
        'text-color': '#16a34a',
        'text-halo-color': 'rgba(255,255,255,0.95)',
        'text-halo-width': 1.8,
      },
    })
  }

  if (!map.getLayer('incident-zones-layer')) {
    map.addLayer({
      id: 'incident-zones-layer',
      type: 'fill',
      source: MAP_SOURCE_IDS.incidentZones,
      paint: {
        'fill-color': ['match', ['get', 'kind'], 'event', '#ef4444', '#f59e0b'],
        'fill-opacity': 0.13,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('incident-zones-outline-layer')) {
    map.addLayer({
      id: 'incident-zones-outline-layer',
      type: 'line',
      source: MAP_SOURCE_IDS.incidentZones,
      paint: {
        'line-color': ['match', ['get', 'kind'], 'event', '#dc2626', '#d97706'],
        'line-width': 2,
        'line-opacity': 0.72,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('vehicle-hotspots-layer')) {
    map.addLayer({
      id: 'vehicle-hotspots-layer',
      type: 'fill',
      source: MAP_SOURCE_IDS.vehicleHotspots,
      paint: {
        'fill-color': '#7c3aed',
        'fill-opacity': 0.12,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('vehicle-hotspots-outline-layer')) {
    map.addLayer({
      id: 'vehicle-hotspots-outline-layer',
      type: 'line',
      source: MAP_SOURCE_IDS.vehicleHotspots,
      paint: {
        'line-color': '#7c3aed',
        'line-width': 2,
        'line-opacity': 0.78,
        'line-dasharray': [1.3, 1.1],
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('processions-layer')) {
    map.addLayer({
      id: 'processions-layer',
      type: 'line',
      source: MAP_SOURCE_IDS.processions,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#be123c',
        'line-width': 9,
        'line-opacity': 0.92,
      },
    }, firstSymbolLayerId)
  }

  if (!map.getLayer('incident-points-layer')) {
    map.addLayer({
      id: 'incident-points-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.incidentPoints,
      paint: {
        'circle-radius': ['match', ['get', 'kind'], 'event', 7, 6],
        'circle-color': ['match', ['get', 'kind'], 'event', '#dc2626', '#d97706'],
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.96,
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
        'circle-color': ['match', ['get', 'role'], 'start', '#16a34a', '#facc15'],
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
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          4,
          13,
          5.5,
          16,
          7,
        ],
        'circle-color': '#0f172a',
        'circle-opacity': 0.82,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
    })
  }

  if (!map.getLayer('debug-breakout-lines-layer')) {
    map.addLayer({
      id: 'debug-breakout-lines-layer',
      type: 'line',
      source: MAP_SOURCE_IDS.debugBreakoutLines,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#7c3aed',
        'line-width': 2.5,
        'line-opacity': 0.85,
        'line-dasharray': [1.2, 1],
      },
    })
  }

  if (!map.getLayer('debug-breakout-points-layer')) {
    map.addLayer({
      id: 'debug-breakout-points-layer',
      type: 'circle',
      source: MAP_SOURCE_IDS.debugBreakoutPoints,
      paint: {
        'circle-radius': 6,
        'circle-color': '#7c3aed',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.96,
      },
    })
  }
}

export function resetMapSources(map: Map) {
  setSourceData(map, MAP_SOURCE_IDS.trafficSignals, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.trafficSignalDirections, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.trafficLevels, emptyTrafficCollection())
  setSourceData(map, MAP_SOURCE_IDS.crowdHeatmap, emptyCrowdHeatmapCollection())
  setSourceData(map, MAP_SOURCE_IDS.trafficInfluence, emptyInfluenceCollection())
  setSourceData(map, MAP_SOURCE_IDS.eventInfluence, emptyInfluenceCollection())
  setSourceData(map, MAP_SOURCE_IDS.clickPoints, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.shortestRoute, emptyLineCollection())
  setSourceData(map, MAP_SOURCE_IDS.route, emptyLineCollection())
  setSourceData(map, MAP_SOURCE_IDS.vehicle, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.incidentPoints, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.incidentZones, emptyPolygonCollection())
  setSourceData(map, MAP_SOURCE_IDS.processions, emptyLineCollection())
  setSourceData(map, MAP_SOURCE_IDS.vehicleHotspots, emptyPolygonCollection())
  setSourceData(map, MAP_SOURCE_IDS.debugBreakoutPoints, emptyPointCollection())
  setSourceData(map, MAP_SOURCE_IDS.debugBreakoutLines, emptyLineCollection())
}
