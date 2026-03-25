from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import osmnx as ox


BBOX = (77.5, 12.9, 77.7, 13.05)
OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "public" / "offline" / "road-graph.json"
)


def round_coord(value: float) -> float:
    return round(float(value), 6)


def serialize_graph(graph: Any) -> dict[str, Any]:
    node_ids: list[Any] = []
    nodes: list[list[float]] = []
    node_index_by_id: dict[Any, int] = {}
    edges: list[list[Any]] = []

    for node_id, data in graph.nodes(data=True):
        node_index_by_id[node_id] = len(node_ids)
        node_ids.append(node_id)
        nodes.append([round_coord(data["x"]), round_coord(data["y"])])

    for from_id, to_id, _key, data in graph.edges(keys=True, data=True):
        geometry = data.get("geometry")
        from_index = node_index_by_id[from_id]
        to_index = node_index_by_id[to_id]

        if geometry is None:
            coordinates = [
                nodes[from_index],
                nodes[to_index],
            ]
        else:
            coordinates = [[round_coord(lng), round_coord(lat)] for lng, lat in geometry.coords]

        edges.append(
            [
                from_index,
                to_index,
                round(float(data.get("length", 0.0)), 1),
                coordinates,
            ]
        )

    return {
        "bbox": list(BBOX),
        "nodes": nodes,
        "edges": edges,
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
        f"Wrote {len(serialized['nodes'])} nodes and {len(serialized['edges'])} edges to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
