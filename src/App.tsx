import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { FeatureCollection, LineString } from 'geojson'
import type { Map as MapLibreMap } from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'
import './App.css'

import { LeftToolbar } from './components/LeftToolbar'
import { fetchBnmitSnapshot, type BnmitApiSnapshot } from './lib/bnmitApi'
import { buildBnmitHotspots } from './lib/bnmitScenario'
import { SignalCameraModal } from './components/SignalCameraModal'
import { Sidebar } from './components/Sidebar'
import { StatsPanel } from './components/StatsPanel'
import { MAP_SOURCE_IDS } from './constants/map'
import {
  buildBreakoutGuideGeoJson,
  buildBreakoutWaypointGeoJson,
  buildIncidentPointsGeoJson,
  buildIncidentZonesGeoJson,
  buildProcessionGeoJson,
  buildRouteGeoJson,
  buildRouteCollectionGeoJson,
  buildSignalDirectionGeoJson,
  buildVehicleMarkersGeoJson,
  buildVehiclesGeoJson,
  buildVehicleHotspotZonesGeoJson,
  emptyLineCollection,
  emptyTrafficCollection,
  setSourceData,
} from './lib/mapData'
import { buildAllocationCounts, createScenarioId, fitCoordinates, randomSpeedWithinRange } from './lib/appUtils'
import { updateHeatmapRaster } from './lib/heatmapRaster'
import { createOfflineMap, ensureMapLayers, ensurePmtilesProtocol, resetMapSources } from './lib/mapSetup'
import { OfflineRouter } from './lib/router'
import { buildSignalCameraSceneData } from './lib/signalCameraScene'
import { normalizeSignalsToGeoJson } from './lib/signals'
import type { Coordinate, OverpassResponse, RoadGraphFile, TrafficRoadProperties } from './types/offline'
import type {
  ScenarioIncident,
  ScenarioProcession,
  SignalRuntimeProperties,
  SignalRuntimeCollection,
  SignalSourceCollection,
  SimulationLiveStats,
} from './types/runtime'
import type { SimulationSnapshot, SimulationWorkerResponse, VehiclePlan } from './types/simulation'

ensurePmtilesProtocol()

type ActiveTool = 'vehicle' | 'events' | 'hotspots' | 'simulate'
type SharedPointPicker = 'start' | 'end' | null

const EMPTY_STATS: SimulationLiveStats = {
  fleetSize: 0,
  activeEvents: 0,
  activeHotspots: 0,
  activeProcessions: 0,
  dynamicVehicleHotspots: 0,
  rerouteQueueSize: 0,
  reroutedVehicles: 0,
  arrivedVehicles: 0,
  averageSpeedKph: 0,
}

const EMPTY_SIGNAL_COLLECTION: SignalSourceCollection = {
  type: 'FeatureCollection',
  features: [],
}

const EMPTY_RUNTIME_SIGNAL_COLLECTION: SignalRuntimeCollection = {
  type: 'FeatureCollection',
  features: [],
}

const EMPTY_SIMULATION_SNAPSHOT: SimulationSnapshot = {
  visibleVehicles: [],
  visibleRoutes: [],
  vehicleStates: [],
  vehicleHotspots: [],
  signalRuntime: EMPTY_RUNTIME_SIGNAL_COLLECTION,
  stats: EMPTY_STATS,
}

