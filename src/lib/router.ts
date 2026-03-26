import type { Coordinate, RoadGraphFile, RouteResult } from '../types/offline'
import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import { bucketKey, metersBetween } from './geo'

type QueuedNode = {
  id: number
  score: number
}

type PathStep = {
  previous: number
  edgeIndex: number
}

type RouteOptions = {
  hotspots?: RouteAvoidanceHotspot[]
  roadBias?: 'neutral' | 'prefer-local'
}

class MinHeap {
  private readonly values: QueuedNode[] = []

  push(value: QueuedNode) {
    this.values.push(value)
    this.bubbleUp(this.values.length - 1)
  }

  pop(): QueuedNode | null {
    if (this.values.length === 0) {
      return null
    }

    const first = this.values[0]
    const last = this.values.pop()
    if (this.values.length > 0 && last) {
      this.values[0] = last
      this.bubbleDown(0)
    }

    return first
  }

  get size() {
    return this.values.length
  }

  private bubbleUp(index: number) {
    let currentIndex = index

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2)
      if (this.values[parentIndex].score <= this.values[currentIndex].score) {
        return
      }

      ;[this.values[parentIndex], this.values[currentIndex]] = [
        this.values[currentIndex],
        this.values[parentIndex],
      ]
      currentIndex = parentIndex
    }
  }

  private bubbleDown(index: number) {
    let currentIndex = index

    while (true) {
      const leftIndex = currentIndex * 2 + 1
      const rightIndex = currentIndex * 2 + 2
      let smallestIndex = currentIndex

      if (
        leftIndex < this.values.length &&
        this.values[leftIndex].score < this.values[smallestIndex].score
      ) {
        smallestIndex = leftIndex
      }

      if (
        rightIndex < this.values.length &&
        this.values[rightIndex].score < this.values[smallestIndex].score
      ) {
        smallestIndex = rightIndex
      }

      if (smallestIndex === currentIndex) {
        return
      }

      ;[this.values[currentIndex], this.values[smallestIndex]] = [
        this.values[smallestIndex],
        this.values[currentIndex],
      ]
      currentIndex = smallestIndex
    }
  }
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
  private readonly nodeLngs: Float64Array
  private readonly nodeLats: Float64Array
  private readonly nodeOffsets: Uint32Array
  private readonly edgeTargets: Uint32Array
  private readonly edgeWeights: Float32Array
  private readonly edgeRoadClasses: Uint8Array
  private readonly edgeGeometryStarts: Uint32Array
  private readonly edgeGeometryLengths: Uint16Array
  private readonly edgeCoordinates: Float64Array
  private readonly nodeRoadClasses: Uint8Array
  private readonly buckets = new Map<string, number[]>()
  private readonly bucketPrecision: number

  constructor(graph: RoadGraphFile) {
    this.bucketPrecision = graph.bucketPrecision
    this.nodeLngs = Float64Array.from(graph.nodeLngs)
    this.nodeLats = Float64Array.from(graph.nodeLats)
    this.nodeOffsets = Uint32Array.from(graph.nodeOffsets)
    this.edgeTargets = Uint32Array.from(graph.edgeTargets)
    this.edgeWeights = Float32Array.from(graph.edgeWeights)
    this.edgeRoadClasses = Uint8Array.from(graph.edgeRoadClasses)
    this.edgeGeometryStarts = Uint32Array.from(graph.edgeGeometryStarts)
    this.edgeGeometryLengths = Uint16Array.from(graph.edgeGeometryLengths)
    this.edgeCoordinates = Float64Array.from(graph.edgeCoordinates)
    this.nodeRoadClasses = new Uint8Array(this.nodeLngs.length)
    this.nodeRoadClasses.fill(2)

    for (let nodeId = 0; nodeId < this.nodeLngs.length; nodeId += 1) {
      const edgeStart = this.nodeOffsets[nodeId]
      const edgeEnd = this.nodeOffsets[nodeId + 1]

      for (let edgeIndex = edgeStart; edgeIndex < edgeEnd; edgeIndex += 1) {
        const roadClass = this.edgeRoadClasses[edgeIndex] ?? 2
        if (roadClass < this.nodeRoadClasses[nodeId]) {
          this.nodeRoadClasses[nodeId] = roadClass
        }
      }
    }

    Object.entries(graph.buckets).forEach(([key, nodeIds]) => {
      this.buckets.set(key, nodeIds)
    })
  }

  route(startPoint: Coordinate, endPoint: Coordinate, options: RouteOptions = {}): RouteResult | null {
    const startNodeId = this.findNearestNode(startPoint)
    const endNodeId = this.findNearestNode(endPoint)

    if (startNodeId === null || endNodeId === null) {
      return null
    }

    const openSet = new MinHeap()
    openSet.push({ id: startNodeId, score: 0 })
    const gScore = new Map<number, number>([[startNodeId, 0]])
    const cameFrom = new Map<number, PathStep>()
    let visitedNodes = 0

    while (openSet.size > 0) {
      const current = openSet.pop()
      if (!current) break

      const bestKnownScore = gScore.get(current.id)
      if (bestKnownScore === undefined || current.score > bestKnownScore + this.heuristic(current.id, endNodeId)) {
        continue
      }

      visitedNodes += 1

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
      const hotspots = options.hotspots ?? []
      const edgeStart = this.nodeOffsets[current.id]
      const edgeEnd = this.nodeOffsets[current.id + 1]

      for (let edgeIndex = edgeStart; edgeIndex < edgeEnd; edgeIndex += 1) {
        const edgeTarget = this.edgeTargets[edgeIndex]
        const edgeWeight = this.edgeWeights[edgeIndex]
        const tentativeGScore =
          currentGScore
          + edgeWeight
          + this.edgePenalty(edgeIndex, hotspots)
          + this.edgeRoadBiasPenalty(edgeIndex, options.roadBias ?? 'neutral')

        if (tentativeGScore >= (gScore.get(edgeTarget) ?? Number.POSITIVE_INFINITY)) {
          continue
        }

        cameFrom.set(edgeTarget, {
          previous: current.id,
          edgeIndex,
        })
        gScore.set(edgeTarget, tentativeGScore)

        const estimatedScore = tentativeGScore + this.heuristic(edgeTarget, endNodeId)
        openSet.push({ id: edgeTarget, score: estimatedScore })
      }
    }

    return null
  }

  nearestRoadCoordinate(point: Coordinate): Coordinate | null {
    const nodeId = this.findNearestNode(point)
    if (nodeId === null) {
      return null
    }

    return this.getNodeCoordinate(nodeId)
  }

  randomRoadCoordinate() {
    if (this.nodeLngs.length === 0) {
      return null
    }

    const nodeId = Math.floor(Math.random() * this.nodeLngs.length)
    return this.getNodeCoordinate(nodeId)
  }

  findDirectionalLaunchCoordinate(
    origin: Coordinate,
    destination: Coordinate,
    variant: number,
    variantCount: number,
    minRadiusMeters: number,
    maxRadiusMeters: number,
  ) {
    const startNodeId = this.findNearestNode(origin)
    if (startNodeId === null) {
      return null
    }

    const originMeters = this.toMeters(origin)
    const destinationMeters = this.toMeters(destination)
    const directionX = destinationMeters[0] - originMeters[0]
    const directionY = destinationMeters[1] - originMeters[1]
    const directionLength = Math.hypot(directionX, directionY) || 1
    const forwardX = directionX / directionLength
    const forwardY = directionY / directionLength
    const lateralX = -forwardY
    const lateralY = forwardX
    const desiredLateral =
      variantCount <= 1
        ? 0
        : ((variant + 0.5) / variantCount - 0.5) * 2

    type QueueEntry = {
      nodeId: number
      distanceMeters: number
    }

    const queue: QueueEntry[] = [{
      nodeId: startNodeId,
      distanceMeters: 0,
    }]
    const bestDistanceByNode = new Map<number, number>([[startNodeId, 0]])
    let bestNodeId: number | null = null
    let bestScore = Number.POSITIVE_INFINITY

    while (queue.length > 0) {
      queue.sort((left, right) => left.distanceMeters - right.distanceMeters)
      const current = queue.shift()
      if (!current) {
        break
      }

      if (current.distanceMeters > maxRadiusMeters) {
        continue
      }

      const coordinate = this.getNodeCoordinate(current.nodeId)
      const coordinateMeters = this.toMeters(coordinate)
      const deltaX = coordinateMeters[0] - originMeters[0]
      const deltaY = coordinateMeters[1] - originMeters[1]
      const straightDistance = Math.hypot(deltaX, deltaY)
      const forwardDistance = deltaX * forwardX + deltaY * forwardY
      const lateralDistance = deltaX * lateralX + deltaY * lateralY

      if (
        current.nodeId !== startNodeId
        && straightDistance >= minRadiusMeters
        && straightDistance <= maxRadiusMeters
        && forwardDistance >= Math.min(42, minRadiusMeters * 0.42)
      ) {
        const roadClass = this.nodeRoadClasses[current.nodeId] ?? 2
        const roadPenalty = roadClass === 0 ? 0 : roadClass === 1 ? 0.55 : 2.4
        const distancePenalty = Math.abs(straightDistance - (minRadiusMeters + maxRadiusMeters) * 0.5) / maxRadiusMeters
        const lateralRatio = straightDistance > 0 ? lateralDistance / straightDistance : 0
        const lateralPenalty = Math.abs(lateralRatio - desiredLateral) * 6.5
        const forwardPenalty = Math.max(0, 1 - forwardDistance / Math.max(straightDistance, 1)) * 4.5
        const score = roadPenalty + distancePenalty + lateralPenalty + forwardPenalty

        if (score < bestScore) {
          bestScore = score
          bestNodeId = current.nodeId
        }
      }

      const edgeStart = this.nodeOffsets[current.nodeId]
      const edgeEnd = this.nodeOffsets[current.nodeId + 1]

      for (let edgeIndex = edgeStart; edgeIndex < edgeEnd; edgeIndex += 1) {
        const edgeTarget = this.edgeTargets[edgeIndex]
        const nextDistance = current.distanceMeters + this.edgeWeights[edgeIndex]
        if (nextDistance > maxRadiusMeters * 1.2) {
          continue
        }

        const bestKnown = bestDistanceByNode.get(edgeTarget)
        if (bestKnown !== undefined && bestKnown <= nextDistance) {
          continue
        }

        bestDistanceByNode.set(edgeTarget, nextDistance)
        queue.push({
          nodeId: edgeTarget,
          distanceMeters: nextDistance,
        })
      }
    }

    return bestNodeId === null ? null : this.getNodeCoordinate(bestNodeId)
  }

  findBreakoutCoordinate(
    center: Coordinate,
    sectorIndex: number,
    sectorCount: number,
    minRadiusMeters: number,
    maxRadiusMeters: number,
  ) {
    const sectorAngle = (sectorIndex / sectorCount) * Math.PI * 2
    let bestNodeId: number | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (let nodeId = 0; nodeId < this.nodeLngs.length; nodeId += 1) {
      const coordinate = this.getNodeCoordinate(nodeId)
      const distance = metersBetween(center, coordinate)
      if (distance < minRadiusMeters || distance > maxRadiusMeters) {
        continue
      }

      const angle = Math.atan2(coordinate[1] - center[1], coordinate[0] - center[0])
      const angleDelta = Math.abs(Math.atan2(Math.sin(angle - sectorAngle), Math.cos(angle - sectorAngle)))
      const roadClass = this.nodeRoadClasses[nodeId] ?? 2
      const roadPenalty = roadClass === 0 ? 0 : roadClass === 1 ? 0.8 : 3.2
      const radiusTarget = minRadiusMeters + (maxRadiusMeters - minRadiusMeters) * 0.7
      const distancePenalty = Math.abs(distance - radiusTarget) / maxRadiusMeters
      const score = angleDelta * 8 + roadPenalty + distancePenalty

      if (score < bestScore) {
        bestScore = score
        bestNodeId = nodeId
      }
    }

    return bestNodeId === null ? null : this.getNodeCoordinate(bestNodeId)
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
      segments.push(this.getEdgeGeometry(step.edgeIndex))
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
    const candidateIds =
      localCandidates.length > 0
        ? localCandidates
        : Array.from({ length: this.nodeLngs.length }, (_, index) => index)
    let bestId: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    candidateIds.forEach((nodeId) => {
      const coordinate = this.getNodeCoordinate(nodeId)
      const distance = metersBetween(point, coordinate)
      if (distance < bestDistance) {
        bestDistance = distance
        bestId = nodeId
      }
    })

    return bestId
  }

  private collectCandidates(point: Coordinate) {
    const [lngBucket, latBucket] = bucketKey(point, this.bucketPrecision).split(':').map(Number)
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

  private getNodeCoordinate(nodeId: number): Coordinate {
    return [this.nodeLngs[nodeId], this.nodeLats[nodeId]]
  }

  private toMeters(coordinate: Coordinate) {
    return [coordinate[0] * 109_000, coordinate[1] * 111_320] as const
  }

  private heuristic(fromNodeId: number, toNodeId: number) {
    return metersBetween(this.getNodeCoordinate(fromNodeId), this.getNodeCoordinate(toNodeId))
  }

  private getEdgeGeometry(edgeIndex: number): Coordinate[] {
    const startPointIndex = this.edgeGeometryStarts[edgeIndex]
    const pointLength = this.edgeGeometryLengths[edgeIndex]
    const geometry: Coordinate[] = []

    for (let index = 0; index < pointLength; index += 1) {
      const coordinateIndex = (startPointIndex + index) * 2
      geometry.push([
        this.edgeCoordinates[coordinateIndex],
        this.edgeCoordinates[coordinateIndex + 1],
      ])
    }

    return geometry
  }

  private edgePenalty(edgeIndex: number, hotspots: RouteAvoidanceHotspot[]) {
    if (hotspots.length === 0) {
      return 0
    }

    const edgeLength = this.edgeWeights[edgeIndex]
    const startPointIndex = this.edgeGeometryStarts[edgeIndex]
    const pointLength = this.edgeGeometryLengths[edgeIndex]

    return hotspots.reduce((totalPenalty, hotspot) => {
      let minDistance = Number.POSITIVE_INFINITY

      for (let index = 1; index < pointLength; index += 1) {
        const startOffset = (startPointIndex + index - 1) * 2
        const endOffset = (startPointIndex + index) * 2
        const segmentDistance = pointToSegmentDistanceMeters(
          hotspot.coordinate,
          [this.edgeCoordinates[startOffset], this.edgeCoordinates[startOffset + 1]],
          [this.edgeCoordinates[endOffset], this.edgeCoordinates[endOffset + 1]],
        )

        if (segmentDistance < minDistance) {
          minDistance = segmentDistance
        }
      }

      if (!Number.isFinite(minDistance) || minDistance > hotspot.radiusMeters) {
        return totalPenalty
      }

      const influence = 1 - minDistance / hotspot.radiusMeters
      return totalPenalty + edgeLength * hotspot.penalty * influence
    }, 0)
  }

  private edgeRoadBiasPenalty(edgeIndex: number, roadBias: RouteOptions['roadBias']) {
    if (roadBias !== 'prefer-local') {
      return 0
    }

    const edgeLength = this.edgeWeights[edgeIndex]
    const roadClass = this.edgeRoadClasses[edgeIndex] ?? 0

    if (roadClass === 2) {
      return edgeLength * 2.8
    }

    if (roadClass === 1) {
      return edgeLength * 0.9
    }

    return -edgeLength * 0.15
  }
}
