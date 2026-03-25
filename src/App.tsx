import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { Map } from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

import { ControlPanel } from './components/ControlPanel'
import { MAP_SOURCE_IDS } from './constants/map'
import { cityIntelConnector } from './lib/cityIntelConnector'
import {
  buildClickPointsGeoJson,
  buildRoutePairGeoJson,
  buildVehicleGeoJson,
  emptyCrowdHeatmapCollection,
  emptyInfluenceCollection,
  emptyPointCollection,
  emptyTrafficCollection,
  setSourceData,
} from './lib/mapData'
import { createOfflineMap, ensureMapLayers, ensurePmtilesProtocol, resetMapSources } from './lib/mapSetup'
import { pickBusyDemoPoints } from './lib/demoRoute'
import { OfflineRouter } from './lib/router'
import { buildRouteAvoidanceHotspots } from './lib/routeHotspots'
import { normalizeSignalsToGeoJson } from './lib/signals'
import { buildRouteMetrics, samplePositionAlongRoute } from './lib/vehicle'
import type {
  CrowdDensityResponse,
  CrowdHeatmapCollection,
  EventsResponse,
  InfluenceHotspotCollection,
  LiveTrafficResponse,
  PeakTrafficResponse,
} from './types/cityIntel'
import type { Coordinate, OverpassResponse, RoadGraphFile, RouteResult, TrafficRoadProperties } from './types/offline'

