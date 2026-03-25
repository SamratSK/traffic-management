import type { FeatureCollection, Point } from 'geojson'

export type TrafficSeverity = 'Low' | 'Moderate' | 'Major' | 'Severe'
export type CrowdDensityStatus = 'Low' | 'Medium' | 'High'
export type InfluenceCategory = 'live_traffic' | 'peak_traffic' | 'event'

export type LiveTrafficItem = {
  pincode: string
  location: string
  traffic_severity: TrafficSeverity
  details: string
}

export type PeakTrafficItem = {
  pincode: string
  location: string
  peak_traffic_severity: TrafficSeverity
  details: string
}

export type CrowdSectorItem = {
  density_status: CrowdDensityStatus
  estimated_people_count: number
  pincode: string
  sub_location: string
  telecom_node_id: string
}

export type CrowdApiData = {
  regional_overview: string
  source: string
  sector_data: CrowdSectorItem[]
}

export type EventItem = {
  date: string
  event_name: string
  religion_or_type: string
  venue_type: string
}

export type EventsApiData = {
  calendar_source: string
  pincode_target: string
  events: EventItem[]
}

export type ApiEnvelope<TRoute extends string, TData> = {
  status: 'success'
  route_type: TRoute
  data: TData
}

export type LiveTrafficResponse = ApiEnvelope<'live_traffic', LiveTrafficItem[]>
export type PeakTrafficResponse = ApiEnvelope<'peak_hour_traffic', PeakTrafficItem[]>
export type CrowdDensityResponse = ApiEnvelope<'telecom_crowd_density', CrowdApiData>
export type EventsResponse = ApiEnvelope<'upcoming_calendar_events', EventsApiData>

export type CrowdHeatPointProperties = {
  pincode: string
  sub_location: string
  density_status: CrowdDensityStatus
  estimated_people_count: number
  intensity: number
}

export type CrowdHeatmapCollection = FeatureCollection<Point, CrowdHeatPointProperties>

export type InfluenceHotspotProperties = {
  pincode: string
  label: string
  category: InfluenceCategory
  severity: TrafficSeverity
  radius_meters: number
  penalty: number
}

export type InfluenceHotspotCollection = FeatureCollection<Point, InfluenceHotspotProperties>

export type RouteAvoidanceHotspot = {
  coordinate: [number, number]
  radiusMeters: number
  penalty: number
  label: string
  category: 'crowd' | InfluenceCategory
}

export type CityIntelConnector = {
  getLiveTraffic: (pincode: string) => Promise<LiveTrafficResponse>
  getPeakTraffic: (pincode: string) => Promise<PeakTrafficResponse>
  getCrowdDensity: (pincode: string) => Promise<CrowdDensityResponse>
  getEvents: (pincode: string) => Promise<EventsResponse>
  getCityCrowdHeatmap: () => Promise<CrowdHeatmapCollection>
  getTrafficInfluence: (pincode: string) => Promise<InfluenceHotspotCollection>
  getEventInfluence: (pincode: string) => Promise<InfluenceHotspotCollection>
  supportedPincodes: string[]
}
