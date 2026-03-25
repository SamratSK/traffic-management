Offline mode now prefers a Bengaluru-only PMTiles basemap:

1. `bengaluru.pmtiles`
   A local vector tiles archive for Bengaluru.

2. `assets/fonts`
   Local glyph PBFs used by MapLibre labels.

3. `assets/sprites`
   Local sprite sheets for POI icons and shields.

4. `traffic-signals.json`
   An Overpass-style JSON payload for Bengaluru traffic signals.

Build helper:

```bash
bash scripts/fetch_bengaluru_offline.sh
```

The helper extracts Bengaluru from a Protomaps daily planet build and downloads the required style assets.
By default it uses the source archive's maximum available zoom. You can override that with `MAXZOOM=...` if needed.

To remove unused offline assets after download:

```bash
bash scripts/prune_offline_assets.sh
```

Current app requirements:
- sprite set: `assets/sprites/v4/light*`
- glyphs: `Noto Sans Regular`, `Noto Sans Medium`, `Noto Sans Italic`

MapLibre map labels require glyph `PBF` files. `woff2` webfonts cannot replace those glyph endpoints directly.
