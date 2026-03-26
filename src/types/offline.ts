export type Coordinate = [number, number]

export type RoadGraphFile = {
  bbox: [number, number, number, number]
  bucketPrecision: number
  nodeLngs: number[]
  nodeLats: number[]
  buckets: Record<string, number[]>
  nodeOffsets: number[]
  edgeTargets: number[]
  edgeWeights: number[]
  edgeRoadClasses: number[]
  edgeGeometryStarts: number[]
  edgeGeometryLengths: number[]
  edgeCoordinates: number[]
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
