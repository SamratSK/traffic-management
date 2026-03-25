import type { Feature, Point } from 'geojson'

import type {
  CityIntelConnector,
  CrowdHeatPointProperties,
  CrowdHeatmapCollection,
  CrowdSectorItem,
  EventsResponse,
  InfluenceCategory,
  InfluenceHotspotCollection,
  InfluenceHotspotProperties,
  LiveTrafficResponse,
  PeakTrafficResponse,
  TrafficSeverity,
} from '../types/cityIntel'

type AreaRecord = {
  pincode: string
  center: [number, number]
  liveTraffic: LiveTrafficResponse['data']
  peakTraffic: PeakTrafficResponse['data']
  crowdSectors: Array<CrowdSectorItem & { coordinate: [number, number] }>
  events: EventsResponse['data']['events']
}

const areaRecords: AreaRecord[] = [
  {
    pincode: '560070',
    center: [77.5652, 12.9249],
    liveTraffic: [
      {
        pincode: '560070',
        location: 'Banashankari Temple Ward to JP Nagar 2nd Phase',
        traffic_severity: 'Moderate',
        details: 'Queuing traffic | Delays of up to 5 minutes',
      },
      {
        pincode: '560070',
        location: 'Outer Ring Road link near Kathriguppe',
        traffic_severity: 'Major',
        details: 'Signal spillback and dense turning movement near the junction.',
      },
    ],
    peakTraffic: [
      {
        pincode: '560070',
        location: 'Kanakapura Road approach',
        peak_traffic_severity: 'Major',
        details: 'Heavy congestion typically from 9:00 AM - 11:00 AM and 5:00 PM - 8:00 PM.',
      },
    ],
    crowdSectors: [
      {
        density_status: 'High',
        estimated_people_count: 3104,
        pincode: '560070',
        sub_location: 'Sector A (Commercial)',
        telecom_node_id: 'NODE-1456',
        coordinate: [77.5698, 12.9262],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1280,
        pincode: '560070',
        sub_location: 'Sector B (Transit Edge)',
        telecom_node_id: 'NODE-1457',
        coordinate: [77.5607, 12.9224],
      },
      {
        density_status: 'Low',
        estimated_people_count: 250,
        pincode: '560070',
        sub_location: 'Sector C (Residential)',
        telecom_node_id: 'NODE-4211',
        coordinate: [77.5554, 12.9185],
      },
    ],
    events: [
      {
        date: '2026-04-09',
        event_name: 'Ramzan (Eid-ul-Fitr)',
        religion_or_type: 'Islamic',
        venue_type: 'Mosques',
      },
      {
        date: '2026-04-14',
        event_name: 'Ugadi',
        religion_or_type: 'Hindu',
        venue_type: 'Temples',
      },
    ],
  },
  {
    pincode: '560001',
    center: [77.5946, 12.9763],
    liveTraffic: [
      {
        pincode: '560001',
        location: 'MG Road to Residency Road corridor',
        traffic_severity: 'Major',
        details: 'Dense central business district traffic with repeated stop-start movement.',
      },
    ],
    peakTraffic: [
      {
        pincode: '560001',
        location: 'Cubbon Road and MG Road spine',
        peak_traffic_severity: 'Severe',
        details: 'Peak congestion usually from 8:30 AM - 11:30 AM and 5:30 PM - 9:00 PM.',
      },
    ],
    crowdSectors: [
      {
        density_status: 'High',
        estimated_people_count: 4200,
        pincode: '560001',
        sub_location: 'CBD West',
        telecom_node_id: 'NODE-1101',
        coordinate: [77.5924, 12.9738],
      },
      {
        density_status: 'High',
        estimated_people_count: 3880,
        pincode: '560001',
        sub_location: 'MG Road Retail Belt',
        telecom_node_id: 'NODE-1102',
        coordinate: [77.6009, 12.9756],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1440,
        pincode: '560001',
        sub_location: 'Cubbon Edge',
        telecom_node_id: 'NODE-1103',
        coordinate: [77.5888, 12.9788],
      },
    ],
    events: [
      {
        date: '2026-04-18',
        event_name: 'City Book Fair',
        religion_or_type: 'Cultural',
        venue_type: 'Convention Centers',
      },
    ],
  },
  {
    pincode: '560034',
    center: [77.6309, 12.9352],
    liveTraffic: [
      {
        pincode: '560034',
        location: 'Koramangala 80 Feet Road',
        traffic_severity: 'Major',
        details: 'Commercial frontage traffic and intersection delays.',
      },
    ],
    peakTraffic: [
      {
        pincode: '560034',
        location: 'Intermediate Ring Road junction cluster',
        peak_traffic_severity: 'Major',
        details: 'Recurring evening congestion from 5:00 PM - 9:00 PM with long queue lengths.',
      },
    ],
    crowdSectors: [
      {
        density_status: 'High',
        estimated_people_count: 3520,
        pincode: '560034',
        sub_location: 'Startup District',
        telecom_node_id: 'NODE-3401',
        coordinate: [77.6248, 12.9348],
      },
      {
        density_status: 'High',
        estimated_people_count: 2990,
        pincode: '560034',
        sub_location: 'Forum Junction',
        telecom_node_id: 'NODE-3402',
        coordinate: [77.6226, 12.9358],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1180,
        pincode: '560034',
        sub_location: 'Inner Layouts',
        telecom_node_id: 'NODE-3403',
        coordinate: [77.6389, 12.9311],
      },
    ],
    events: [
      {
        date: '2026-04-21',
        event_name: 'Open Air Music Night',
        religion_or_type: 'Cultural',
        venue_type: 'Public Grounds',
      },
    ],
  },
  {
    pincode: '560037',
    center: [77.6964, 12.9559],
    liveTraffic: [
      {
        pincode: '560037',
        location: 'Marathahalli Bridge to IT corridor',
        traffic_severity: 'Severe',
        details: 'Prolonged slowing with merge conflict near the bridge ramps.',
      },
    ],
    peakTraffic: [
      {
        pincode: '560037',
        location: 'Outer Ring Road tech belt',
        peak_traffic_severity: 'Severe',
        details: 'Morning and evening commutes cause heavy recurring saturation from 8:00 AM - 11:00 AM and 5:00 PM - 9:30 PM.',
      },
    ],
    crowdSectors: [
      {
        density_status: 'High',
        estimated_people_count: 4600,
        pincode: '560037',
        sub_location: 'Marathahalli Bridge',
        telecom_node_id: 'NODE-3701',
        coordinate: [77.7019, 12.9566],
      },
      {
        density_status: 'High',
        estimated_people_count: 4100,
        pincode: '560037',
        sub_location: 'IT Campus Edge',
        telecom_node_id: 'NODE-3702',
        coordinate: [77.6923, 12.9624],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1680,
        pincode: '560037',
        sub_location: 'Residential Pocket',
        telecom_node_id: 'NODE-3703',
        coordinate: [77.6884, 12.9495],
      },
    ],
    events: [
      {
        date: '2026-04-23',
        event_name: 'Tech Expo',
        religion_or_type: 'Business',
        venue_type: 'Convention Centers',
      },
    ],
  },
  {
    pincode: '560066',
    center: [77.7470, 12.9954],
    liveTraffic: [
      {
        pincode: '560066',
        location: 'Whitefield Main Road',
        traffic_severity: 'Major',
        details: 'Slow urban arterial flow with bus-bay interference.',
      },
    ],
    peakTraffic: [
      {
        pincode: '560066',
        location: 'Whitefield approaches to ITPL',
        peak_traffic_severity: 'Major',
        details: 'Recurring buildup from 8:30 AM - 10:30 AM and 5:00 PM - 8:30 PM.',
      },
    ],
    crowdSectors: [
      {
        density_status: 'High',
        estimated_people_count: 3780,
        pincode: '560066',
        sub_location: 'ITPL Core',
        telecom_node_id: 'NODE-6601',
        coordinate: [77.7476, 12.9977],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1840,
        pincode: '560066',
        sub_location: 'Metro Feeder Zone',
        telecom_node_id: 'NODE-6602',
        coordinate: [77.7522, 12.9914],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1490,
        pincode: '560066',
        sub_location: 'Retail Spine',
        telecom_node_id: 'NODE-6603',
        coordinate: [77.7411, 12.9944],
      },
    ],
    events: [
      {
        date: '2026-04-28',
        event_name: 'Community Sports Carnival',
        religion_or_type: 'Community',
        venue_type: 'Schools and Grounds',
      },
    ],
  },
  {
    pincode: '560076',
    center: [77.5966, 12.9042],
    liveTraffic: [
      {
        pincode: '560076',
        location: 'Bannerghatta Road hospital stretch',
        traffic_severity: 'Moderate',
        details: 'Medical district traffic and frequent curbside interruption.',
      },
    ],
    peakTraffic: [
      {
        pincode: '560076',
        location: 'Bannerghatta Main Road',
        peak_traffic_severity: 'Major',
        details: 'Strong school and office-hour buildup from 8:00 AM - 10:00 AM and 4:30 PM - 8:00 PM.',
      },
    ],
    crowdSectors: [
      {
        density_status: 'High',
        estimated_people_count: 2670,
        pincode: '560076',
        sub_location: 'Hospital District',
        telecom_node_id: 'NODE-7601',
        coordinate: [77.6007, 12.9031],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1380,
        pincode: '560076',
        sub_location: 'Transit Junction',
        telecom_node_id: 'NODE-7602',
        coordinate: [77.5928, 12.9092],
      },
      {
        density_status: 'Low',
        estimated_people_count: 520,
        pincode: '560076',
        sub_location: 'Residential Fringe',
        telecom_node_id: 'NODE-7603',
        coordinate: [77.5894, 12.8987],
      },
    ],
    events: [
      {
        date: '2026-04-17',
        event_name: 'Temple Anniversary Procession',
        religion_or_type: 'Hindu',
        venue_type: 'Temples',
      },
    ],
  },
  {
    pincode: '560043',
    center: [77.6462, 13.0167],
    liveTraffic: [
      {
        pincode: '560043',
        location: 'Hennur Road growth corridor',
        traffic_severity: 'Moderate',
        details: 'Construction influence and uneven lane discipline near access roads.',
      },
    ],
    peakTraffic: [
      {
        pincode: '560043',
        location: 'Hennur and Thanisandra connectors',
        peak_traffic_severity: 'Major',
        details: 'Steady evening congestion between 5:30 PM - 8:30 PM.',
      },
    ],
    crowdSectors: [
      {
        density_status: 'Medium',
        estimated_people_count: 1880,
        pincode: '560043',
        sub_location: 'Hennur Junction',
        telecom_node_id: 'NODE-4301',
        coordinate: [77.6506, 13.0169],
      },
      {
        density_status: 'Medium',
        estimated_people_count: 1330,
        pincode: '560043',
        sub_location: 'Apartment Cluster',
        telecom_node_id: 'NODE-4302',
        coordinate: [77.6418, 13.0194],
      },
      {
        density_status: 'Low',
        estimated_people_count: 480,
        pincode: '560043',
        sub_location: 'Layout Interior',
        telecom_node_id: 'NODE-4303',
        coordinate: [77.6441, 13.0119],
      },
    ],
    events: [
      {
        date: '2026-04-19',
        event_name: 'Weekend Street Market',
        religion_or_type: 'Community',
        venue_type: 'Markets',
      },
    ],
  },
]