type StatsHistoryPoint = {
  averageSpeedKph: number
  arrivedVehicles: number
  reroutedVehicles: number
  rerouteQueueSize: number
  optimizedSignals: number
  fps: number
}

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const simulationWorkerRef = useRef<Worker | null>(null)
  const routerRef = useRef<OfflineRouter | null>(null)
  const activeToolRef = useRef<ActiveTool>('vehicle')
  const pendingVehicleStartRef = useRef<Coordinate | null>(null)
  const vehicleDestinationModeRef = useRef('custom')
  const speedRangeRef = useRef({ min: 60, max: 90 })
  const eventIncidentsRef = useRef<ScenarioIncident[]>([])
  const incidentDraftRef = useRef({
    name: 'City Event',
    category: 'religious',
    description: 'User-defined scenario item',
    eventRadiusMinKm: 0.6,
    eventRadiusMaxKm: 1.4,
    hotspotRadiusMinKm: 0.2,
    hotspotRadiusMaxKm: 0.7,
  })
  const sharedPointPickerRef = useRef<SharedPointPicker>(null)
  const nextVehicleIdRef = useRef(1)
  const highlightTimeoutRef = useRef<number | null>(null)
  const vehiclePlansRef = useRef<VehiclePlan[]>([])
  const fleetComputeStartedAtRef = useRef<number | null>(null)
  const previousReroutedIdsRef = useRef<Set<number>>(new Set())
  const previousArrivedCountRef = useRef(0)

  const [router, setRouter] = useState<OfflineRouter | null>(null)
  const [graphData, setGraphData] = useState<RoadGraphFile | null>(null)
  const [signals, setSignals] = useState(EMPTY_SIGNAL_COLLECTION)
  const [trafficLevels, setTrafficLevels] =
    useState<FeatureCollection<LineString, TrafficRoadProperties>>(emptyTrafficCollection)
  const [incidents, setIncidents] = useState<ScenarioIncident[]>([])
  const [processions, setProcessions] = useState<ScenarioProcession[]>([])
  const [draftName, setDraftName] = useState('City Event')
  const [draftCategory, setDraftCategory] = useState('religious')
  const [draftDescription, setDraftDescription] = useState('User-defined scenario item')
  const [eventRadiusMinKm, setEventRadiusMinKm] = useState(0.6)
  const [eventRadiusMaxKm, setEventRadiusMaxKm] = useState(1.4)
  const [hotspotRadiusMinKm, setHotspotRadiusMinKm] = useState(0.2)
  const [hotspotRadiusMaxKm, setHotspotRadiusMaxKm] = useState(0.7)
  const [activeTool, setActiveTool] = useState<ActiveTool>('vehicle')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [vehicleDestinationMode, setVehicleDestinationMode] = useState('custom')
  const [pendingVehicleStart, setPendingVehicleStart] = useState<Coordinate | null>(null)
  const [pendingVehicleEnd, setPendingVehicleEnd] = useState<Coordinate | null>(null)
  const [vehiclePlans, setVehiclePlans] = useState<VehiclePlan[]>([])
  const [speedRangeMinKph, setSpeedRangeMinKph] = useState(60)
  const [speedRangeMaxKph, setSpeedRangeMaxKph] = useState(90)
  const [randomVehicleCount, setRandomVehicleCount] = useState(25)
  const [distributionOpen, setDistributionOpen] = useState(false)
  const [distributionWeights, setDistributionWeights] = useState<Record<string, number>>({ random: 100 })
  const [sameStartPoint, setSameStartPoint] = useState(false)
  const [sameEndPoint, setSameEndPoint] = useState(false)
  const [sharedStartPoint, setSharedStartPoint] = useState<Coordinate | null>(null)
  const [sharedEndPoint, setSharedEndPoint] = useState<Coordinate | null>(null)
  const [debugBreakouts, setDebugBreakouts] = useState(false)
  const [simulationRunning, setSimulationRunning] = useState(false)
  const [simulationSnapshot, setSimulationSnapshot] = useState<SimulationSnapshot>(EMPTY_SIMULATION_SNAPSHOT)
  const [focusedRoute, setFocusedRoute] = useState<ReturnType<typeof buildRouteGeoJson>>(emptyLineCollection())
  const [statsVisible, setStatsVisible] = useState(true)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null)
  const [simulationConsole, setSimulationConsole] = useState<Array<{ id: string; message: string }>>([])
  const [statsHistory, setStatsHistory] = useState<StatsHistoryPoint[]>([])
  const [selectedSignalId, setSelectedSignalId] = useState<number | null>(null)
  const [fps, setFps] = useState(0)
  const [error, setError] = useState('')
  const [bnmitPincode, setBnmitPincode] = useState('560001')
  const [bnmitLoading, setBnmitLoading] = useState(false)
  const [bnmitError, setBnmitError] = useState('')
  const [bnmitSnapshot, setBnmitSnapshot] = useState<BnmitApiSnapshot | null>(null)

  activeToolRef.current = activeTool
  pendingVehicleStartRef.current = pendingVehicleStart
  vehicleDestinationModeRef.current = vehicleDestinationMode
  speedRangeRef.current = { min: speedRangeMinKph, max: speedRangeMaxKph }
  incidentDraftRef.current = {
    name: draftName,
    category: draftCategory,
    description: draftDescription,
    eventRadiusMinKm,
    eventRadiusMaxKm,
    hotspotRadiusMinKm,
    hotspotRadiusMaxKm,
  }
  vehiclePlansRef.current = vehiclePlans

  function pushSimulationLog(message: string) {
    setSimulationConsole((current) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, message },
      ...current,
    ].slice(0, 80))
  }

  const refreshBnmitData = useCallback(async (targetPincode = bnmitPincode) => {
    setBnmitLoading(true)
    setBnmitError('')
    try {
      const snapshot = await fetchBnmitSnapshot(targetPincode)
      setBnmitSnapshot(snapshot)
      setIncidents((current) => {
        const preserved = current.filter((item) => !item.id.startsWith('bnmit-'))
        const imported = buildBnmitHotspots(snapshot, targetPincode)
        return [...preserved, ...imported]
      })
      pushSimulationLog(
        `BNMIT API synced for ${targetPincode}: ${snapshot.liveTraffic.length} live incidents, ${snapshot.events?.events.length ?? 0} events, hotspots imported`,
      )
    } catch (bnmitFetchError) {
      setBnmitError(
        bnmitFetchError instanceof Error
          ? bnmitFetchError.message
          : 'Unable to load BNMIT API data.',
      )
    } finally {
      setBnmitLoading(false)
    }
  }, [bnmitPincode])

  useEffect(() => {
    routerRef.current = router
  }, [router])

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

        const nextRouter = new OfflineRouter(graph)
        setGraphData(graph)
        setRouter(nextRouter)
        setSignals(normalizeSignalsToGeoJson(rawSignals))
        setTrafficLevels(trafficLevelsGeoJson)
        setError('')
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
    const worker = new Worker(new URL('./workers/simulationWorker.ts', import.meta.url), {
      type: 'module',
    })

    simulationWorkerRef.current = worker

    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      if (event.data.type === 'snapshot') {
        const snapshot = event.data.payload
        setSimulationSnapshot(snapshot)

        if (fleetComputeStartedAtRef.current !== null && snapshot.stats.fleetSize === vehiclePlansRef.current.length) {
          const durationSeconds = ((performance.now() - fleetComputeStartedAtRef.current) / 1000).toFixed(2)
          pushSimulationLog(`Computing paths done for ${vehiclePlansRef.current.length} vehicles (${durationSeconds}s)`)
          fleetComputeStartedAtRef.current = null
        }

        const nextRerouted = new Set(
          snapshot.visibleVehicles.filter((vehicle) => vehicle.rerouted).map((vehicle) => vehicle.id),
        )
        nextRerouted.forEach((vehicleId) => {
          if (previousReroutedIdsRef.current.has(vehicleId)) {
            return
          }
          const vehicle = snapshot.visibleVehicles.find((item) => item.id === vehicleId)
          const impactScore = vehicle ? Math.max(8, Math.round(vehicle.speedKph * 0.35)) : 10
          pushSimulationLog(`Vehicle ${vehicleId} changed course. Impact score +${impactScore}`)
        })
        previousReroutedIdsRef.current = nextRerouted

        const arrivedCount = snapshot.stats.arrivedVehicles
        if (arrivedCount > previousArrivedCountRef.current) {
          pushSimulationLog(`Arrival update: ${arrivedCount}/${snapshot.stats.fleetSize} vehicles reached destination`)
        }
        previousArrivedCountRef.current = arrivedCount
        return
      }

      if (event.data.type === 'vehicle-route' && event.data.route) {
        setFocusedRoute(buildRouteGeoJson(event.data.route))
        fitCoordinates(mapRef.current, event.data.route.coordinates)
        if (highlightTimeoutRef.current !== null) {
          window.clearTimeout(highlightTimeoutRef.current)
        }
        highlightTimeoutRef.current = window.setTimeout(() => {
          setFocusedRoute(emptyLineCollection())
          highlightTimeoutRef.current = null
        }, 2000)
      }
    }

    return () => {
      worker.terminate()
      simulationWorkerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!simulationWorkerRef.current || !graphData) {
      return
    }

    simulationWorkerRef.current.postMessage({
      type: 'init',
      graph: graphData,
      signals,
    })
  }, [graphData, signals])

  useEffect(() => {
    simulationWorkerRef.current?.postMessage({
      type: 'sync-scenario',
      incidents,
      processions,
    })
  }, [incidents, processions])

  useEffect(() => {
    simulationWorkerRef.current?.postMessage({
      type: 'set-fleet',
      vehicles: vehiclePlans,
    })
    if (vehiclePlans.length > 0) {
      fleetComputeStartedAtRef.current = performance.now()
    } else {
      fleetComputeStartedAtRef.current = null
    }
    setSimulationRunning(false)
    setFocusedRoute(emptyLineCollection())
  }, [vehiclePlans])

  useEffect(() => {
    simulationWorkerRef.current?.postMessage({
      type: 'set-running',
      running: simulationRunning,
    })
    pushSimulationLog(simulationRunning ? 'Simulation started' : 'Simulation stopped')
  }, [simulationRunning])

  const eventIncidents = useMemo(
    () => incidents.filter((incident) => incident.kind === 'event'),
    [incidents],
  )
  const hotspotIncidents = useMemo(
    () => incidents.filter((incident) => incident.kind === 'hotspot'),
    [incidents],
  )
  const editingIncident = useMemo(
    () => incidents.find((incident) => incident.id === editingIncidentId) ?? null,
    [editingIncidentId, incidents],
  )

  useEffect(() => {
    eventIncidentsRef.current = eventIncidents
  }, [eventIncidents])

  useEffect(() => {
    setDistributionWeights((current) => {
      const next: Record<string, number> = {
        random: current.random ?? 100,
      }

      eventIncidents.forEach((incident) => {
        next[`event:${incident.id}`] = current[`event:${incident.id}`] ?? 0
      })

      return next
    })

    setVehicleDestinationMode((current) => {
      if (current === 'custom') {
        return current
      }

      const hasMatchingEvent = eventIncidents.some((incident) => `event:${incident.id}` === current)
      return hasMatchingEvent ? current : 'custom'
    })
  }, [eventIncidents])

  const signalRuntime = simulationSnapshot.signalRuntime.features.length > 0
    ? simulationSnapshot.signalRuntime
    : EMPTY_RUNTIME_SIGNAL_COLLECTION
  const optimizedSignals = signalRuntime.features.filter((feature) => feature.properties.optimized).length

  const signalStateCounts = useMemo(
    () =>
      signalRuntime.features.reduce(
        (counts, feature) => {
          counts[feature.properties.signalState] += 1
          return counts
        },
        { go: 0, hold: 0, stop: 0 },
      ),
    [signalRuntime],
  )
  const selectedSignal = useMemo(() => {
    if (selectedSignalId === null) {
      return null
    }

    return signalRuntime.features.find((feature) => feature.properties.signalId === selectedSignalId)?.properties ?? null
  }, [selectedSignalId, signalRuntime])
  const selectedSignalScene = useMemo(() => {
    if (selectedSignalId === null) {
      return null
    }

    const signalFeature = signalRuntime.features.find((feature) => feature.properties.signalId === selectedSignalId)
    if (!signalFeature) {
      return null
    }

    return buildSignalCameraSceneData(
      signalFeature.geometry.coordinates as Coordinate,
      trafficLevels,
      simulationSnapshot.visibleRoutes,
      simulationSnapshot.visibleVehicles,
    )
  }, [selectedSignalId, signalRuntime, simulationSnapshot.visibleRoutes, simulationSnapshot.visibleVehicles, trafficLevels])

  useEffect(() => {
    setStatsHistory((current) => [
      ...current.slice(-35),
      {
        averageSpeedKph: simulationSnapshot.stats.averageSpeedKph,
        arrivedVehicles: simulationSnapshot.stats.arrivedVehicles,
        reroutedVehicles: simulationSnapshot.stats.reroutedVehicles,
        rerouteQueueSize: simulationSnapshot.stats.rerouteQueueSize,
        optimizedSignals,
        fps,
      },
    ])
  }, [fps, optimizedSignals, simulationSnapshot.stats])

  useEffect(() => {
    let frameId = 0
    let frameCount = 0
    let startedAt = performance.now()

    const tick = (timestamp: number) => {
      frameCount += 1
      if (timestamp - startedAt >= 500) {
        setFps(Math.round((frameCount * 1000) / (timestamp - startedAt)))
        frameCount = 0
        startedAt = timestamp
      }
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  useEffect(() => {
    void refreshBnmitData('560001')
  }, [refreshBnmitData])

  const destinationOptions = useMemo(
    () => [
      { value: 'custom', label: 'Custom start and end points' },
      ...eventIncidents.map((incident) => ({
        value: `event:${incident.id}`,
        label: `To ${incident.name}`,
      })),
    ],
    [eventIncidents],
  )

  const distributionRows = useMemo(
    () => [
      { key: 'random', label: 'Random End Point', value: distributionWeights.random ?? 0 },
      ...eventIncidents.map((incident) => ({
        key: `event:${incident.id}`,
        label: `To ${incident.name}`,
        value: distributionWeights[`event:${incident.id}`] ?? 0,
      })),
    ],
    [distributionWeights, eventIncidents],
  )
  const incidentPointsGeoJson = useMemo(() => buildIncidentPointsGeoJson(incidents), [incidents])
  const incidentZonesGeoJson = useMemo(() => buildIncidentZonesGeoJson(incidents), [incidents])
  const processionsGeoJson = useMemo(() => buildProcessionGeoJson(processions), [processions])
  const clickPointsGeoJson = useMemo(
    () =>
      buildVehicleMarkersGeoJson(
        vehiclePlans.map((vehicle) => ({ start: vehicle.start, end: vehicle.end })),
        activeTool === 'vehicle' ? pendingVehicleStart : null,
        activeTool === 'vehicle' ? pendingVehicleEnd : null,
      ),
    [activeTool, pendingVehicleEnd, pendingVehicleStart, vehiclePlans],
  )
  const vehicleGeoJson = useMemo(
    () =>
      buildVehiclesGeoJson(
        simulationSnapshot.visibleVehicles.map((vehicle) => ({
          id: vehicle.id,
          position: vehicle.position,
        })),
      ),
    [simulationSnapshot.visibleVehicles],
  )
  const routeGeoJson = useMemo(
    () =>
      buildRouteCollectionGeoJson(
        simulationSnapshot.visibleRoutes.map((item) => ({
          route: item.route,
          label: item.targetName,
          id: item.id,
        })),
      ),
    [simulationSnapshot.visibleRoutes],
  )
  const vehicleStateById = useMemo(
    () => new Map(simulationSnapshot.vehicleStates.map((item) => [item.id, item])),
    [simulationSnapshot.vehicleStates],
  )
  const sortedVehiclePlans = useMemo(
    () =>
      [...vehiclePlans]
        .map((vehicle) => {
          const runtime = vehicleStateById.get(vehicle.id)
          return {
            ...vehicle,
            arrived: runtime?.arrived ?? false,
            currentSpeedKph: runtime?.currentSpeedKph ?? 0,
          }
        })
        .sort((left, right) => Number(left.arrived) - Number(right.arrived) || left.id - right.id),
    [vehiclePlans, vehicleStateById],
  )
  const vehicleHotspotZonesGeoJson = useMemo(
    () => buildVehicleHotspotZonesGeoJson(simulationSnapshot.vehicleHotspots),
    [simulationSnapshot.vehicleHotspots],
  )
  const signalDirectionGeoJson = useMemo(() => buildSignalDirectionGeoJson(signalRuntime), [signalRuntime])
  const debugBreakoutPointGeoJson = useMemo(
    () =>
      buildBreakoutWaypointGeoJson(
        debugBreakouts ? simulationSnapshot.visibleVehicles : [],
      ),
    [debugBreakouts, simulationSnapshot.visibleVehicles],
  )
  const debugBreakoutGuideGeoJson = useMemo(
    () =>
      buildBreakoutGuideGeoJson(
        debugBreakouts ? simulationSnapshot.visibleVehicles : [],
      ),
    [debugBreakouts, simulationSnapshot.visibleVehicles],
  )

  function appendVehiclePlan(start: Coordinate, end: Coordinate, targetName: string, targetIncidentId: string | null) {
    const id = nextVehicleIdRef.current
    nextVehicleIdRef.current += 1

    const plan: VehiclePlan = {
      id,
      label: `Vehicle ${id}`,
      start,
      end,
      speedKph: randomSpeedWithinRange(speedRangeRef.current.min, speedRangeRef.current.max),
      targetName,
      targetIncidentId,
    }

    setVehiclePlans((current) => [...current, plan])
  }

  function resetVehiclePlacementDraft() {
    setPendingVehicleStart(null)
    setPendingVehicleEnd(null)
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return
    }

    const map = createOfflineMap(mapContainerRef.current)
    mapRef.current = map
    popupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'map-tooltip',
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.doubleClickZoom.disable()

    map.on('style.load', () => {
      ensureMapLayers(map)
      resetMapSources(map)
    })

    map.on('click', (event) => {
      const currentActiveTool = activeToolRef.current
      const currentRouter = routerRef.current
      const clickedPoint: Coordinate = [event.lngLat.lng, event.lngLat.lat]

      if (currentActiveTool === 'vehicle') {
        const activeSharedPicker = sharedPointPickerRef.current
        if (activeSharedPicker === 'start') {
          setSharedStartPoint(clickedPoint)
          sharedPointPickerRef.current = null
          setVehiclePlans((current) => current.map((vehicle) => ({
            ...vehicle,
            start: clickedPoint,
          })))
          pushSimulationLog(`Applied shared start point to ${vehiclePlansRef.current.length} vehicles`)
          setError('')
          return
        }

        if (activeSharedPicker === 'end') {
          setSharedEndPoint(clickedPoint)
          sharedPointPickerRef.current = null
          setVehiclePlans((current) => current.map((vehicle) => ({
            ...vehicle,
            end: clickedPoint,
            targetName: 'Shared endpoint',
            targetIncidentId: null,
          })))
          pushSimulationLog(`Applied shared end point to ${vehiclePlansRef.current.length} vehicles`)
          setError('')
          return
        }

        if (!currentRouter) {
          setError('Road graph is still loading.')
          return
        }

        if (vehicleDestinationModeRef.current === 'custom') {
          if (!pendingVehicleStartRef.current) {
            setPendingVehicleStart(clickedPoint)
            setPendingVehicleEnd(null)
            setError('')
            return
          }

          setPendingVehicleEnd(clickedPoint)
          appendVehiclePlan(
            pendingVehicleStartRef.current,
            clickedPoint,
            'Custom destination',
            null,
          )
          resetVehiclePlacementDraft()
          setError('')
          return
        }

        const eventId = vehicleDestinationModeRef.current.replace('event:', '')
        const incident = eventIncidentsRef.current.find((item) => item.id === eventId)
        if (!incident) {
          setError('Select a valid destination event before placing a vehicle.')
          return
        }

        appendVehiclePlan(clickedPoint, incident.coordinate, incident.name, incident.id)
        setError('')
        return
      }

      if (currentActiveTool === 'events' || currentActiveTool === 'hotspots') {
        const kind = currentActiveTool === 'events' ? 'event' : 'hotspot'
        const minRadius = kind === 'event'
          ? incidentDraftRef.current.eventRadiusMinKm
          : incidentDraftRef.current.hotspotRadiusMinKm
        const maxRadius = kind === 'event'
          ? incidentDraftRef.current.eventRadiusMaxKm
          : incidentDraftRef.current.hotspotRadiusMaxKm
        const radiusKm = Number((minRadius + Math.random() * Math.max(0, maxRadius - minRadius)).toFixed(2))

        setIncidents((currentIncidents) => [
          ...currentIncidents,
          {
            id: createScenarioId(kind),
            kind,
            name: incidentDraftRef.current.name.trim() || (kind === 'event' ? 'Event' : 'Hotspot'),
            description: incidentDraftRef.current.description.trim() || 'User-defined scenario item',
            category: incidentDraftRef.current.category as ScenarioIncident['category'],
            coordinate: clickedPoint,
            radiusKm,
            createdAt: Date.now(),
          },
        ])
        setError('')
        return
      }

    })

    map.on('dblclick', (event) => {
      const mapInstance = mapRef.current
      if (!mapInstance) {
        return
      }

      const signalFeature = mapInstance.queryRenderedFeatures(event.point, {
        layers: ['traffic-signals-layer', 'traffic-signals-pulse-layer'],
      })[0]

      if (signalFeature) {
        event.preventDefault?.()
        const signalId = Number(signalFeature.properties?.signalId)
        if (Number.isFinite(signalId)) {
          setSelectedSignalId(signalId)
          return
        }
      }

      mapInstance.easeTo({
        center: event.lngLat,
        zoom: Math.min(17.4, mapInstance.getZoom() + 0.75),
        duration: 420,
      })
    })

    map.on('mousemove', (event) => {
      const mapInstance = mapRef.current
      const popup = popupRef.current
      if (!mapInstance || !popup) {
        return
      }

      const features = mapInstance.queryRenderedFeatures(event.point, {
        layers: [
          'traffic-signals-layer',
          'traffic-signals-pulse-layer',
          'incident-zones-layer',
          'incident-points-layer',
          'processions-layer',
          'vehicle-hotspots-layer',
          'vehicle-hotspots-outline-layer',
        ],
      })

      const feature = features[0]
      if (!feature) {
        mapInstance.getCanvas().style.cursor = ''
        popup.remove()
        return
      }

      mapInstance.getCanvas().style.cursor = 'pointer'
      const properties = feature.properties ?? {}
      const root = document.createElement('div')
      root.className = 'tooltip-card'

      const title = document.createElement('strong')
      title.textContent = String(
        properties.name
          ?? (feature.layer.id.includes('traffic-signals') ? `Traffic Light ${properties.signalId ?? ''}` : 'Scenario item'),
      )
      root.appendChild(title)

      const meta = document.createElement('p')
      meta.textContent = [
        properties.signalState ? `state ${String(properties.signalState)}` : '',
        properties.optimized ? 'adaptive' : '',
        properties.kind ?? properties.category ?? 'overlay',
        properties.radiusKm ? `${properties.radiusKm} km radius` : '',
        properties.vehicleCount ? `${properties.vehicleCount} vehicles` : '',
        properties.cycleSeconds ? `${Number(properties.cycleSeconds).toFixed(0)}s cycle` : '',
      ]
        .filter(Boolean)
        .join(' | ')
      root.appendChild(meta)

      const description = document.createElement('p')
      description.textContent = String(
        properties.description
          ?? (properties.signalState
            ? `Demand score ${Number(properties.demandScore ?? 0).toFixed(2)}. Double-click to open CCTV simulation.`
            : 'No description provided.'),
      )
      root.appendChild(description)

      if (
        typeof properties.id === 'string'
        && (
          feature.layer.id === 'incident-zones-layer'
          || feature.layer.id === 'incident-points-layer'
          || feature.layer.id === 'processions-layer'
        )
      ) {
        const deleteButton = document.createElement('button')
        deleteButton.type = 'button'
        deleteButton.textContent = 'Delete'
        deleteButton.onclick = () => {
          if (feature.layer.id === 'processions-layer') {
            setProcessions((currentProcessions) => currentProcessions.filter((item) => item.id !== properties.id))
          } else {
            setIncidents((currentIncidents) => currentIncidents.filter((item) => item.id !== properties.id))
          }

          popup.remove()
        }
        root.appendChild(deleteButton)
      }

      popup.setDOMContent(root).setLngLat(event.lngLat).addTo(mapInstance)
    })

    return () => {
      popupRef.current?.remove()
      popupRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.trafficSignals, signalRuntime)
  }, [signalRuntime])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.trafficSignalDirections, signalDirectionGeoJson)
  }, [signalDirectionGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.trafficLevels, trafficLevels)
  }, [trafficLevels])

  useEffect(() => {
    updateHeatmapRaster(
      mapRef.current,
      incidents,
      simulationSnapshot.vehicleHotspots,
      showHeatmap,
    )
  }, [incidents, showHeatmap, simulationSnapshot.vehicleHotspots])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.clickPoints, clickPointsGeoJson)
  }, [clickPointsGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.route, routeGeoJson)
  }, [routeGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.shortestRoute, focusedRoute)
  }, [focusedRoute])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.vehicle, vehicleGeoJson)
  }, [vehicleGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.incidentPoints, incidentPointsGeoJson)
  }, [incidentPointsGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.incidentZones, incidentZonesGeoJson)
  }, [incidentZonesGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.processions, processionsGeoJson)
  }, [processionsGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.vehicleHotspots, vehicleHotspotZonesGeoJson)
  }, [vehicleHotspotZonesGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.debugBreakoutPoints, debugBreakoutPointGeoJson)
  }, [debugBreakoutPointGeoJson])

  useEffect(() => {
    setSourceData(mapRef.current, MAP_SOURCE_IDS.debugBreakoutLines, debugBreakoutGuideGeoJson)
  }, [debugBreakoutGuideGeoJson])

  const simulationProgressPercent = simulationSnapshot.stats.fleetSize > 0
    ? (simulationSnapshot.stats.arrivedVehicles / simulationSnapshot.stats.fleetSize) * 100
    : 0

  function focusVehicle(vehicleId: number) {
    simulationWorkerRef.current?.postMessage({
      type: 'get-vehicle-route',
      vehicleId,
    })
  }

  function removeVehicle(vehicleId: number) {
    setVehiclePlans((current) => current.filter((vehicle) => vehicle.id !== vehicleId))
  }

  function clearAllVehicles() {
    setVehiclePlans([])
    resetVehiclePlacementDraft()
    setSimulationRunning(false)
    setFocusedRoute(emptyLineCollection())
    pushSimulationLog('Vehicle fleet cleared')
  }

  function randomizeVehicles() {
    if (!router) {
      setError('Road graph is still loading.')
      return
    }

    const allocationCounts = buildAllocationCounts(distributionRows, randomVehicleCount)
    const nextPlans: VehiclePlan[] = []

    allocationCounts.forEach((count, key) => {
      for (let index = 0; index < count; index += 1) {
        const start = router.randomRoadCoordinate()
        if (!start) {
          continue
        }

        let end: Coordinate | null = null
        let targetName = 'Random endpoint'
        let targetIncidentId: string | null = null

        if (key === 'random') {
          end = router.randomRoadCoordinate()
        } else {
          const incident = eventIncidents.find((item) => `event:${item.id}` === key)
          end = incident?.coordinate ?? null
          targetName = incident?.name ?? 'Unknown event'
          targetIncidentId = incident?.id ?? null
        }

        if (!end) {
          continue
        }

        const id = nextVehicleIdRef.current
        nextVehicleIdRef.current += 1
        nextPlans.push({
          id,
          label: `Vehicle ${id}`,
          start,
          end,
          speedKph: randomSpeedWithinRange(speedRangeRef.current.min, speedRangeRef.current.max),
          targetName,
          targetIncidentId,
        })
      }
    })

    setVehiclePlans((current) => [...current, ...nextPlans])
    pushSimulationLog(`Queued ${nextPlans.length} randomized vehicles`)
    setError('')
  }

  function applyDistributionToCurrentRoutes() {
    if (vehiclePlans.length === 0) {
      setError('No current vehicles available to randomize.')
      return
    }

    if (!router) {
      setError('Road graph is still loading.')
      return
    }

    const allocationCounts = buildAllocationCounts(distributionRows, vehiclePlans.length)
    const destinations: Array<{
      end: Coordinate
      targetName: string
      targetIncidentId: string | null
    }> = []

    allocationCounts.forEach((count, key) => {
      for (let index = 0; index < count; index += 1) {
        if (key === 'random') {
          const end = router.randomRoadCoordinate()
          if (!end) {
            continue
          }
          destinations.push({
            end,
            targetName: 'Random endpoint',
            targetIncidentId: null,
          })
          continue
        }

        const incident = eventIncidents.find((item) => `event:${item.id}` === key)
        if (!incident) {
          continue
        }

        destinations.push({
          end: incident.coordinate,
          targetName: incident.name,
          targetIncidentId: incident.id,
        })
      }
    })

    if (destinations.length === 0) {
      setError('No valid destination distribution available.')
      return
    }

    setVehiclePlans((current) =>
      current.map((vehicle, index) => {
        const destination = destinations[index % destinations.length]
        return {
          ...vehicle,
          end: destination.end,
          targetName: destination.targetName,
          targetIncidentId: destination.targetIncidentId,
        }
      }),
    )
    setDistributionOpen(false)
    pushSimulationLog(`Randomized current routes for ${vehiclePlans.length} vehicles`)
    setError('')
  }

  function focusIncident(incidentId: string) {
    const incident = incidents.find((item) => item.id === incidentId)
    if (!incident) return
    const bounds = new maplibregl.LngLatBounds()
    const delta = Math.max(0.004, incident.radiusKm * 0.012)
    bounds.extend([incident.coordinate[0] - delta, incident.coordinate[1] - delta])
    bounds.extend([incident.coordinate[0] + delta, incident.coordinate[1] + delta])
    mapRef.current?.fitBounds(bounds, { padding: 100, duration: 600, maxZoom: 15.8 })
  }

  function removeIncident(incidentId: string) {
    setIncidents((current) => current.filter((item) => item.id !== incidentId))
    if (editingIncidentId === incidentId) {
      setEditingIncidentId(null)
    }
  }

  return (
    <main className="app-shell">
      <div className="map-frame" ref={mapContainerRef} />

      <LeftToolbar
        activeTool={activeTool}
        onSelectTool={(tool) => {
          setActiveTool(tool)
          setSidebarCollapsed(false)
        }}
      />

      <Sidebar
        collapsed={sidebarCollapsed}
        activeTool={activeTool}
        error={error}
        onCollapse={() => setSidebarCollapsed(true)}
        destinationOptions={destinationOptions}
        vehicleDestinationMode={vehicleDestinationMode}
        onVehicleDestinationModeChange={(value) => {
          setVehicleDestinationMode(value)
          resetVehiclePlacementDraft()
        }}
        speedRangeMinKph={speedRangeMinKph}
        speedRangeMaxKph={speedRangeMaxKph}
        onSpeedRangeMinKphChange={(value) => setSpeedRangeMinKph(Math.max(10, Math.min(value, speedRangeMaxKph)))}
        onSpeedRangeMaxKphChange={(value) => setSpeedRangeMaxKph(Math.max(speedRangeMinKph, Math.min(220, value)))}
        pendingVehicleStart={pendingVehicleStart}
        pendingVehicleEnd={pendingVehicleEnd}
        vehicles={sortedVehiclePlans}
        onClearAllVehicles={clearAllVehicles}
        randomVehicleCount={randomVehicleCount}
        onRandomVehicleCountChange={setRandomVehicleCount}
        onRandomizeVehicles={randomizeVehicles}
        distributionOpen={distributionOpen}
        onToggleDistributionOpen={() => setDistributionOpen((current) => !current)}
        distributionRows={distributionRows}
        onDistributionValueChange={(key, value) => {
          setDistributionWeights((current) => ({
            ...current,
            [key]: value,
          }))
        }}
        onApplyDistributionToCurrentRoutes={applyDistributionToCurrentRoutes}
        sameStartPoint={sameStartPoint}
        sameEndPoint={sameEndPoint}
        onSameStartPointChange={(value) => {
          setSameStartPoint(value)
          if (!value) {
            setSharedStartPoint(null)
            if (sharedPointPickerRef.current === 'start') {
              sharedPointPickerRef.current = null
            }
          }
        }}
        onSameEndPointChange={(value) => {
          setSameEndPoint(value)
          if (!value) {
            setSharedEndPoint(null)
            if (sharedPointPickerRef.current === 'end') {
              sharedPointPickerRef.current = null
            }
          }
        }}
        onPickSharedStart={() => {
          setActiveTool('vehicle')
          sharedPointPickerRef.current = 'start'
          setError('Click on the map to choose the shared vehicle start point.')
        }}
        onPickSharedEnd={() => {
          setActiveTool('vehicle')
          sharedPointPickerRef.current = 'end'
          setError('Click on the map to choose the shared vehicle end point.')
        }}
        sharedStartPoint={sharedStartPoint}
        sharedEndPoint={sharedEndPoint}
        simulationRunning={simulationRunning}
        onToggleSimulationRunning={() => setSimulationRunning((current) => !current)}
        simulationProgressPercent={simulationProgressPercent}
        simulationConsole={simulationConsole}
        onClearSimulationConsole={() => setSimulationConsole([])}
        debugBreakouts={debugBreakouts}
        onToggleDebugBreakouts={() => setDebugBreakouts((current) => !current)}
        bnmitPincode={bnmitPincode}
        onBnmitPincodeChange={setBnmitPincode}
        onRefreshBnmitData={() => {
          void refreshBnmitData()
        }}
        bnmitLoading={bnmitLoading}
        bnmitError={bnmitError}
        bnmitSnapshot={bnmitSnapshot}
        events={eventIncidents}
        hotspots={hotspotIncidents}
        eventRadiusMinKm={eventRadiusMinKm}
        eventRadiusMaxKm={eventRadiusMaxKm}
        onEventRadiusMinKmChange={(value) => setEventRadiusMinKm(Math.max(0.1, Math.min(value, eventRadiusMaxKm)))}
        onEventRadiusMaxKmChange={(value) => setEventRadiusMaxKm(Math.max(eventRadiusMinKm, Math.min(10, value)))}
        hotspotRadiusMinKm={hotspotRadiusMinKm}
        hotspotRadiusMaxKm={hotspotRadiusMaxKm}
        onHotspotRadiusMinKmChange={(value) => setHotspotRadiusMinKm(Math.max(0.1, Math.min(value, hotspotRadiusMaxKm)))}
        onHotspotRadiusMaxKmChange={(value) => setHotspotRadiusMaxKm(Math.max(hotspotRadiusMinKm, Math.min(10, value)))}
        pendingDraftName={draftName}
        setPendingDraftName={setDraftName}
        pendingDraftCategory={draftCategory}
        setPendingDraftCategory={setDraftCategory}
        pendingDraftDescription={draftDescription}
        setPendingDraftDescription={setDraftDescription}
        onIncidentFocus={focusIncident}
        onIncidentEdit={setEditingIncidentId}
        onIncidentRemove={removeIncident}
        onClearEvents={() => setIncidents((current) => current.filter((item) => item.kind !== 'event'))}
        onClearHotspots={() => setIncidents((current) => current.filter((item) => item.kind !== 'hotspot'))}
        editingIncident={editingIncident}
        onEditDraftChange={(field, value) => {
          setIncidents((current) =>
            current.map((item) => {
              if (item.id !== editingIncidentId) return item
              if (field === 'radiusKm') return { ...item, radiusKm: Number(value) || item.radiusKm }
              return { ...item, [field]: String(value) }
            }),
          )
        }}
        onSaveIncidentEdit={() => setEditingIncidentId(null)}
        onCancelIncidentEdit={() => setEditingIncidentId(null)}
        showHeatmap={showHeatmap}
        onToggleHeatmap={() => setShowHeatmap((current) => !current)}
        onVehicleFocus={focusVehicle}
        onVehicleRemove={removeVehicle}
      />

      {statsVisible ? (
        <StatsPanel
          stats={simulationSnapshot.stats}
          optimizedSignals={optimizedSignals}
          onClose={() => setStatsVisible(false)}
          signalStates={signalStateCounts}
          history={statsHistory}
          fps={fps}
        />
      ) : (
        <button type="button" className="stats-reopen" onClick={() => setStatsVisible(true)}>
          Open Stats
        </button>
      )}

      {selectedSignal && selectedSignalScene ? (
        <SignalCameraModal
          signal={selectedSignal as SignalRuntimeProperties}
          scene={selectedSignalScene}
          onClose={() => setSelectedSignalId(null)}
        />
      ) : null}
    </main>
  )
}
