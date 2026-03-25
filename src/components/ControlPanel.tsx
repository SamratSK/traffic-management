import { cityIntelConnector } from '../lib/cityIntelConnector'
import { BENGALURU_BOUNDS } from '../constants/map'
import { formatDistance } from '../lib/geo'
import type {
  CrowdDensityResponse,
  CrowdHeatmapCollection,
  EventsResponse,
  LiveTrafficResponse,
  PeakTrafficResponse,
  RouteAvoidanceHotspot,
} from '../types/cityIntel'
import type { Map } from 'maplibre-gl'
import type { RouteResult } from '../types/offline'
import type { FeatureCollection, LineString, Point } from 'geojson'
import type { TrafficRoadProperties } from '../types/offline'

type ControlPanelProps = {
  signals: FeatureCollection<Point>
  graphReady: boolean
  trafficLevels: FeatureCollection<LineString, TrafficRoadProperties>
  crowdHeatmap: CrowdHeatmapCollection
  routeAvoidanceHotspots: RouteAvoidanceHotspot[]
  selectedPincode: string
  setSelectedPincode: (value: string) => void
  showTrafficSignals: boolean
  setShowTrafficSignals: (value: boolean) => void
  vehicleSpeedKph: number
  setVehicleSpeedKph: (value: number) => void
  setStartPoint: (value: null) => void
  setEndPoint: (value: null) => void
  setRoute: (value: null) => void
  setShortestRoute: (value: null) => void
  setError: (value: string) => void
  map: Map | null
  route: RouteResult | null
  shortestRoute: RouteResult | null
  liveTraffic: LiveTrafficResponse | null
  peakTraffic: PeakTrafficResponse | null
  crowdDensity: CrowdDensityResponse | null
  events: EventsResponse | null
  error: string
  connectorError: string
  generateBusyDemoRoute: () => void
}

export function ControlPanel({
  signals,
  graphReady,
  trafficLevels,
  crowdHeatmap,
  routeAvoidanceHotspots,
  selectedPincode,
  setSelectedPincode,
  showTrafficSignals,
  setShowTrafficSignals,
  vehicleSpeedKph,
  setVehicleSpeedKph,
  setStartPoint,
  setEndPoint,
  setRoute,
  setShortestRoute,
  setError,
  map,
  route,
  shortestRoute,
  liveTraffic,
  peakTraffic,
  crowdDensity,
  events,
  error,
  connectorError,
  generateBusyDemoRoute,
}: ControlPanelProps) {
  return (
    <section className="control-card">
      <p className="eyebrow">Offline Bangalore Navigator</p>
      <h1>3D Bengaluru Drive Map</h1>
      <p className="supporting-text">
        Fully local PMTiles basemap, local traffic signals, and browser-side A* routing.
      </p>

      <div className="status-grid">
        <div><span className="label">Basemap</span><strong>PMTiles</strong></div>
        <div><span className="label">Signals</span><strong>{signals.features.length}</strong></div>
        <div><span className="label">Road Graph</span><strong>{graphReady ? 'Ready' : 'Missing'}</strong></div>
        <div><span className="label">Routing</span><strong>A*</strong></div>
        <div><span className="label">Traffic Roads</span><strong>{trafficLevels.features.length}</strong></div>
        <div><span className="label">Overlay</span><strong>Red / Orange</strong></div>
        <div><span className="label">Crowd Nodes</span><strong>{crowdHeatmap.features.length}</strong></div>
        <div><span className="label">Connector</span><strong>Mocked</strong></div>
        <div><span className="label">Avoidance Zones</span><strong>{routeAvoidanceHotspots.length}</strong></div>
        <div><span className="label">Rerouting</span><strong>Penalty A*</strong></div>
      </div>

      <div className="connector-panel">
        <label className="field-label" htmlFor="pincode">Pincode Connector</label>
        <select id="pincode" value={selectedPincode} onChange={(event) => setSelectedPincode(event.target.value)}>
          {cityIntelConnector.supportedPincodes.map((pincode) => (
            <option key={pincode} value={pincode}>{pincode}</option>
          ))}
        </select>
        <p className="helper-text">
          Mock connector responses are loaded for the selected pincode while the city-wide heatmap stays visible.
        </p>
      </div>

      <label className="toggle-row" htmlFor="traffic-signals-toggle">
        <input
          id="traffic-signals-toggle"
          type="checkbox"
          checked={showTrafficSignals}
          onChange={(event) => setShowTrafficSignals(event.target.checked)}
        />
        <span>Show Traffic Signals</span>
      </label>

      <div className="slider-panel">
        <div className="slider-header">
          <span className="field-label">Vehicle Speed</span>
          <strong>{vehicleSpeedKph} km/h</strong>
        </div>
        <input
          type="range"
          min="8"
          max="72"
          step="2"
          value={vehicleSpeedKph}
          onChange={(event) => setVehicleSpeedKph(Number(event.target.value))}
        />
      </div>

      <div className="instructions">
        <p>1. Click once to place the start point.</p>
        <p>2. Click again to place the destination and compute the route.</p>
        <p>3. Click a third time to begin a new route.</p>
      </div>

      <div className="actions">
        <button type="button" onClick={generateBusyDemoRoute}>
          Pick Random Points
        </button>
        <button
          type="button"
          onClick={() => {
            setStartPoint(null)
            setEndPoint(null)
            setRoute(null)
            setShortestRoute(null)
            setError('')
          }}
        >
          Reset Route
        </button>
        <button
          type="button"
          onClick={() => {
            map?.fitBounds(BENGALURU_BOUNDS, { padding: 40, duration: 700 })
          }}
        >
          Reset View
        </button>
      </div>

      <div className="route-summary">
        <span className="label">Route Summary</span>
        <strong>{route ? formatDistance(route.distanceMeters) : 'Select two points'}</strong>
        <small>
          {route && shortestRoute
            ? `Shortest ${formatDistance(shortestRoute.distanceMeters)} | Optimized ${formatDistance(route.distanceMeters)}`
            : 'No route yet'}
        </small>
      </div>

      <div className="intel-grid">
        <div className="intel-card">
          <span className="label">Live Traffic API</span>
          <strong>{liveTraffic?.data[0]?.traffic_severity ?? 'No data'}</strong>
          <p>{liveTraffic?.data[0]?.location ?? 'Waiting for connector data.'}</p>
        </div>
        <div className="intel-card">
          <span className="label">Peak Hour API</span>
          <strong>{peakTraffic?.data[0]?.peak_traffic_severity ?? 'No data'}</strong>
          <p>{peakTraffic?.data[0]?.location ?? 'Waiting for connector data.'}</p>
        </div>
        <div className="intel-card">
          <span className="label">Crowd Density API</span>
          <strong>{crowdDensity?.data.sector_data[0]?.density_status ?? 'No data'}</strong>
          <p>{crowdDensity?.data.regional_overview ?? 'Waiting for connector data.'}</p>
        </div>
        <div className="intel-card">
          <span className="label">Events API</span>
          <strong>{events?.data.events[0]?.event_name ?? 'No data'}</strong>
          <p>{events?.data.events[0]?.date ?? 'Waiting for connector data.'}</p>
        </div>
      </div>

      <p className={`runtime-message${error ? ' is-error' : ''}`}>
        {error ||
          connectorError ||
          'Traffic and event zones now render as large zoom-scaled influence areas, and routing treats crowd, traffic, and events as avoidance penalties so it will accept longer detours when they are cheaper overall.'}
      </p>
    </section>
  )
}