const areaByPincode = new Map(areaRecords.map((record) => [record.pincode, record]))

function severityPenalty(severity: TrafficSeverity) {
  switch (severity) {
    case 'Severe':
      return 2.8
    case 'Major':
      return 2.1
    case 'Moderate':
      return 1.4
    default:
      return 0.7
  }
}

function severityRadiusMeters(severity: TrafficSeverity, category: InfluenceCategory) {
  const baseRadius =
    category === 'event'
      ? 1100
      : category === 'peak_traffic'
        ? 950
        : 800

  switch (severity) {
    case 'Severe':
      return baseRadius + 1000
    case 'Major':
      return baseRadius + 650
    case 'Moderate':
      return baseRadius + 350
    default:
      return baseRadius
  }
}

function offsetCoordinate(
  coordinate: [number, number],
  lngOffset: number,
  latOffset: number,
): [number, number] {
  return [coordinate[0] + lngOffset, coordinate[1] + latOffset]
}

function buildInfluenceFeature(
  pincode: string,
  label: string,
  category: InfluenceCategory,
  severity: TrafficSeverity,
  coordinate: [number, number],
): Feature<Point, InfluenceHotspotProperties> {
  return {
    type: 'Feature',
    properties: {
      pincode,
      label,
      category,
      severity,
      radius_meters: severityRadiusMeters(severity, category),
      penalty: severityPenalty(severity),
    },
    geometry: {
      type: 'Point',
      coordinates: coordinate,
    },
  }
}

