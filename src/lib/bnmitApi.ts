export type BnmitTrafficIncident = {
  pincode: string
  location: string
  traffic_severity: string
  details: string
}

export type BnmitCrowdSector = {
  pincode: string
  sub_location: string
  telecom_node_id: string
  estimated_people_count: number
  density_status: string
}

export type BnmitCrowdResponse = {
  source: string
  regional_overview: string
  sector_data: BnmitCrowdSector[]
}

export type BnmitEvent = {
  event_name: string
  date: string
  religion_or_type: string
  venue_type: string
}

export type BnmitEventsResponse = {
  pincode_target: string
  calendar_source: string
  events: BnmitEvent[]
}

export type BnmitUserEvent = {
  id: number
  event_name: string
  location: string
  date: string
  expected_crowd: number
  traffic_score: number
  created_at: string
}

export type BnmitApiSnapshot = {
  liveTraffic: BnmitTrafficIncident[]
  peakTraffic: BnmitTrafficIncident[]
  topTraffic: BnmitTrafficIncident[]
  crowd: BnmitCrowdResponse | null
  events: BnmitEventsResponse | null
  userEvents: BnmitUserEvent[]
}

type BnmitEnvelope<T> = {
  data: T
  status: string
  route_type: string
}

const DEFAULT_BASE_URL = import.meta.env.VITE_BNMIT_API_BASE_URL ?? '/bnmit-api'

async function fetchEnvelope<T>(path: string) {
  const response = await fetch(`${DEFAULT_BASE_URL}${path}`)
  if (!response.ok) {
    throw new Error(`BNMIT API request failed: ${response.status}`)
  }

  return response.json() as Promise<BnmitEnvelope<T>>
}

export async function fetchBnmitSnapshot(pincode: string): Promise<BnmitApiSnapshot> {
  const normalized = pincode.trim()
  if (!normalized) {
    throw new Error('Pincode is required for BNMIT API fetch.')
  }

  const [liveTraffic, peakTraffic, crowd, events, topTraffic, userEvents] = await Promise.all([
    fetchEnvelope<BnmitTrafficIncident[]>(`/api/traffic/live?pincode=${encodeURIComponent(normalized)}`),
    fetchEnvelope<BnmitTrafficIncident[]>(`/api/traffic/peak?pincode=${encodeURIComponent(normalized)}`),
    fetchEnvelope<BnmitCrowdResponse>(`/api/crowd?pincode=${encodeURIComponent(normalized)}`),
    fetchEnvelope<BnmitEventsResponse>(`/api/events?pincode=${encodeURIComponent(normalized)}`),
    fetchEnvelope<BnmitTrafficIncident[]>('/api/traffic/top5'),
    fetchEnvelope<BnmitUserEvent[]>('/api/user_events'),
  ])

  return {
    liveTraffic: liveTraffic.data ?? [],
    peakTraffic: peakTraffic.data ?? [],
    crowd: crowd.data ?? null,
    events: events.data ?? null,
    topTraffic: topTraffic.data ?? [],
    userEvents: userEvents.data ?? [],
  }
}
