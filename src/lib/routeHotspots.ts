import type { CrowdHeatmapCollection, InfluenceHotspotCollection, RouteAvoidanceHotspot } from '../types/cityIntel'
import type { Coordinate } from '../types/offline'

export function buildRouteAvoidanceHotspots(
  crowdHeatmap: CrowdHeatmapCollection,
  trafficInfluence: InfluenceHotspotCollection,
  eventInfluence: InfluenceHotspotCollection,
): RouteAvoidanceHotspot[] {
  return [
    ...crowdHeatmap.features.map((feature) => ({
      coordinate: feature.geometry.coordinates as Coordinate,
      radiusMeters:
        feature.properties.density_status === 'High'
          ? 1100
          : feature.properties.density_status === 'Medium'
            ? 800
            : 450,
      penalty: Math.max(0.55, feature.properties.estimated_people_count / 2200),
      label: feature.properties.sub_location,
      category: 'crowd' as const,
    })),
    ...trafficInfluence.features.map((feature) => ({
      coordinate: feature.geometry.coordinates as Coordinate,
      radiusMeters: feature.properties.radius_meters,
      penalty: feature.properties.penalty,
      label: feature.properties.label,
      category: feature.properties.category,
    })),
    ...eventInfluence.features.map((feature) => ({
      coordinate: feature.geometry.coordinates as Coordinate,
      radiusMeters: feature.properties.radius_meters,
      penalty: feature.properties.penalty,
      label: feature.properties.label,
      category: feature.properties.category,
    })),
  ]
}
