from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

import osmnx as ox


BBOX = (77.5, 12.9, 77.7, 13.05)
OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "public" / "offline" / "traffic-levels.geojson"
)
RANDOM_SEED = 42
MAIN_HIGHWAYS = {"motorway", "trunk", "primary", "secondary"}
SUB_HIGHWAYS = {"tertiary", "tertiary_link", "residential", "unclassified", "service"}


def round_coord(value: float) -> float:
    return round(float(value), 6)


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def normalize_highway(value: Any) -> str:
    for item in as_list(value):
        if isinstance(item, str):
            return item
    return ""


def normalize_name(row: Any, index: int) -> str:
    for field in ("name", "ref"):
        value = row.get(field)
        for item in as_list(value):
            if isinstance(item, str) and item.strip():
                return item.strip()
    return f"Unnamed road {index}"


def assign_traffic_level(road_class: str, rng: random.Random) -> str:
    if road_class == "main":
        return "red" if rng.random() < 0.68 else "orange"
    return "orange" if rng.random() < 0.72 else "red"


def pick_roads(rows: list[dict[str, Any]], road_class: str, count: int, rng: random.Random) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}

    for row in rows:
        grouped.setdefault(row["roadName"], []).append(row)

    road_names = list(grouped.keys())
    rng.shuffle(road_names)

    selected_names = road_names[: min(count, len(road_names))]
    selected_rows: list[dict[str, Any]] = []

    for road_name in selected_names:
        segments = sorted(grouped[road_name], key=lambda item: item["length"], reverse=True)[:3]
        for segment in segments:
            selected_rows.append(
                {
                    **segment,
                    "roadClass": road_class,
                    "trafficLevel": assign_traffic_level(road_class, rng),
                }
            )

    return selected_rows


def build_feature(row: dict[str, Any]) -> dict[str, Any]:
    geometry = row["geometry"]
    coordinates = [[round_coord(lng), round_coord(lat)] for lng, lat in geometry.coords]

    return {
        "type": "Feature",
        "properties": {
            "roadName": row["roadName"],
            "roadClass": row["roadClass"],
            "trafficLevel": row["trafficLevel"],
            "length": round(float(row["length"]), 1),
            "highway": row["highway"],
        },
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates,
        },
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(RANDOM_SEED)

    graph = ox.graph.graph_from_bbox(
        BBOX,
        network_type="drive",
        simplify=True,
        retain_all=False,
        truncate_by_edge=True,
    )
    edges = ox.graph_to_gdfs(graph, nodes=False)

    main_candidates: list[dict[str, Any]] = []
    sub_candidates: list[dict[str, Any]] = []

    for index, (_edge_id, row) in enumerate(edges.iterrows()):
        geometry = row.get("geometry")
        if geometry is None:
            continue

        highway = normalize_highway(row.get("highway"))
        if not highway:
            continue

        road = {
            "roadName": normalize_name(row, index),
            "highway": highway,
            "length": float(row.get("length", 0.0)),
            "geometry": geometry,
        }

        if highway in MAIN_HIGHWAYS:
            main_candidates.append(road)
        elif highway in SUB_HIGHWAYS:
            sub_candidates.append(road)

    selected_rows = [
        *pick_roads(main_candidates, "main", 9, rng),
        *pick_roads(sub_candidates, "sub", 14, rng),
    ]

    feature_collection = {
        "type": "FeatureCollection",
        "features": [build_feature(row) for row in selected_rows],
    }

    with OUTPUT_PATH.open("w", encoding="utf-8") as output_file:
        json.dump(feature_collection, output_file, separators=(",", ":"))

    print(
        f"Wrote {len(feature_collection['features'])} traffic segments to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
