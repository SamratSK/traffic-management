export type Coordinate = [number, number]

export type CompactRoadEdge = [number, number, number, Coordinate[]]

export type RoadGraphFile = {
  bbox: [number, number, number, number]
  nodes: Coordinate[]
  edges: CompactRoadEdge[]
}

export type OverpassElement = {
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
}

export type OverpassResponse = {
  elements?: OverpassElement[]
}

export type TrafficRoadProperties = {
  roadName: string
  roadClass: 'main' | 'sub'
  trafficLevel: 'red' | 'orange'
  length: number
  highway: string
}

export type RouteResult = {
  coordinates: Coordinate[]
  distanceMeters: number
  visitedNodes: number
}
