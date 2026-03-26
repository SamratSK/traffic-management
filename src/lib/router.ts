import type { Coordinate, RoadGraphFile, RouteResult } from '../types/offline'
import type { RouteAvoidanceHotspot } from '../types/cityIntel'
import { bucketKey, metersBetween } from './geo'

type QueuedNode = {
  id: number
  score: number
}

type RouteOptions = {
  hotspots?: RouteAvoidanceHotspot[]
  roadBias?: 'neutral' | 'prefer-local'
}

type NodeRoute = {
  coordinates: Coordinate[]
  distanceMeters: number
  visitedNodes: number
}

const LAT_SCALE_METERS = 111_320
const EMPTY_HOTSPOTS: RouteAvoidanceHotspot[] = []
const MAX_NEAREST_NODE_CACHE_ENTRIES = 4_096
const MAX_ROUTE_CACHE_ENTRIES = 128

class MinHeap {
  private readonly ids: number[] = []
  private readonly scores: number[] = []

  push(id: number, score: number) {
    this.ids.push(id)
    this.scores.push(score)
    this.bubbleUp(this.ids.length - 1)
  }

  pop(): QueuedNode | null {
    if (this.ids.length === 0) {
      return null
    }

    const first: QueuedNode = {
      id: this.ids[0],
      score: this.scores[0],
    }
    const lastId = this.ids.pop()
    const lastScore = this.scores.pop()
    if (this.ids.length > 0 && lastId !== undefined && lastScore !== undefined) {
      this.ids[0] = lastId
      this.scores[0] = lastScore
      this.bubbleDown(0)
    }

    return first
  }

  get size() {
    return this.ids.length
  }

  private bubbleUp(index: number) {
    let currentIndex = index

    while (currentIndex > 0) {
      const parentIndex = Math.floor((currentIndex - 1) / 2)
      if (this.scores[parentIndex] <= this.scores[currentIndex]) {
        return
      }

      this.swap(parentIndex, currentIndex)
      currentIndex = parentIndex
    }
  }

  private bubbleDown(index: number) {
    let currentIndex = index

    while (true) {
      const leftIndex = currentIndex * 2 + 1
      const rightIndex = currentIndex * 2 + 2
      let smallestIndex = currentIndex

      if (leftIndex < this.ids.length && this.scores[leftIndex] < this.scores[smallestIndex]) {
        smallestIndex = leftIndex
      }

      if (rightIndex < this.ids.length && this.scores[rightIndex] < this.scores[smallestIndex]) {
        smallestIndex = rightIndex
      }

      if (smallestIndex === currentIndex) {
        return
      }

      this.swap(currentIndex, smallestIndex)
      currentIndex = smallestIndex
    }
  }

  private swap(leftIndex: number, rightIndex: number) {
    ;[this.ids[leftIndex], this.ids[rightIndex]] = [this.ids[rightIndex], this.ids[leftIndex]]
    ;[this.scores[leftIndex], this.scores[rightIndex]] = [this.scores[rightIndex], this.scores[leftIndex]]
  }
}

