import { BENGALURU_BOUNDS, BENGALURU_CENTER } from '../constants/map'
import type { BnmitApiSnapshot, BnmitCrowdSector, BnmitEvent, BnmitTrafficIncident, BnmitUserEvent } from './bnmitApi'
import type { Coordinate } from '../types/offline'
import type { ScenarioIncident, ScenarioItemCategory } from '../types/runtime'

const [[MIN_LNG, MIN_LAT], [MAX_LNG, MAX_LAT]] = BENGALURU_BOUNDS as [[number, number], [number, number]]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hashString(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function coordinateFromPincode(pincode: string, slot: number) {
  const seed = hashString(`${pincode}:${slot}`)
  const lngSpread = MAX_LNG - MIN_LNG
  const latSpread = MAX_LAT - MIN_LAT
  const lng = MIN_LNG + (((seed % 10_000) / 10_000) * lngSpread)
  const lat = MIN_LAT + ((((Math.floor(seed / 97)) % 10_000) / 10_000) * latSpread)

  return [
    clamp((lng + BENGALURU_CENTER[0]) / 2, MIN_LNG + 0.015, MAX_LNG - 0.015),
    clamp((lat + BENGALURU_CENTER[1]) / 2, MIN_LAT + 0.015, MAX_LAT - 0.015),
  ] as Coordinate
}

function categoryFromVenue(venueType: string): ScenarioItemCategory {
  const value = venueType.toLowerCase()
  if (value.includes('temple') || value.includes('mosque')) return 'religious'
  if (value.includes('market')) return 'commercial'
  if (value.includes('transit')) return 'crowd'
  return 'cultural'
}

function crowdRadiusKm(sector: BnmitCrowdSector) {
  const people = sector.estimated_people_count
  if (people >= 3500) return 1.2
  if (people >= 2200) return 0.95
  if (people >= 1000) return 0.72
  return 0.5
}

function trafficRadiusKm(incident: BnmitTrafficIncident) {
  const severity = String(incident.traffic_severity ?? 'unknown').toLowerCase()
  if (severity === 'major') return 1.05
  if (severity === 'moderate') return 0.78
  if (severity === 'minor') return 0.52
  return 0.4
}

function trafficSeverityLabel(incident: BnmitTrafficIncident & { peak_traffic_severity?: string }) {
  return String(incident.traffic_severity ?? incident.peak_traffic_severity ?? 'Unknown')
}

function peakTrafficRadiusKm(incident: BnmitTrafficIncident & { peak_traffic_severity?: string }) {
  const severity = trafficSeverityLabel(incident).toLowerCase()
  if (severity === 'major') return 1.25
  if (severity === 'moderate') return 0.96
  if (severity === 'minor') return 0.72
  return 0.55
}

function eventRadiusKm(eventItem: BnmitEvent) {
  const venue = eventItem.venue_type.toLowerCase()
  if (venue.includes('market')) return 1.15
  if (venue.includes('pandal')) return 1
  return 0.82
}

function userEventRadiusKm(eventItem: BnmitUserEvent) {
  if (eventItem.traffic_score >= 80) return 1.35
  if (eventItem.traffic_score >= 55) return 1.1
  if (eventItem.expected_crowd >= 2000) return 0.95
  return 0.72
}

function bnmitHotspot(
  id: string,
  name: string,
  description: string,
  coordinate: Coordinate,
  radiusKm: number,
  category: ScenarioItemCategory,
  createdAt: number,
): ScenarioIncident {
  return {
    id,
    kind: 'hotspot',
    name,
    description,
    category,
    coordinate,
    radiusKm,
    createdAt,
  }
}

export function buildBnmitHotspots(snapshot: BnmitApiSnapshot, pincode: string, createdAt = Date.now()) {
  const hotspots: ScenarioIncident[] = []
  let slot = 0

  snapshot.crowd?.sector_data.slice(0, 4).forEach((sector) => {
    hotspots.push(
      bnmitHotspot(
        `bnmit-crowd-${sector.telecom_node_id}`,
        `Crowd ${sector.sub_location}`,
        `[BNMIT] ${sector.density_status} crowd. Estimated ${sector.estimated_people_count} people.`,
        coordinateFromPincode(pincode, slot),
        crowdRadiusKm(sector),
        'crowd',
        createdAt,
      ),
    )
    slot += 1
  })

  snapshot.liveTraffic.slice(0, 4).forEach((trafficItem, index) => {
    hotspots.push(
      bnmitHotspot(
        `bnmit-traffic-live-${index}-${hashString(trafficItem.location)}`,
        `Traffic ${trafficSeverityLabel(trafficItem)}`,
        `[BNMIT] ${trafficItem.location}. ${trafficItem.details}`,
        coordinateFromPincode(pincode, slot),
        trafficRadiusKm(trafficItem),
        'civic',
        createdAt,
      ),
    )
    slot += 1
  })

  snapshot.peakTraffic.slice(0, 4).forEach((trafficItem, index) => {
    hotspots.push(
      bnmitHotspot(
        `bnmit-traffic-peak-${index}-${hashString(trafficItem.location)}`,
        `Peak ${trafficSeverityLabel(trafficItem as BnmitTrafficIncident & { peak_traffic_severity?: string })}`,
        `[BNMIT Peak] ${trafficItem.location}. ${trafficItem.details}`,
        coordinateFromPincode(pincode, slot),
        peakTrafficRadiusKm(trafficItem as BnmitTrafficIncident & { peak_traffic_severity?: string }),
        'civic',
        createdAt,
      ),
    )
    slot += 1
  })

  snapshot.topTraffic.slice(0, 5).forEach((trafficItem, index) => {
    hotspots.push(
      bnmitHotspot(
        `bnmit-traffic-top-${index}-${hashString(trafficItem.location)}`,
        `Top5 ${trafficSeverityLabel(trafficItem)}`,
        `[BNMIT Top-5] ${trafficItem.location}. ${trafficItem.details}`,
        coordinateFromPincode(pincode, slot),
        peakTrafficRadiusKm(trafficItem) + 0.12,
        'civic',
        createdAt,
      ),
    )
    slot += 1
  })

  snapshot.events?.events.slice(0, 3).forEach((eventItem, index) => {
    hotspots.push(
      bnmitHotspot(
        `bnmit-event-${index}-${hashString(eventItem.event_name)}`,
        eventItem.event_name,
        `[BNMIT] ${eventItem.venue_type} on ${eventItem.date}.`,
        coordinateFromPincode(pincode, slot),
        eventRadiusKm(eventItem),
        categoryFromVenue(eventItem.venue_type),
        createdAt,
      ),
    )
    slot += 1
  })

  snapshot.userEvents.slice(0, 5).forEach((eventItem) => {
    hotspots.push(
      bnmitHotspot(
        `bnmit-user-event-${eventItem.id}`,
        eventItem.event_name,
        `[BNMIT User] ${eventItem.location} on ${eventItem.date}. Crowd ${eventItem.expected_crowd}, traffic score ${eventItem.traffic_score}.`,
        coordinateFromPincode(eventItem.location || pincode, slot),
        userEventRadiusKm(eventItem),
        'cultural',
        createdAt,
      ),
    )
    slot += 1
  })

  return hotspots
}
