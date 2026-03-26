import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

const LOCAL_GLYPHS_PATH = '/offline/assets/fonts/{fontstack}/{range}.pbf'
const LOCAL_SPRITE_PATH = '/offline/assets/sprites/v4/light'
const OFFLINE_PMTILES_URL = '/offline/bengaluru.pmtiles'

export function buildOfflineStyle(): StyleSpecification {
  const origin = window.location.origin

  return {
    version: 8,
    glyphs: `${origin}${LOCAL_GLYPHS_PATH}`,
    sprite: `${origin}${LOCAL_SPRITE_PATH}`,
    sources: {
      bengaluru: {
        type: 'vector',
        url: `pmtiles://${origin}${OFFLINE_PMTILES_URL}`,
        attribution:
          '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a> <a href="https://protomaps.com">© Protomaps</a>',
      },
    },
    layers: layers('bengaluru', namedFlavor('light'), { lang: 'en' }) as StyleSpecification['layers'],
  }
}