ensurePmtilesProtocol()

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const startPointRef = useRef<Coordinate | null>(null)
  const endPointRef = useRef<Coordinate | null>(null)
  const vehicleAnimationFrameRef = useRef<number | null>(null)
  const vehicleAnimationStartRef = useRef<number | null>(null)

  const [router, setRouter] = useState<OfflineRouter | null>(null)
  const [graphReady, setGraphReady] = useState(false)
  const [signals, setSignals] = useState<FeatureCollection<Point>>(emptyPointCollection)
  const [trafficLevels, setTrafficLevels] =
    useState<FeatureCollection<LineString, TrafficRoadProperties>>(emptyTrafficCollection)
  const [crowdHeatmap, setCrowdHeatmap] = useState<CrowdHeatmapCollection>(emptyCrowdHeatmapCollection)
  const [trafficInfluence, setTrafficInfluence] =
    useState<InfluenceHotspotCollection>(emptyInfluenceCollection)
  const [eventInfluence, setEventInfluence] =
    useState<InfluenceHotspotCollection>(emptyInfluenceCollection)
  const [startPoint, setStartPoint] = useState<Coordinate | null>(null)
  const [endPoint, setEndPoint] = useState<Coordinate | null>(null)
  const [shortestRoute, setShortestRoute] = useState<RouteResult | null>(null)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [selectedPincode, setSelectedPincode] = useState(cityIntelConnector.supportedPincodes[0] ?? '560070')
  const [liveTraffic, setLiveTraffic] = useState<LiveTrafficResponse | null>(null)
  const [peakTraffic, setPeakTraffic] = useState<PeakTrafficResponse | null>(null)
  const [crowdDensity, setCrowdDensity] = useState<CrowdDensityResponse | null>(null)
  const [events, setEvents] = useState<EventsResponse | null>(null)
  const [showTrafficSignals, setShowTrafficSignals] = useState(true)
  const [vehiclePosition, setVehiclePosition] = useState<Coordinate | null>(null)
  const [vehicleSpeedKph, setVehicleSpeedKph] = useState(32)
  const [error, setError] = useState('')
  const [connectorError, setConnectorError] = useState('')

  const clickPoints = useMemo(() => buildClickPointsGeoJson(startPoint, endPoint), [startPoint, endPoint])
  const routeGeoJson = useMemo(() => buildRoutePairGeoJson(route, 'optimized'), [route])
  const shortestRouteGeoJson = useMemo(
    () => buildRoutePairGeoJson(shortestRoute, 'shortest'),
    [shortestRoute],
  )
  const vehicleGeoJson = useMemo(() => buildVehicleGeoJson(vehiclePosition), [vehiclePosition])
  const routeAvoidanceHotspots = useMemo(
    () => buildRouteAvoidanceHotspots(crowdHeatmap, trafficInfluence, eventInfluence),
    [crowdHeatmap, trafficInfluence, eventInfluence],
  )

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
        setCrowdHeatmap(await cityIntelConnector.getCityCrowdHeatmap())
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load offline map data.')
        }
      }
    }

    loadOfflineData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadConnectorData() {
      try {
        const [
          nextLiveTraffic,
          nextPeakTraffic,
          nextCrowdDensity,
          nextEvents,
          nextTrafficInfluence,
          nextEventInfluence,
        ] = await Promise.all([
          cityIntelConnector.getLiveTraffic(selectedPincode),
          cityIntelConnector.getPeakTraffic(selectedPincode),
          cityIntelConnector.getCrowdDensity(selectedPincode),
          cityIntelConnector.getEvents(selectedPincode),
          cityIntelConnector.getTrafficInfluence(selectedPincode),
          cityIntelConnector.getEventInfluence(selectedPincode),
        ])

        if (cancelled) {
          return
        }

        setLiveTraffic(nextLiveTraffic)
        setPeakTraffic(nextPeakTraffic)
        setCrowdDensity(nextCrowdDensity)
        setEvents(nextEvents)
        setTrafficInfluence(nextTrafficInfluence)
        setEventInfluence(nextEventInfluence)
        setConnectorError('')
      } catch (loadError) {
        if (!cancelled) {
          setConnectorError(
            loadError instanceof Error ? loadError.message : 'Unable to load connector mock data.',
          )
        }
      }
    }

    loadConnectorData()
    return () => {
      cancelled = true
    }
  }, [selectedPincode])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = createOfflineMap(mapContainerRef.current)
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('style.load', () => {
      ensureMapLayers(map)
      resetMapSources(map)
    })

    map.on('click', (event) => {
      const clickedPoint: Coordinate = [event.lngLat.lng, event.lngLat.lat]

      if (!startPointRef.current || (startPointRef.current && endPointRef.current)) {
        setStartPoint(clickedPoint)
        setEndPoint(null)
        setRoute(null)
        setShortestRoute(null)
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
    setSourceData(mapRef.current, MAP_SOURCE_IDS.trafficSignals, signals)
  }, [signals])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('traffic-signals-layer')) {
      return
    }

    map.setLayoutProperty('traffic-signals-layer', 'visibility', showTrafficSignals ? 'visible' : 'none')
  }, [showTrafficSignals])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.trafficLevels, trafficLevels)
  }, [trafficLevels])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.crowdHeatmap, crowdHeatmap)
  }, [crowdHeatmap])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.trafficInfluence, trafficInfluence)
  }, [trafficInfluence])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.eventInfluence, eventInfluence)
  }, [eventInfluence])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.clickPoints, clickPoints)
  }, [clickPoints])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.shortestRoute, shortestRouteGeoJson)
  }, [shortestRouteGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.route, routeGeoJson)
  }, [routeGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.vehicle, vehicleGeoJson)
  }, [vehicleGeoJson])

  useEffect(() => {
    if (!router || !startPoint || !endPoint) {
      return
    }

    const nextShortestRoute = router.route(startPoint, endPoint)
    const nextOptimizedRoute = router.route(startPoint, endPoint, { hotspots: routeAvoidanceHotspots })
    if (!nextShortestRoute || !nextOptimizedRoute) {
      setError('No offline driving route was found between the selected points.')
      return
    }

    setError('')
    setShortestRoute(nextShortestRoute)
    setRoute(nextOptimizedRoute)
  }, [endPoint, routeAvoidanceHotspots, router, startPoint])

  function generateBusyDemoRoute() {
    if (!router) {
      setError('Road graph is still loading.')
      return
    }

    const demoPoints = pickBusyDemoPoints(router, routeAvoidanceHotspots)
    if (!demoPoints) {
      setError('Busy demo route is not available yet.')
      return
    }

    setError('')
    setStartPoint(demoPoints.startPoint)
    setEndPoint(demoPoints.endPoint)
  }

  useEffect(() => {
    if (vehicleAnimationFrameRef.current) {
      cancelAnimationFrame(vehicleAnimationFrameRef.current)
      vehicleAnimationFrameRef.current = null
    }

    vehicleAnimationStartRef.current = null

    if (!route || route.coordinates.length < 2) {
      setVehiclePosition(null)
      return
    }

    const metrics = buildRouteMetrics(route.coordinates)
    const speedMetersPerSecond = vehicleSpeedKph / 3.6
    setVehiclePosition(route.coordinates[0])

    const animateVehicle = (timestamp: number) => {
      if (vehicleAnimationStartRef.current === null) {
        vehicleAnimationStartRef.current = timestamp
      }

      const elapsedSeconds = (timestamp - vehicleAnimationStartRef.current) / 1000
      const traveledDistance = elapsedSeconds * speedMetersPerSecond
      const nextPosition = samplePositionAlongRoute(metrics.path, metrics.cumulativeDistances, traveledDistance)

      if (nextPosition) {
        setVehiclePosition(nextPosition)
      }

      if (traveledDistance < metrics.totalDistanceMeters) {
        vehicleAnimationFrameRef.current = requestAnimationFrame(animateVehicle)
        return
      }

      setVehiclePosition(metrics.path[metrics.path.length - 1] ?? null)
      vehicleAnimationFrameRef.current = null
    }

    vehicleAnimationFrameRef.current = requestAnimationFrame(animateVehicle)

    return () => {
      if (vehicleAnimationFrameRef.current) {
        cancelAnimationFrame(vehicleAnimationFrameRef.current)
        vehicleAnimationFrameRef.current = null
      }
    }
  }, [route, vehicleSpeedKph])

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
      <ControlPanel
        signals={signals}
        graphReady={graphReady}
        trafficLevels={trafficLevels}
        crowdHeatmap={crowdHeatmap}
        routeAvoidanceHotspots={routeAvoidanceHotspots}
        selectedPincode={selectedPincode}
        setSelectedPincode={setSelectedPincode}
        showTrafficSignals={showTrafficSignals}
        setShowTrafficSignals={setShowTrafficSignals}
        vehicleSpeedKph={vehicleSpeedKph}
        setVehicleSpeedKph={setVehicleSpeedKph}
        setStartPoint={setStartPoint as (value: null) => void}
        setEndPoint={setEndPoint as (value: null) => void}
        setRoute={setRoute as (value: null) => void}
        setShortestRoute={setShortestRoute as (value: null) => void}
        setError={setError}
        map={mapRef.current}
        route={route}
        shortestRoute={shortestRoute}
        liveTraffic={liveTraffic}
        peakTraffic={peakTraffic}
        crowdDensity={crowdDensity}
        events={events}
        error={error}
        connectorError={connectorError}
        generateBusyDemoRoute={generateBusyDemoRoute}
      />
    </main>
  )
}
