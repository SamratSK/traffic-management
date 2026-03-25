import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { GeoJSONSource, Map } from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import type { FeatureCollection, LineString, Point } from 'geojson'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

import { formatDistance } from './lib/geo'
import { buildOfflineStyle } from './lib/mapStyle'
import { OfflineRouter } from './lib/router'
import { normalizeSignalsToGeoJson } from './lib/signals'
import type {
  Coordinate,
  OverpassResponse,
  RoadGraphFile,
  RouteResult,
  TrafficRoadProperties,
} from './types/offline'

const BENGALURU_CENTER: Coordinate = [77.5946, 12.9716]
const BENGALURU_BOUNDS: LngLatBoundsLike = [
  [77.4096, 12.8342],
  [77.8108, 13.1735],
]
const ROUTE_SOURCE_ID = 'route-source'
const CLICK_POINTS_SOURCE_ID = 'click-points-source'
const TRAFFIC_SIGNALS_SOURCE_ID = 'traffic-signals-source'
const TRAFFIC_LEVELS_SOURCE_ID = 'traffic-levels-source'

let protocolRegistered = false

if (!protocolRegistered) {
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  protocolRegistered = true
}

function emptyLineCollection(): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

function emptyPointCollection(): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

function emptyTrafficCollection(): FeatureCollection<LineString, TrafficRoadProperties> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

