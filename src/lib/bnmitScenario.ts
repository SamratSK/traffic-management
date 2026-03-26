import { BENGALURU_BOUNDS, BENGALURU_CENTER } from '../constants/map'
import type { BnmitApiSnapshot, BnmitCrowdSector, BnmitEvent, BnmitTrafficIncident } from './bnmitApi'
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
  const severity = incident.traffic_severity.toLowerCase()
  if (severity === 'major') return 1.05
  if (severity === 'moderate') return 0.78
  if (severity === 'minor') return 0.52
  return 0.4
}

function eventRadiusKm(eventItem: BnmitEvent) {
  const venue = eventItem.venue_type.toLowerCase()
  if (venue.includes('market')) return 1.15
  if (venue.includes('pandal')) return 1
  return 0.82
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
        `Traffic ${trafficItem.traffic_severity}`,
        `[BNMIT] ${trafficItem.location}. ${trafficItem.details}`,
        coordinateFromPincode(pincode, slot),
        trafficRadiusKm(trafficItem),
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

  return hotspots
}
