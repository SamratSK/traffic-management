import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

const LOCAL_GLYPHS_URL = '/offline/assets/fonts/{fontstack}/{range}.pbf'
const LOCAL_SPRITE_URL = '/offline/assets/sprites/v4/light'
const OFFLINE_PMTILES_URL = '/offline/bengaluru.pmtiles'

export function buildOfflineStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: LOCAL_GLYPHS_URL,
    sprite: LOCAL_SPRITE_URL,
    sources: {
      bengaluru: {
        type: 'vector',
        url: `pmtiles://${window.location.origin}${OFFLINE_PMTILES_URL}`,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> <a href="https://protomaps.com">© Protomaps</a>',
      },
    },
    layers: layers('bengaluru', namedFlavor('light'), { lang: 'en' }) as StyleSpecification['layers'],
  }
}