function pointToSegmentDistanceMeters(point: Coordinate, start: Coordinate, end: Coordinate) {
  const lngScale = 109_000
  const latScale = LAT_SCALE_METERS
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
  private readonly nodeMeterXs: Float64Array
  private readonly nodeMeterYs: Float64Array
  private readonly gScoreTokens: Uint32Array
  private readonly gScores: Float64Array
  private readonly cameFromTokens: Uint32Array
  private readonly cameFromPrevious: Int32Array
  private readonly cameFromEdgeIndex: Int32Array
  private readonly buckets = new Map<string, number[]>()
  private readonly nearestNodeCache = new Map<string, number>()
  private readonly cachedNodeRoutes = new Map<string, NodeRoute>()
  private readonly bucketPrecision: number
  private routeSearchToken = 0

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
    this.nodeMeterXs = new Float64Array(this.nodeLngs.length)
    this.nodeMeterYs = new Float64Array(this.nodeLats.length)
    this.gScoreTokens = new Uint32Array(this.nodeLngs.length)
    this.gScores = new Float64Array(this.nodeLngs.length)
    this.cameFromTokens = new Uint32Array(this.nodeLngs.length)
    this.cameFromPrevious = new Int32Array(this.nodeLngs.length)
    this.cameFromEdgeIndex = new Int32Array(this.nodeLngs.length)
    this.nodeRoadClasses.fill(2)

    const maxLatRadians = (graph.bbox[3] ?? 0) * (Math.PI / 180)
    const minLngScale = Math.cos(maxLatRadians) * LAT_SCALE_METERS

    for (let nodeId = 0; nodeId < this.nodeLngs.length; nodeId += 1) {
      this.nodeMeterXs[nodeId] = this.nodeLngs[nodeId] * minLngScale
      this.nodeMeterYs[nodeId] = this.nodeLats[nodeId] * LAT_SCALE_METERS
    }

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

    const hotspots = options.hotspots ?? EMPTY_HOTSPOTS
    const roadBias = options.roadBias ?? 'neutral'
    const cacheKey = hotspots.length === 0 ? `${startNodeId}:${endNodeId}:${roadBias}` : null
    const cachedNodeRoute = cacheKey ? this.cachedNodeRoutes.get(cacheKey) : null
    if (cachedNodeRoute) {
      return this.materializeRoute(startPoint, endPoint, cachedNodeRoute)
    }

    const searchToken = this.nextSearchToken()
    const openSet = new MinHeap()
    openSet.push(startNodeId, this.heuristic(startNodeId, endNodeId))
    this.gScoreTokens[startNodeId] = searchToken
    this.gScores[startNodeId] = 0
    let visitedNodes = 0

    while (openSet.size > 0) {
      const current = openSet.pop()
      if (!current) break

      const bestKnownScore =
        this.gScoreTokens[current.id] === searchToken
          ? this.gScores[current.id]
          : undefined
      if (bestKnownScore === undefined || current.score > bestKnownScore + this.heuristic(current.id, endNodeId)) {
        continue
      }

      visitedNodes += 1

      if (current.id === endNodeId) {
        const nodeRoute = this.buildNodeRoute(startNodeId, endNodeId, searchToken, visitedNodes)
        if (cacheKey) {
          this.setCachedNodeRoute(cacheKey, nodeRoute)
        }

        return this.materializeRoute(startPoint, endPoint, nodeRoute)
      }

      const currentGScore = bestKnownScore ?? Number.POSITIVE_INFINITY
      const edgeStart = this.nodeOffsets[current.id]
      const edgeEnd = this.nodeOffsets[current.id + 1]

      for (let edgeIndex = edgeStart; edgeIndex < edgeEnd; edgeIndex += 1) {
        const edgeTarget = this.edgeTargets[edgeIndex]
        const edgeWeight = this.edgeWeights[edgeIndex]
        const tentativeGScore =
          currentGScore
          + edgeWeight
          + this.edgePenalty(edgeIndex, hotspots)
          + this.edgeRoadBiasPenalty(edgeIndex, roadBias)

        const previousTargetScore =
          this.gScoreTokens[edgeTarget] === searchToken
            ? this.gScores[edgeTarget]
            : Number.POSITIVE_INFINITY

        if (tentativeGScore >= previousTargetScore) {
          continue
        }

        this.cameFromTokens[edgeTarget] = searchToken
        this.cameFromPrevious[edgeTarget] = current.id
        this.cameFromEdgeIndex[edgeTarget] = edgeIndex
        this.gScoreTokens[edgeTarget] = searchToken
        this.gScores[edgeTarget] = tentativeGScore

        const estimatedScore = tentativeGScore + this.heuristic(edgeTarget, endNodeId)
        openSet.push(edgeTarget, estimatedScore)
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

    const queue = new MinHeap()
    queue.push(startNodeId, 0)
    const bestDistanceByNode = new Map<number, number>([[startNodeId, 0]])
    let bestNodeId: number | null = null
    let bestScore = Number.POSITIVE_INFINITY

    while (queue.size > 0) {
      const current = queue.pop()
      if (!current) {
        break
      }

      const bestKnownDistance = bestDistanceByNode.get(current.id)
      if (bestKnownDistance === undefined || current.score > bestKnownDistance) {
        continue
      }

      const currentDistance = current.score
      if (currentDistance > maxRadiusMeters) {
        continue
      }

      const coordinate = this.getNodeCoordinate(current.id)
      const coordinateMeters = this.toMeters(coordinate)
      const deltaX = coordinateMeters[0] - originMeters[0]
      const deltaY = coordinateMeters[1] - originMeters[1]
      const straightDistance = Math.hypot(deltaX, deltaY)
      const forwardDistance = deltaX * forwardX + deltaY * forwardY
      const lateralDistance = deltaX * lateralX + deltaY * lateralY

      if (
        current.id !== startNodeId
        && straightDistance >= minRadiusMeters
        && straightDistance <= maxRadiusMeters
        && forwardDistance >= Math.min(42, minRadiusMeters * 0.42)
      ) {
        const roadClass = this.nodeRoadClasses[current.id] ?? 2
        const roadPenalty = roadClass === 0 ? 0 : roadClass === 1 ? 0.55 : 2.4
        const distancePenalty = Math.abs(straightDistance - (minRadiusMeters + maxRadiusMeters) * 0.5) / maxRadiusMeters
        const lateralRatio = straightDistance > 0 ? lateralDistance / straightDistance : 0
        const lateralPenalty = Math.abs(lateralRatio - desiredLateral) * 6.5
        const forwardPenalty = Math.max(0, 1 - forwardDistance / Math.max(straightDistance, 1)) * 4.5
        const score = roadPenalty + distancePenalty + lateralPenalty + forwardPenalty

        if (score < bestScore) {
          bestScore = score
          bestNodeId = current.id
        }
      }

      const edgeStart = this.nodeOffsets[current.id]
      const edgeEnd = this.nodeOffsets[current.id + 1]

      for (let edgeIndex = edgeStart; edgeIndex < edgeEnd; edgeIndex += 1) {
        const edgeTarget = this.edgeTargets[edgeIndex]
        const nextDistance = currentDistance + this.edgeWeights[edgeIndex]
        if (nextDistance > maxRadiusMeters * 1.2) {
          continue
        }

        const bestKnown = bestDistanceByNode.get(edgeTarget)
        if (bestKnown !== undefined && bestKnown <= nextDistance) {
          continue
        }

        bestDistanceByNode.set(edgeTarget, nextDistance)
        queue.push(edgeTarget, nextDistance)
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
    const candidateNodes = this.collectNearbyNodes(center, maxRadiusMeters)
    const nodeIds =
      candidateNodes.length > 0
        ? candidateNodes
        : Array.from({ length: this.nodeLngs.length }, (_, index) => index)

    for (const nodeId of nodeIds) {
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

  private measurePath(coordinates: Coordinate[]) {
    let totalDistance = 0

    for (let index = 1; index < coordinates.length; index += 1) {
      totalDistance += metersBetween(coordinates[index - 1], coordinates[index])
    }

    return totalDistance
  }

  private findNearestNode(point: Coordinate) {
    const cacheKey = `${Math.round(point[0] * 10_000)}:${Math.round(point[1] * 10_000)}`
    const cachedNodeId = this.nearestNodeCache.get(cacheKey)
    if (cachedNodeId !== undefined) {
      return cachedNodeId
    }

    const localCandidates = this.collectCandidates(point)
    let bestId: number | null = null
    let bestDistance = Number.POSITIVE_INFINITY

    if (localCandidates.length > 0) {
      localCandidates.forEach((nodeId) => {
        const coordinate = this.getNodeCoordinate(nodeId)
        const distance = metersBetween(point, coordinate)
        if (distance < bestDistance) {
          bestDistance = distance
          bestId = nodeId
        }
      })
    } else {
      for (let nodeId = 0; nodeId < this.nodeLngs.length; nodeId += 1) {
        const coordinate = this.getNodeCoordinate(nodeId)
        const distance = metersBetween(point, coordinate)
        if (distance < bestDistance) {
          bestDistance = distance
          bestId = nodeId
        }
      }
    }

    if (bestId !== null) {
      this.setNearestNodeCache(cacheKey, bestId)
    }

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

  private collectNearbyNodes(point: Coordinate, radiusMeters: number) {
    const [lngBucket, latBucket] = bucketKey(point, this.bucketPrecision).split(':').map(Number)
    const latBucketRadius = Math.max(1, Math.ceil((radiusMeters / LAT_SCALE_METERS) / this.bucketPrecision))
    const lngBucketRadius = Math.max(1, Math.ceil((radiusMeters / 109_000) / this.bucketPrecision))
    const candidates = new Set<number>()

    for (let lngOffset = -lngBucketRadius; lngOffset <= lngBucketRadius; lngOffset += 1) {
      for (let latOffset = -latBucketRadius; latOffset <= latBucketRadius; latOffset += 1) {
        const bucket = this.buckets.get(`${lngBucket + lngOffset}:${latBucket + latOffset}`)
        if (!bucket) {
          continue
        }

        bucket.forEach((nodeId) => candidates.add(nodeId))
      }
    }

    return [...candidates]
  }

  private getNodeCoordinate(nodeId: number): Coordinate {
    return [this.nodeLngs[nodeId], this.nodeLats[nodeId]]
  }

  private toMeters(coordinate: Coordinate) {
    return [coordinate[0] * 109_000, coordinate[1] * 111_320] as const
  }

  private heuristic(fromNodeId: number, toNodeId: number) {
    return Math.hypot(
      this.nodeMeterXs[fromNodeId] - this.nodeMeterXs[toNodeId],
      this.nodeMeterYs[fromNodeId] - this.nodeMeterYs[toNodeId],
    )
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

  private nextSearchToken() {
    this.routeSearchToken += 1

    if (this.routeSearchToken >= 0xffff_fffe) {
      this.routeSearchToken = 1
      this.gScoreTokens.fill(0)
      this.cameFromTokens.fill(0)
    }

    return this.routeSearchToken
  }

  private buildNodeRoute(
    startNodeId: number,
    endNodeId: number,
    searchToken: number,
    visitedNodes: number,
  ): NodeRoute {
    const edgeIndexes: number[] = []
    let cursor = endNodeId

    while (this.cameFromTokens[cursor] === searchToken) {
      edgeIndexes.push(this.cameFromEdgeIndex[cursor])
      cursor = this.cameFromPrevious[cursor]
    }

    edgeIndexes.reverse()

    const coordinates: Coordinate[] = edgeIndexes.length === 0 ? [this.getNodeCoordinate(startNodeId)] : []

    edgeIndexes.forEach((edgeIndex, edgeListIndex) => {
      const startPointIndex = this.edgeGeometryStarts[edgeIndex]
      const pointLength = this.edgeGeometryLengths[edgeIndex]
      const geometryStart = edgeListIndex === 0 ? 0 : 1

      for (let index = geometryStart; index < pointLength; index += 1) {
        const coordinateIndex = (startPointIndex + index) * 2
        coordinates.push([
          this.edgeCoordinates[coordinateIndex],
          this.edgeCoordinates[coordinateIndex + 1],
        ])
      }
    })

    return {
      coordinates,
      distanceMeters: this.measurePath(coordinates),
      visitedNodes,
    }
  }

  private materializeRoute(startPoint: Coordinate, endPoint: Coordinate, nodeRoute: NodeRoute): RouteResult {
    if (nodeRoute.coordinates.length === 0) {
      return {
        coordinates: [startPoint, endPoint],
        distanceMeters: metersBetween(startPoint, endPoint),
        visitedNodes: nodeRoute.visitedNodes,
      }
    }

    const coordinates: Coordinate[] = [startPoint]
    const firstNode = nodeRoute.coordinates[0]
    const lastNode = nodeRoute.coordinates[nodeRoute.coordinates.length - 1]

    if (!this.coordinatesEqual(startPoint, firstNode)) {
      coordinates.push(...nodeRoute.coordinates)
    } else {
      coordinates.push(...nodeRoute.coordinates.slice(1))
    }

    if (!this.coordinatesEqual(coordinates[coordinates.length - 1] ?? startPoint, endPoint)) {
      coordinates.push(endPoint)
    }

    return {
      coordinates,
      distanceMeters:
        nodeRoute.distanceMeters
        + metersBetween(startPoint, firstNode)
        + metersBetween(lastNode, endPoint),
      visitedNodes: nodeRoute.visitedNodes,
    }
  }

  private coordinatesEqual(left: Coordinate, right: Coordinate) {
    return left[0] === right[0] && left[1] === right[1]
  }

  private setNearestNodeCache(key: string, nodeId: number) {
    this.nearestNodeCache.set(key, nodeId)
    if (this.nearestNodeCache.size <= MAX_NEAREST_NODE_CACHE_ENTRIES) {
      return
    }

    const oldestKey = this.nearestNodeCache.keys().next().value
    if (oldestKey !== undefined) {
      this.nearestNodeCache.delete(oldestKey)
    }
  }

  private setCachedNodeRoute(key: string, route: NodeRoute) {
    this.cachedNodeRoutes.set(key, route)
    if (this.cachedNodeRoutes.size <= MAX_ROUTE_CACHE_ENTRIES) {
      return
    }

    const oldestKey = this.cachedNodeRoutes.keys().next().value
    if (oldestKey !== undefined) {
      this.cachedNodeRoutes.delete(oldestKey)
    }
  }
}
