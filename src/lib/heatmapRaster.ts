import type { Map } from 'maplibre-gl'

import { BENGALURU_BOUNDS, MAP_SOURCE_IDS } from '../constants/map'
import type { Coordinate } from '../types/offline'
import type { ScenarioIncident } from '../types/runtime'

type ImageSourceWithUpdate = {
  updateImage: (options: { url: string; coordinates?: HeatmapImageCoordinates }) => void
}

type HeatmapImageCoordinates = [Coordinate, Coordinate, Coordinate, Coordinate]
type HeatmapBounds = {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

type GradientColor = readonly [number, number, number, number]

const [[BASE_MIN_LNG, BASE_MIN_LAT], [BASE_MAX_LNG, BASE_MAX_LAT]] = BENGALURU_BOUNDS as [[number, number], [number, number]]
const HEATMAP_WIDTH = 900
const HEATMAP_HEIGHT = 720

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function lerp(start: number, end: number, factor: number) {
  return start + ((end - start) * factor)
}

function sampleGradient(intensity: number) {
  const stops = [
    { stop: 0, color: [48, 108, 219, 88] as GradientColor },
    { stop: 0.14, color: [76, 140, 255, 112] as GradientColor },
    { stop: 0.28, color: [103, 216, 255, 128] as GradientColor },
    { stop: 0.44, color: [162, 247, 182, 140] as GradientColor },
    { stop: 0.6, color: [241, 241, 112, 156] as GradientColor },
    { stop: 0.76, color: [255, 180, 92, 178] as GradientColor },
    { stop: 0.9, color: [250, 116, 104, 206] as GradientColor },
    { stop: 1, color: [204, 58, 86, 232] as GradientColor },
  ]

  for (let index = 0; index < stops.length - 1; index += 1) {
    const current = stops[index]
    const next = stops[index + 1]
    if (intensity <= next.stop) {
      const factor = (intensity - current.stop) / (next.stop - current.stop || 1)
      return [
        Math.round(lerp(current.color[0], next.color[0], factor)),
        Math.round(lerp(current.color[1], next.color[1], factor)),
        Math.round(lerp(current.color[2], next.color[2], factor)),
        Math.round(lerp(current.color[3], next.color[3], factor)),
      ] as const
    }
  }

  return stops[stops.length - 1].color
}

function createTransparentDataUrl() {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  return canvas.toDataURL('image/png')
}

function toImageCoordinates(bounds: HeatmapBounds): HeatmapImageCoordinates {
  return [
    [bounds.minLng, bounds.maxLat],
    [bounds.maxLng, bounds.maxLat],
    [bounds.maxLng, bounds.minLat],
    [bounds.minLng, bounds.minLat],
  ]
}

function expandBoundsForIncidents(incidents: ScenarioIncident[]): HeatmapBounds {
  const maxSpreadKm = incidents.reduce((largest, incident) => {
    const spread = incident.kind === 'event'
      ? Math.max(0.72, incident.radiusKm * 1.15)
      : Math.max(0.48, incident.radiusKm * 0.92)
    return Math.max(largest, spread)
  }, 0.65)

  const centerLat = (BASE_MIN_LAT + BASE_MAX_LAT) * 0.5
  const latPadding = maxSpreadKm / 111.32
  const lngPadding = maxSpreadKm / (111.32 * Math.cos((centerLat * Math.PI) / 180) || 1)

  return {
    minLng: BASE_MIN_LNG - lngPadding,
    minLat: BASE_MIN_LAT - latPadding,
    maxLng: BASE_MAX_LNG + lngPadding,
    maxLat: BASE_MAX_LAT + latPadding,
  }
}

function incidentSpreadKm(incident: ScenarioIncident) {
  return incident.kind === 'event'
    ? Math.max(0.72, incident.radiusKm * 1.15)
    : Math.max(0.48, incident.radiusKm * 0.92)
}

function incidentFieldStrength(distanceKm: number, spreadKm: number, amplitude: number) {
  return amplitude * Math.exp(-((distanceKm ** 2) / (2 * (spreadKm ** 2))))
}

function ringFieldStrength(distanceKm: number, ringRadiusKm: number, ringWidthKm: number, amplitude: number) {
  const delta = distanceKm - ringRadiusKm
  return amplitude * Math.exp(-((delta ** 2) / (2 * (ringWidthKm ** 2))))
}

function drawHeatmap(bounds: HeatmapBounds, incidents: ScenarioIncident[]) {
  const canvas = document.createElement('canvas')
  canvas.width = HEATMAP_WIDTH
  canvas.height = HEATMAP_HEIGHT

  const context = canvas.getContext('2d')
  if (!context) {
    return createTransparentDataUrl()
  }

  const imageData = context.createImageData(HEATMAP_WIDTH, HEATMAP_HEIGHT)
  const pixels = imageData.data
  const lngSpan = bounds.maxLng - bounds.minLng
  const latSpan = bounds.maxLat - bounds.minLat

  for (let y = 0; y < HEATMAP_HEIGHT; y += 1) {
    const lat = bounds.maxLat - ((y + 0.5) / HEATMAP_HEIGHT) * latSpan

    for (let x = 0; x < HEATMAP_WIDTH; x += 1) {
      const lng = bounds.minLng + ((x + 0.5) / HEATMAP_WIDTH) * lngSpan
      let intensity = 0.12

      incidents.forEach((incident) => {
        const [incidentLng, incidentLat] = incident.coordinate
        const lngKm = (lng - incidentLng) * 111.32 * Math.cos(((lat + incidentLat) * 0.5 * Math.PI) / 180)
        const latKm = (lat - incidentLat) * 111.32
        const distanceKm = Math.sqrt((lngKm ** 2) + (latKm ** 2))
        const spreadKm = incidentSpreadKm(incident)
        const coreAmplitude = incident.kind === 'event' ? 0.72 : 0.56
        const ringRadiusKm = spreadKm * 0.9
        const ringWidthKm = Math.max(0.08, spreadKm * 0.14)
        const ringAmplitude = incident.kind === 'event' ? 0.22 : 0.16

        intensity += incidentFieldStrength(distanceKm, spreadKm, coreAmplitude)
        intensity += ringFieldStrength(distanceKm, ringRadiusKm, ringWidthKm, ringAmplitude)
      })

      const normalized = clamp(intensity, 0, 1)
      const [red, green, blue, alpha] = sampleGradient(normalized)
      const offset = (y * HEATMAP_WIDTH + x) * 4
      pixels[offset] = red
      pixels[offset + 1] = green
      pixels[offset + 2] = blue
      pixels[offset + 3] = alpha
    }
  }

  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

export function getHeatmapImageCoordinates() {
  return toImageCoordinates(expandBoundsForIncidents([]))
}

export function updateHeatmapRaster(map: Map | null, incidents: ScenarioIncident[], visible: boolean) {
  if (!map) {
    return
  }

  const source = map.getSource(MAP_SOURCE_IDS.heatmapRaster) as ImageSourceWithUpdate | undefined
  if (!source || typeof source.updateImage !== 'function') {
    return
  }

  const bounds = expandBoundsForIncidents(incidents)
  source.updateImage({
    url: visible ? drawHeatmap(bounds, incidents) : createTransparentDataUrl(),
    coordinates: toImageCoordinates(bounds),
  })
}
