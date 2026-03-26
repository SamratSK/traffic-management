import maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'

import type { Coordinate } from '../types/offline'

export function randomSpeedWithinRange(minKph: number, maxKph: number) {
  const lower = Math.max(10, Math.min(minKph, maxKph))
  const upper = Math.max(lower, maxKph)
  if (lower === upper) {
    return lower
  }

  return Math.round(lower + Math.random() * (upper - lower))
}

export function createScenarioId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function fitCoordinates(map: MapLibreMap | null, coordinates: Coordinate[], maxZoom = 16) {
  if (!map || coordinates.length === 0) {
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  coordinates.forEach((coordinate) => bounds.extend(coordinate))
  map.fitBounds(bounds, { padding: 100, duration: 700, maxZoom })
}

export function buildAllocationCounts(rows: Array<{ key: string; value: number }>, total: number) {
  const effectiveRows = rows.filter((row) => row.value > 0)
  if (effectiveRows.length === 0) {
    return new globalThis.Map<string, number>([['random', total]])
  }

  const weightTotal = effectiveRows.reduce((sum, row) => sum + row.value, 0)
  if (weightTotal <= 0) {
    return new globalThis.Map<string, number>([['random', total]])
  }

  const allocations = effectiveRows.map((row) => {
    const exact = (row.value / weightTotal) * total
    return {
      key: row.key,
      base: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    }
  })

  let assigned = allocations.reduce((sum, allocation) => sum + allocation.base, 0)
  allocations
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((allocation) => {
      if (assigned >= total) {
        return
      }
      allocation.base += 1
      assigned += 1
    })

  return new globalThis.Map(allocations.map((allocation) => [allocation.key, allocation.base]))
}
