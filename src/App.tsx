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
  buildMultiClickPointsGeoJson,
  buildRouteCollectionGeoJson,
  buildRoutePairGeoJson,
  buildVehiclesGeoJson,
  buildVehicleGeoJson,
  emptyCrowdHeatmapCollection,
  emptyInfluenceCollection,
  emptyPointCollection,
  emptyTrafficCollection,
  setSourceData,
} from './lib/mapData'
import { createOfflineMap, ensureMapLayers, ensurePmtilesProtocol, resetMapSources } from './lib/mapSetup'
import { pickBusyDemoFleetPoints } from './lib/demoRoute'
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

type DemoVehicleRoute = {
  id: number
  speedKph: number
  start: Coordinate
  end: Coordinate
  shortestRoute: RouteResult
  optimizedRoute: RouteResult
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const startPointRef = useRef<Coordinate | null>(null)
  const endPointRef = useRef<Coordinate | null>(null)
  const demoVehicleRoutesRef = useRef<DemoVehicleRoute[]>([])
  const demoVehiclePositionsRef = useRef<Array<{ id: number; position: Coordinate }>>([])
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
  const [injectedEvents, setInjectedEvents] =
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
  const [vehicleCount, setVehicleCount] = useState(3)
  const [demoVehicleRoutes, setDemoVehicleRoutes] = useState<DemoVehicleRoute[]>([])
  const [demoVehiclePositions, setDemoVehiclePositions] = useState<Array<{ id: number; position: Coordinate }>>([])
  const [error, setError] = useState('')
  const [connectorError, setConnectorError] = useState('')

  const clickPoints = useMemo(
    () =>
      demoVehicleRoutes.length > 0
        ? buildMultiClickPointsGeoJson(
            demoVehicleRoutes.map((item) => ({ start: item.start, end: item.end })),
          )
        : buildClickPointsGeoJson(startPoint, endPoint),
    [demoVehicleRoutes, endPoint, startPoint],
  )
  const routeGeoJson = useMemo(
    () =>
      demoVehicleRoutes.length > 0
        ? buildRouteCollectionGeoJson(
            demoVehicleRoutes.map((item) => ({
              route: item.optimizedRoute,
              label: 'optimized',
              id: item.id,
            })),
          )
        : buildRoutePairGeoJson(route, 'optimized'),
    [demoVehicleRoutes, route],
  )
  const shortestRouteGeoJson = useMemo(
    () =>
      demoVehicleRoutes.length > 0
        ? buildRouteCollectionGeoJson(
            demoVehicleRoutes.map((item) => ({
              route: item.shortestRoute,
              label: 'shortest',
              id: item.id,
            })),
          )
        : buildRoutePairGeoJson(shortestRoute, 'shortest'),
    [demoVehicleRoutes, shortestRoute],
  )
  const vehicleGeoJson = useMemo(
    () =>
      demoVehicleRoutes.length > 0
        ? buildVehiclesGeoJson(demoVehiclePositions)
        : buildVehicleGeoJson(vehiclePosition),
    [demoVehiclePositions, demoVehicleRoutes.length, vehiclePosition],
  )
  const routeAvoidanceHotspots = useMemo(
    () => buildRouteAvoidanceHotspots(crowdHeatmap, trafficInfluence, {
      type: 'FeatureCollection',
      features: [...eventInfluence.features, ...injectedEvents.features],
    }),
    [crowdHeatmap, eventInfluence.features, injectedEvents.features, trafficInfluence],
  )

  useEffect(() => {
    startPointRef.current = startPoint
  }, [startPoint])

  useEffect(() => {
    endPointRef.current = endPoint
  }, [endPoint])

  useEffect(() => {
    demoVehicleRoutesRef.current = demoVehicleRoutes
  }, [demoVehicleRoutes])

  useEffect(() => {
    demoVehiclePositionsRef.current = demoVehiclePositions
  }, [demoVehiclePositions])

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
        setDemoVehicleRoutes([])
        setDemoVehiclePositions([])
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
    if (signals.features.length === 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      setSignals((currentSignals) => ({
        ...currentSignals,
        features: currentSignals.features.map((feature, index) => ({
          ...feature,
          properties: {
            ...feature.properties,
            signalState:
              (Number(feature.properties?.signalId ?? index) + Math.floor(Date.now() / 4000)) % 2 === 0
                ? 'go'
                : 'stop',
          },
        })),
      }))
    }, 4000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [signals.features.length])

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
    setSourceData(mapRef.current, MAP_SOURCE_IDS.eventInfluence, {
      type: 'FeatureCollection',
      features: [...eventInfluence.features, ...injectedEvents.features],
    })
  }, [eventInfluence, injectedEvents])

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

    if (demoVehicleRoutes.length > 0) {
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
  }, [demoVehicleRoutes.length, endPoint, routeAvoidanceHotspots, router, startPoint])

  function generateBusyDemoRoute() {
    if (!router) {
      setError('Road graph is still loading.')
      return
    }

    const generatedRoutes: DemoVehicleRoute[] = []
    const fleetPoints = pickBusyDemoFleetPoints(router, routeAvoidanceHotspots, vehicleCount)

    for (let index = 0; index < fleetPoints.length; index += 1) {
      const demoPoints = fleetPoints[index]
      const nextShortestRoute = router.route(demoPoints.startPoint, demoPoints.endPoint)
      const nextOptimizedRoute = router.route(demoPoints.startPoint, demoPoints.endPoint, {
        hotspots: routeAvoidanceHotspots,
      })

      if (!nextShortestRoute || !nextOptimizedRoute) {
        continue
      }

      generatedRoutes.push({
        id: index + 1,
        speedKph: 30 + Math.floor(Math.random() * 91),
        start: demoPoints.startPoint,
        end: demoPoints.endPoint,
        shortestRoute: nextShortestRoute,
        optimizedRoute: nextOptimizedRoute,
      })
    }

    if (generatedRoutes.length === 0) {
      setError('Busy demo route is not available yet.')
      return
    }

    setError('')
    setStartPoint(null)
    setEndPoint(null)
    setShortestRoute(generatedRoutes[0]?.shortestRoute ?? null)
    setRoute(generatedRoutes[0]?.optimizedRoute ?? null)
    setDemoVehicleRoutes(generatedRoutes)
  }

  function injectLiveEvent() {
    const eventCenter = mapRef.current?.getCenter()
    const coordinate: Coordinate = eventCenter
      ? [eventCenter.lng, eventCenter.lat]
      : routeAvoidanceHotspots[0]?.coordinate ?? [77.5946, 12.9716]

    setInjectedEvents({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            pincode: selectedPincode,
            label: `Injected Event ${new Date().toLocaleTimeString()}`,
            category: 'event',
            severity: 'Severe',
            radius_meters: 1800,
            penalty: 4.5,
          },
          geometry: {
            type: 'Point',
            coordinates: coordinate,
          },
        },
      ],
    })
  }

  useEffect(() => {
    if (!router || demoVehicleRoutesRef.current.length === 0 || demoVehiclePositionsRef.current.length === 0) {
      return
    }

    const nextRoutes = demoVehicleRoutesRef.current
      .map((vehicle) => {
        const currentPosition =
          demoVehiclePositionsRef.current.find((item) => item.id === vehicle.id)?.position ?? vehicle.start
        const nextOptimizedRoute = router.route(currentPosition, vehicle.end, {
          hotspots: routeAvoidanceHotspots,
        })

        if (!nextOptimizedRoute) {
          return null
        }

        return {
          ...vehicle,
          start: currentPosition,
          optimizedRoute: nextOptimizedRoute,
        }
      })
      .filter((item): item is DemoVehicleRoute => item !== null)

    if (nextRoutes.length > 0) {
      setDemoVehicleRoutes(nextRoutes)
    }
  }, [injectedEvents, routeAvoidanceHotspots, router])

  useEffect(() => {
    if (vehicleAnimationFrameRef.current) {
      cancelAnimationFrame(vehicleAnimationFrameRef.current)
      vehicleAnimationFrameRef.current = null
    }

    vehicleAnimationStartRef.current = null

    if (demoVehicleRoutes.length > 0) {
      setVehiclePosition(null)
      setDemoVehiclePositions(
        demoVehicleRoutes.map((item) => ({
          id: item.id,
          position: item.optimizedRoute.coordinates[0] ?? item.start,
        })),
      )

      const routeMetrics = demoVehicleRoutes.map((item) => ({
        id: item.id,
        speedMetersPerSecond: item.speedKph / 3.6,
        metrics: buildRouteMetrics(item.optimizedRoute.coordinates),
      }))

      const animateFleet = (timestamp: number) => {
        if (vehicleAnimationStartRef.current === null) {
          vehicleAnimationStartRef.current = timestamp
        }

        const elapsedSeconds = (timestamp - vehicleAnimationStartRef.current) / 1000
        const nextPositions = routeMetrics.map((item) => {
          const traveledDistance = elapsedSeconds * item.speedMetersPerSecond
          const position =
            samplePositionAlongRoute(
              item.metrics.path,
              item.metrics.cumulativeDistances,
              traveledDistance,
            ) ?? item.metrics.path[item.metrics.path.length - 1]

          return {
            id: item.id,
            position,
          }
        })

        setDemoVehiclePositions(nextPositions)

        const shouldContinue = routeMetrics.some((item) => {
          const traveledDistance = elapsedSeconds * item.speedMetersPerSecond
          return traveledDistance < item.metrics.totalDistanceMeters
        })

        if (shouldContinue) {
          vehicleAnimationFrameRef.current = requestAnimationFrame(animateFleet)
          return
        }

        vehicleAnimationFrameRef.current = null
      }

      vehicleAnimationFrameRef.current = requestAnimationFrame(animateFleet)

      return () => {
        if (vehicleAnimationFrameRef.current) {
          cancelAnimationFrame(vehicleAnimationFrameRef.current)
          vehicleAnimationFrameRef.current = null
        }
      }
    }

    if (!route || route.coordinates.length < 2) {
      setVehiclePosition(null)
      setDemoVehiclePositions([])
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
  }, [demoVehicleRoutes, route, vehicleSpeedKph])

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
        vehicleCount={vehicleCount}
        setVehicleCount={setVehicleCount}
        clearDemoVehicles={() => {
          setDemoVehicleRoutes([])
          setDemoVehiclePositions([])
        }}
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
        injectLiveEvent={injectLiveEvent}
      />
    </main>
  )
}
