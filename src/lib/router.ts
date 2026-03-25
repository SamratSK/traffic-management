import type { CompactRoadEdge, Coordinate, RoadGraphFile, RouteResult } from '../types/offline'
import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import { bucketKey, metersBetween } from './geo'

type QueuedNode = {
  id: number
  score: number
}

type RoadGraphEdge = {
  from: number
  to: number
  length: number
  geometry: Coordinate[]
}

type PathStep = {
  previous: number
  edge: RoadGraphEdge
}

type RouteOptions = {
  hotspots?: RouteAvoidanceHotspot[]
}

function pointToSegmentDistanceMeters(point: Coordinate, start: Coordinate, end: Coordinate) {
  const lngScale = 109_000
  const latScale = 111_320
  const px = point[0] * lngScale
  const py = point[1] * latScale
  const sx = start[0] * lngScale
  const sy = start[1] * latScale
  const ex = end[0] * lngScale
  const ey = end[1] * latScale
  const dx = ex - sx
  const dy = ey - sy
  const lengthSquared = dx * dx + dy * dy || 1
  const t = Math.max(0, Math.min(1, ((px - sx) * dx + (py - sy) * dy) / lengthSquared))
  const closestX = sx + t * dx
  const closestY = sy + t * dy

  return Math.hypot(px - closestX, py - closestY)
}

export class OfflineRouter {
  private readonly nodes = new Map<number, Coordinate>()
  private readonly adjacency = new Map<number, RoadGraphEdge[]>()
  private readonly buckets = new Map<string, number[]>()

  constructor(graph: RoadGraphFile) {
    graph.nodes.forEach((coordinate, nodeId) => {
      this.nodes.set(nodeId, coordinate)

      const key = bucketKey(coordinate)
      const bucket = this.buckets.get(key)
      if (bucket) {
        bucket.push(nodeId)
      } else {
        this.buckets.set(key, [nodeId])
      }
    })

    graph.edges.forEach((edge) => {
      const hydratedEdge = this.hydrateEdge(edge)
      const bucket = this.adjacency.get(hydratedEdge.from)
      if (bucket) {
        bucket.push(hydratedEdge)
      } else {
        this.adjacency.set(hydratedEdge.from, [hydratedEdge])
      }
    })
  }

  route(startPoint: Coordinate, endPoint: Coordinate, options: RouteOptions = {}): RouteResult | null {
    const startNodeId = this.findNearestNode(startPoint)
    const endNodeId = this.findNearestNode(endPoint)

    if (!startNodeId || !endNodeId) {
      return null
    }

    const openSet = new Map<number, QueuedNode>([
      [
        startNodeId,
        {
          id: startNodeId,
          score: 0,
        },
      ],
    ])
    const gScore = new Map<number, number>([[startNodeId, 0]])
    const cameFrom = new Map<number, PathStep>()
    let visitedNodes = 0

    while (openSet.size > 0) {
      const current = this.pickLowestScore(openSet)
      if (!current) {
        break
      }

      visitedNodes += 1
      openSet.delete(current.id)

      if (current.id === endNodeId) {
        const route = this.reconstructPath(startPoint, endPoint, endNodeId, cameFrom)
        const distanceMeters = this.measurePath(route)

        return {
          coordinates: route,
          distanceMeters,
          visitedNodes,
        }
      }

      const currentGScore = gScore.get(current.id) ?? Number.POSITIVE_INFINITY
      const outgoingEdges = this.adjacency.get(current.id) ?? []
      const hotspots = options.hotspots ?? []

      outgoingEdges.forEach((edge) => {
        const tentativeGScore = currentGScore + edge.length + this.edgePenalty(edge, hotspots)

        if (tentativeGScore >= (gScore.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
          return
        }

        cameFrom.set(edge.to, {
          previous: current.id,
          edge,
        })
        gScore.set(edge.to, tentativeGScore)

        const estimatedScore =
          tentativeGScore + metersBetween(this.nodes.get(edge.to)!, this.nodes.get(endNodeId)!)
        openSet.set(edge.to, { id: edge.to, score: estimatedScore })
      })
    }

    return null
  }

  private pickLowestScore(openSet: Map<number, QueuedNode>): QueuedNode | null {
    let current: QueuedNode | null = null

    openSet.forEach((candidate) => {
      if (!current || candidate.score < current.score) {
        current = candidate
      }
    })

    return current
  }

  private reconstructPath(
    startPoint: Coordinate,
    endPoint: Coordinate,
    currentId: number,
    cameFrom: Map<number, PathStep>,
  ) {
    const segments: Coordinate[][] = []
    let cursor = currentId

    while (cameFrom.has(cursor)) {
      const step = cameFrom.get(cursor)!
      segments.push(step.edge.geometry)
      cursor = step.previous
    }

    segments.reverse()

    const coordinates: Coordinate[] = [startPoint]
    segments.forEach((segment, index) => {
      if (index === 0) {
        coordinates.push(...segment)
      } else {
        coordinates.push(...segment.slice(1))
      }
    })
    coordinates.push(endPoint)

    return coordinates
  }

  private measurePath(coordinates: Coordinate[]) {
    let totalDistance = 0

    for (let index = 1; index < coordinates.length; index += 1) {
      totalDistance += metersBetween(coordinates[index - 1], coordinates[index])
    }

    return totalDistance
  }

  private findNearestNode(point: Coordinate) {
    const localCandidates = this.collectCandidates(point)
    const candidateIds = localCandidates.length ? localCandidates : [...this.nodes.keys()]
    let bestId: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    candidateIds.forEach((nodeId) => {
      const coordinate = this.nodes.get(nodeId)
      if (!coordinate) {
        return
      }

      const distance = metersBetween(point, coordinate)
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = nodeId
      }
    })

    return bestId
  }

  private collectCandidates(point: Coordinate) {
    const basePrecision = 0.01
    const [lngBucket, latBucket] = bucketKey(point, basePrecision).split(':').map(Number)
    const candidates = new Set<number>()

    for (let radius = 0; radius <= 3; radius += 1) {
      for (let lngOffset = -radius; lngOffset <= radius; lngOffset += 1) {
        for (let latOffset = -radius; latOffset <= radius; latOffset += 1) {
          const key = `${lngBucket + lngOffset}:${latBucket + latOffset}`
          const bucket = this.buckets.get(key)
          if (bucket) {
            bucket.forEach((nodeId) => candidates.add(nodeId))
          }
        }
      }

      if (candidates.size > 0) {
        return [...candidates]
      }
    }

    return []
  }

  private hydrateEdge([from, to, length, geometry]: CompactRoadEdge): RoadGraphEdge {
    return {
      from,
      to,
      length,
      geometry,
    }
  }

  private edgePenalty(edge: RoadGraphEdge, hotspots: RouteAvoidanceHotspot[]) {
    if (hotspots.length === 0) {
      return 0
    }

    return hotspots.reduce((totalPenalty, hotspot) => {
      let minDistance = Number.POSITIVE_INFINITY

      for (let index = 1; index < edge.geometry.length; index += 1) {
        const segmentDistance = pointToSegmentDistanceMeters(
          hotspot.coordinate,
          edge.geometry[index - 1],
          edge.geometry[index],
        )

        if (segmentDistance < minDistance) {
          minDistance = segmentDistance
        }
      }

      if (!Number.isFinite(minDistance) || minDistance > hotspot.radiusMeters) {
        return totalPenalty
      }

      const influence = 1 - minDistance / hotspot.radiusMeters
      return totalPenalty + edge.length * hotspot.penalty * influence
    }, 0)
  }
}
