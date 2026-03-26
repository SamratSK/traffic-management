from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import osmnx as ox


BBOX = (77.5, 12.9, 77.7, 13.05)
BUCKET_PRECISION = 0.01
OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "public" / "offline" / "road-graph.json"
)


def round_coord(value: float) -> float:
    return round(float(value), 6)


def bucket_key(lng: float, lat: float) -> str:
    lng_bucket = round(lng / BUCKET_PRECISION)
    lat_bucket = round(lat / BUCKET_PRECISION)
    return f"{lng_bucket}:{lat_bucket}"


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


def classify_road(highway: str) -> int:
    if highway in {"motorway", "trunk", "primary", "secondary"}:
        return 2
    if highway in {"tertiary", "tertiary_link", "secondary_link", "primary_link"}:
        return 1
    return 0


def serialize_graph(graph: Any) -> dict[str, Any]:
    node_lngs: list[float] = []
    node_lats: list[float] = []
    node_index_by_id: dict[Any, int] = {}
    bucket_map: dict[str, list[int]] = defaultdict(list)
    outgoing_edges: dict[int, list[tuple[int, float, int, list[list[float]]]]] = defaultdict(list)

    edge_targets: list[int] = []
    edge_weights: list[float] = []
    edge_road_classes: list[int] = []
    edge_geometry_starts: list[int] = []
    edge_geometry_lengths: list[int] = []
    edge_coordinates: list[float] = []
    node_offsets: list[int] = [0]

    for node_id, data in graph.nodes(data=True):
        lng = round_coord(data["x"])
        lat = round_coord(data["y"])
        node_index = len(node_lngs)
        node_index_by_id[node_id] = node_index
        node_lngs.append(lng)
        node_lats.append(lat)
        bucket_map[bucket_key(lng, lat)].append(node_index)

    for from_id, to_id, _key, data in graph.edges(keys=True, data=True):
        geometry = data.get("geometry")
        from_index = node_index_by_id[from_id]
        to_index = node_index_by_id[to_id]
        highway = normalize_highway(data.get("highway"))

        if geometry is None:
            coordinates = [
                [node_lngs[from_index], node_lats[from_index]],
                [node_lngs[to_index], node_lats[to_index]],
            ]
        else:
            coordinates = [[round_coord(lng), round_coord(lat)] for lng, lat in geometry.coords]

        outgoing_edges[from_index].append(
            (
                to_index,
                round(float(data.get("length", 0.0)), 1),
                classify_road(highway),
                coordinates,
            )
        )

    node_count = len(node_lngs)
    for node_index in range(node_count):
        node_edges = outgoing_edges.get(node_index, [])
        for target_index, weight, road_class, coordinates in node_edges:
            edge_targets.append(target_index)
            edge_weights.append(weight)
            edge_road_classes.append(road_class)
            edge_geometry_starts.append(len(edge_coordinates) // 2)
            edge_geometry_lengths.append(len(coordinates))
            for lng, lat in coordinates:
                edge_coordinates.append(lng)
                edge_coordinates.append(lat)
        node_offsets.append(len(edge_targets))

    return {
        "bbox": list(BBOX),
        "bucketPrecision": BUCKET_PRECISION,
        "nodeLngs": node_lngs,
        "nodeLats": node_lats,
        "buckets": bucket_map,
        "nodeOffsets": node_offsets,
        "edgeTargets": edge_targets,
        "edgeWeights": edge_weights,
        "edgeRoadClasses": edge_road_classes,
        "edgeGeometryStarts": edge_geometry_starts,
        "edgeGeometryLengths": edge_geometry_lengths,
        "edgeCoordinates": edge_coordinates,
    }


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    graph = ox.graph.graph_from_bbox(
        BBOX,
        network_type="drive",
        simplify=True,
        retain_all=False,
        truncate_by_edge=True,
    )
    serialized = serialize_graph(graph)

    with OUTPUT_PATH.open("w", encoding="utf-8") as output_file:
        json.dump(serialized, output_file, separators=(",", ":"))

    print(
        f"Wrote {len(serialized['nodeLngs'])} nodes and {len(serialized['edgeTargets'])} edges to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