function buildHeatFeature(
  pincode: string,
  subLocation: string,
  densityStatus: CrowdSectorItem['density_status'],
  estimatedPeopleCount: number,
  coordinates: [number, number],
): Feature<Point, CrowdHeatPointProperties> {
  return {
    type: 'Feature',
    properties: {
      pincode,
      sub_location: subLocation,
      density_status: densityStatus,
      estimated_people_count: estimatedPeopleCount,
      intensity: estimatedPeopleCount / 4500,
    },
    geometry: {
      type: 'Point',
      coordinates,
    },
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

export const mockCityIntelConnector: CityIntelConnector = {
  supportedPincodes: areaRecords.map((record) => record.pincode),

  async getLiveTraffic(pincode) {
    const record = areaByPincode.get(pincode) ?? areaRecords[0]
    return {
      status: 'success',
      route_type: 'live_traffic',
      data: clone(record.liveTraffic),
    }
  },

  async getPeakTraffic(pincode) {
    const record = areaByPincode.get(pincode) ?? areaRecords[0]
    return {
      status: 'success',
      route_type: 'peak_hour_traffic',
      data: clone(record.peakTraffic),
    }
  },

  async getCrowdDensity(pincode) {
    const record = areaByPincode.get(pincode) ?? areaRecords[0]
    return {
      status: 'success',
      route_type: 'telecom_crowd_density',
      data: {
        regional_overview: `Crowd modeling for area ${record.pincode}`,
        source: 'TelecomML-Simulated',
        sector_data: clone(record.crowdSectors.map((sector) => ({
          density_status: sector.density_status,
          estimated_people_count: sector.estimated_people_count,
          pincode: sector.pincode,
          sub_location: sector.sub_location,
          telecom_node_id: sector.telecom_node_id,
        }))),
      },
    }
  },

  async getEvents(pincode) {
    const record = areaByPincode.get(pincode) ?? areaRecords[0]
    return {
      status: 'success',
      route_type: 'upcoming_calendar_events',
      data: {
        calendar_source: 'Jyotisham/Indian-Calendar-Mock',
        pincode_target: record.pincode,
        events: clone(record.events),
      },
    }
  },

  async getTrafficInfluence(pincode): Promise<InfluenceHotspotCollection> {
    const record = areaByPincode.get(pincode) ?? areaRecords[0]
    const liveTrafficFeatures = record.liveTraffic.map((item, index) =>
      buildInfluenceFeature(
        record.pincode,
        item.location,
        'live_traffic',
        item.traffic_severity,
        offsetCoordinate(record.center, 0.006 * (index - 0.5), 0.0035 * (index % 2 === 0 ? 1 : -1)),
      ),
    )
    const peakTrafficFeatures = record.peakTraffic.map((item, index) =>
      buildInfluenceFeature(
        record.pincode,
        item.location,
        'peak_traffic',
        item.peak_traffic_severity,
        offsetCoordinate(record.center, -0.005 * (index + 1), 0.004 * (index + 1)),
      ),
    )

    return {
      type: 'FeatureCollection',
      features: [...liveTrafficFeatures, ...peakTrafficFeatures],
    }
  },

  async getEventInfluence(pincode): Promise<InfluenceHotspotCollection> {
    const record = areaByPincode.get(pincode) ?? areaRecords[0]

    return {
      type: 'FeatureCollection',
      features: record.events.map((item, index) =>
        buildInfluenceFeature(
          record.pincode,
          item.event_name,
          'event',
          index === 0 ? 'Major' : 'Moderate',
          offsetCoordinate(record.center, 0.004 * (index + 1), -0.004 * (index + 1)),
        ),
      ),
    }
  },

  async getCityCrowdHeatmap(): Promise<CrowdHeatmapCollection> {
    const features = areaRecords.flatMap((record) =>
      record.crowdSectors.map((sector) =>
        buildHeatFeature(
          record.pincode,
          sector.sub_location,
          sector.density_status,
          sector.estimated_people_count,
          sector.coordinate,
        ),
      ),
    )

    return {
      type: 'FeatureCollection',
      features,
    }
  },
}