function buildRouteGeoJson(route: RouteResult | null): FeatureCollection<LineString> {
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

function buildClickPointsGeoJson(
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

function setSourceData(map: Map | null, sourceId: string, data: GeoJSON.GeoJSON) {
  if (!map) {
    return
  }

  const source = map.getSource(sourceId)
  if (source && 'setData' in source) {
    ;(source as GeoJSONSource).setData(data)
  }
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const startPointRef = useRef<Coordinate | null>(null)
  const endPointRef = useRef<Coordinate | null>(null)

  const [router, setRouter] = useState<OfflineRouter | null>(null)
  const [graphReady, setGraphReady] = useState(false)
  const [signals, setSignals] = useState<FeatureCollection<Point>>(emptyPointCollection)
  const [trafficLevels, setTrafficLevels] =
    useState<FeatureCollection<LineString, TrafficRoadProperties>>(emptyTrafficCollection)
  const [startPoint, setStartPoint] = useState<Coordinate | null>(null)
  const [endPoint, setEndPoint] = useState<Coordinate | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [error, setError] = useState('')

  const clickPoints = useMemo(
    () => buildClickPointsGeoJson(startPoint, endPoint),
    [startPoint, endPoint],
  )
  const routeGeoJson = useMemo(() => buildRouteGeoJson(route), [route])

  useEffect(() => {
    startPointRef.current = startPoint
  }, [startPoint])

  useEffect(() => {
    endPointRef.current = endPoint
  }, [endPoint])

  useEffect(() => {
    let cancelled = false

    async function loadOfflineData() {
      try {
        const [graphResponse, signalsResponse, trafficLevelsResponse] = await Promise.all([
          fetch('/offline/road-graph.json'),
          fetch('/offline/traffic-signals.json'),
          fetch('/offline/traffic-levels.geojson'),
        ])

        if (!graphResponse.ok) {
          throw new Error('Missing /offline/road-graph.json. Run npm run build:graph first.')
        }

        if (!signalsResponse.ok) {
          throw new Error('Missing /offline/traffic-signals.json.')
        }

        if (!trafficLevelsResponse.ok) {
          throw new Error('Missing /offline/traffic-levels.geojson. Run npm run build:traffic first.')
        }

        const [graph, rawSignals, trafficLevelsGeoJson] = (await Promise.all([
          graphResponse.json(),
          signalsResponse.json(),
          trafficLevelsResponse.json(),
        ])) as [
          RoadGraphFile,
          OverpassResponse,
          FeatureCollection<LineString, TrafficRoadProperties>,
        ]

        if (cancelled) {
          return
        }

        setRouter(new OfflineRouter(graph))
        setGraphReady(true)
        setSignals(normalizeSignalsToGeoJson(rawSignals))
        setTrafficLevels(trafficLevelsGeoJson)
      } catch (loadError) {
        if (cancelled) {
          return
        }

        const message =
          loadError instanceof Error ? loadError.message : 'Unable to load offline map data.'
        setError(message)
      }
    }

    loadOfflineData()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
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

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('style.load', () => {
      const firstSymbolLayerId = map
        .getStyle()
        ?.layers?.find((layer) => layer.type === 'symbol')?.id

      if (!map.getSource(ROUTE_SOURCE_ID)) {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: emptyLineCollection() })
      }

      if (!map.getSource(CLICK_POINTS_SOURCE_ID)) {
        map.addSource(CLICK_POINTS_SOURCE_ID, { type: 'geojson', data: emptyPointCollection() })
      }

      if (!map.getSource(TRAFFIC_SIGNALS_SOURCE_ID)) {
        map.addSource(TRAFFIC_SIGNALS_SOURCE_ID, { type: 'geojson', data: emptyPointCollection() })
      }

      if (!map.getSource(TRAFFIC_LEVELS_SOURCE_ID)) {
        map.addSource(TRAFFIC_LEVELS_SOURCE_ID, {
          type: 'geojson',
          data: emptyTrafficCollection(),
        })
      }

      if (!map.getLayer('3d-buildings')) {
        map.addLayer(
          {
            id: '3d-buildings',
            type: 'fill-extrusion',
            source: 'bengaluru',
            'source-layer': 'buildings',
            minzoom: 13.6,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'render_height'], ['get', 'height'], 8],
                0,
                '#dbe4ea',
                120,
                '#94a3b8',
              ],
              'fill-extrusion-height': [
                'coalesce',
                ['get', 'render_height'],
                ['get', 'height'],
                8,
              ],
              'fill-extrusion-base': [
                'coalesce',
                ['get', 'render_min_height'],
                ['get', 'min_height'],
                0,
              ],
              'fill-extrusion-opacity': 0.88,
            },
          },
          firstSymbolLayerId,
        )
      }

      if (!map.getLayer('route-layer-glow')) {
        map.addLayer(
          {
            id: 'route-layer-glow',
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#f97316',
              'line-width': 13,
              'line-opacity': 0.18,
            },
          },
          firstSymbolLayerId,
        )
      }

      if (!map.getLayer('traffic-levels-glow')) {
        map.addLayer(
          {
            id: 'traffic-levels-glow',
            type: 'line',
            source: TRAFFIC_LEVELS_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': [
                'match',
                ['get', 'trafficLevel'],
                'red',
                '#ef4444',
                '#f59e0b',
              ],
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11,
                ['match', ['get', 'roadClass'], 'main', 6, 4],
                15,
                ['match', ['get', 'roadClass'], 'main', 14, 9],
              ],
              'line-opacity': 0.22,
              'line-blur': 1.2,
            },
          },
          firstSymbolLayerId,
        )
      }

      if (!map.getLayer('traffic-levels-layer')) {
        map.addLayer(
          {
            id: 'traffic-levels-layer',
            type: 'line',
            source: TRAFFIC_LEVELS_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': [
                'match',
                ['get', 'trafficLevel'],
                'red',
                '#dc2626',
                '#f59e0b',
              ],
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11,
                ['match', ['get', 'roadClass'], 'main', 3.2, 2.2],
                15,
                ['match', ['get', 'roadClass'], 'main', 7.5, 4.5],
              ],
              'line-opacity': 0.94,
              'line-dasharray': [
                'match',
                ['get', 'trafficLevel'],
                'red',
                ['literal', [1, 0]],
                ['literal', [1.4, 0.7]],
              ],
            },
          },
          firstSymbolLayerId,
        )
      }

      if (!map.getLayer('route-layer')) {
        map.addLayer(
          {
            id: 'route-layer',
            type: 'line',
            source: ROUTE_SOURCE_ID,
            layout: {
              'line-cap': 'round',
              'line-join': 'round',
            },
            paint: {
              'line-color': '#f59e0b',
              'line-width': 7,
              'line-opacity': 0.96,
            },
          },
          firstSymbolLayerId,
        )
      }

      if (!map.getLayer('traffic-signals-layer')) {
        map.addLayer(
          {
            id: 'traffic-signals-layer',
            type: 'circle',
            source: TRAFFIC_SIGNALS_SOURCE_ID,
            minzoom: 11.5,
            paint: {
              'circle-color': [
                'match',
                ['get', 'kind'],
                'crossing',
                '#ef4444',
                '#b91c1c',
              ],
              'circle-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                11.5,
                2.5,
                14,
                4.5,
                17,
                6.5,
              ],
              'circle-stroke-width': 1.2,
              'circle-stroke-color': 'rgba(255,255,255,0.9)',
              'circle-opacity': 0.92,
            },
          },
          firstSymbolLayerId,
        )
      }

      if (!map.getLayer('click-points-layer')) {
        map.addLayer({
          id: 'click-points-layer',
          type: 'circle',
          source: CLICK_POINTS_SOURCE_ID,
          paint: {
            'circle-radius': [
              'match',
              ['get', 'role'],
              'start',
              8,
              9,
            ],
            'circle-color': [
              'match',
              ['get', 'role'],
              'start',
              '#16a34a',
              '#2563eb',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
          },
        })
      }

      setSourceData(map, TRAFFIC_SIGNALS_SOURCE_ID, emptyPointCollection())
      setSourceData(map, TRAFFIC_LEVELS_SOURCE_ID, emptyTrafficCollection())
      setSourceData(map, CLICK_POINTS_SOURCE_ID, emptyPointCollection())
      setSourceData(map, ROUTE_SOURCE_ID, emptyLineCollection())
    })

    map.on('click', (event) => {
      const clickedPoint: Coordinate = [event.lngLat.lng, event.lngLat.lat]

      if (!startPointRef.current || (startPointRef.current && endPointRef.current)) {
        setStartPoint(clickedPoint)
        setEndPoint(null)
        setRoute(null)
        return
      }

      setEndPoint(clickedPoint)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    setSourceData(mapRef.current, TRAFFIC_SIGNALS_SOURCE_ID, signals)
  }, [signals])

  useEffect(() => {
    setSourceData(mapRef.current, TRAFFIC_LEVELS_SOURCE_ID, trafficLevels)
  }, [trafficLevels])

  useEffect(() => {
    setSourceData(mapRef.current, CLICK_POINTS_SOURCE_ID, clickPoints)
  }, [clickPoints])

  useEffect(() => {
    setSourceData(mapRef.current, ROUTE_SOURCE_ID, routeGeoJson)
  }, [routeGeoJson])

  useEffect(() => {
    if (!router || !startPoint || !endPoint) {
      return
    }

    const nextRoute = router.route(startPoint, endPoint)
    if (!nextRoute) {
      setError('No offline driving route was found between the selected points.')
      return
    }

    setError('')
    setRoute(nextRoute)
  }, [endPoint, router, startPoint])

  useEffect(() => {
    if (!route || !mapRef.current) {
      return
    }

    const bounds = new maplibregl.LngLatBounds()
    route.coordinates.forEach((coordinate) => bounds.extend(coordinate))
    mapRef.current.fitBounds(bounds, { padding: 70, duration: 700, maxZoom: 15.8 })
  }, [route])

  return (
    <main className="app-shell">
      <div className="map-frame" ref={mapContainerRef} />

      <section className="control-card">
        <p className="eyebrow">Offline Bangalore Navigator</p>
        <h1>3D Bengaluru Drive Map</h1>
        <p className="supporting-text">
          Fully local PMTiles basemap, local traffic signals, and browser-side A* routing.
        </p>

        <div className="status-grid">
          <div>
            <span className="label">Basemap</span>
            <strong>PMTiles</strong>
          </div>
          <div>
            <span className="label">Signals</span>
            <strong>{signals.features.length}</strong>
          </div>
          <div>
            <span className="label">Road Graph</span>
            <strong>{graphReady ? 'Ready' : 'Missing'}</strong>
          </div>
          <div>
            <span className="label">Routing</span>
            <strong>A*</strong>
          </div>
          <div>
            <span className="label">Traffic Roads</span>
            <strong>{trafficLevels.features.length}</strong>
          </div>
          <div>
            <span className="label">Overlay</span>
            <strong>Red / Orange</strong>
          </div>
        </div>

        <div className="instructions">
          <p>1. Click once to place the start point.</p>
          <p>2. Click again to place the destination and compute the route.</p>
          <p>3. Click a third time to begin a new route.</p>
        </div>

        <div className="actions">
          <button
            type="button"
            onClick={() => {
              setStartPoint(null)
              setEndPoint(null)
              setRoute(null)
              setError('')
            }}
          >
            Reset Route
          </button>
          <button
            type="button"
            onClick={() => {
              mapRef.current?.fitBounds(BENGALURU_BOUNDS, {
                padding: 40,
                duration: 700,
              })
            }}
          >
            Reset View
          </button>
        </div>

        <div className="route-summary">
          <span className="label">Route Summary</span>
          <strong>{route ? formatDistance(route.distanceMeters) : 'Select two points'}</strong>
          <small>{route ? `${route.visitedNodes} nodes explored offline` : 'No route yet'}</small>
        </div>

        <p className={`runtime-message${error ? ' is-error' : ''}`}>
          {error ||
            'Synthetic traffic is rendered from a local GeoJSON overlay generated from Bengaluru road classes. Main roads and sub-roads are colored red and orange offline.'}
        </p>
      </section>
    </main>
  )
}
