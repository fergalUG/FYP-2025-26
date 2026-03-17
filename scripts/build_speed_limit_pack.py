#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sqlite3
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import osmium  # type: ignore
except ImportError:  # pragma: no cover - exercised only in CI build path
    osmium = None


DRIVABLE_HIGHWAYS = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "living_street",
    "service",
    "motorway_link",
    "trunk_link",
    "primary_link",
    "secondary_link",
    "tertiary_link",
}
CELL_SIZE_DEGREES = 0.002
DEFAULT_SOURCE_SPEEDS = {
    "IE:urban": 50.0,
    "IE:rural": 80.0,
    "IE:national": 100.0,
    "IE:motorway": 120.0,
    "GB:20 mph": 32.2,
    "GB:30 mph": 48.3,
    "GB:40 mph": 64.4,
    "GB:50 mph": 80.5,
    "GB:60 mph": 96.6,
    "GB:70 mph": 112.7,
    "GB:nsl_single": 96.6,
    "GB:nsl_dual": 112.7,
    "GB:nsl_restricted": 48.3,
    "GB:motorway": 112.7,
}


@dataclass
class ResolvedSpeedLimit:
    speed_limit_kmh: float
    raw_speed_tag: Optional[str]
    raw_source_tag: Optional[str]


@dataclass
class BuildStats:
    roads_written: int = 0
    segments_written: int = 0
    roads_skipped_directional_conflict: int = 0
    roads_skipped_missing_limit: int = 0
    roads_skipped_non_drivable: int = 0


def parse_maxspeed(raw_value: Optional[str]) -> Optional[float]:
    if not raw_value:
        return None

    value = raw_value.strip().lower()
    if not value:
        return None

    first_segment = value.split(";")[0].strip()
    numeric = ""
    decimal_seen = False
    for char in first_segment:
        if char.isdigit():
            numeric += char
        elif char == "." and not decimal_seen:
            numeric += char
            decimal_seen = True
        elif numeric:
            break

    if not numeric:
        return None

    parsed = float(numeric)
    if parsed <= 0:
        return None

    if "mph" in first_segment:
        return round(parsed * 1.60934, 1)

    return round(parsed, 1)


def resolve_speed_limit(tags: Dict[str, str], stats: BuildStats) -> Optional[ResolvedSpeedLimit]:
    explicit = parse_maxspeed(tags.get("maxspeed"))
    if explicit is not None:
        return ResolvedSpeedLimit(explicit, tags.get("maxspeed"), tags.get("source:maxspeed") or tags.get("maxspeed:type"))

    forward_raw = tags.get("maxspeed:forward")
    backward_raw = tags.get("maxspeed:backward")
    forward_value = parse_maxspeed(forward_raw)
    backward_value = parse_maxspeed(backward_raw)

    if forward_value is not None and backward_value is None:
        return ResolvedSpeedLimit(forward_value, forward_raw, tags.get("source:maxspeed") or tags.get("maxspeed:type"))

    if backward_value is not None and forward_value is None:
        return ResolvedSpeedLimit(backward_value, backward_raw, tags.get("source:maxspeed") or tags.get("maxspeed:type"))

    if forward_value is not None and backward_value is not None:
        if forward_value == backward_value:
            return ResolvedSpeedLimit(forward_value, forward_raw, tags.get("source:maxspeed") or tags.get("maxspeed:type"))

        stats.roads_skipped_directional_conflict += 1
        return None

    source_tag = tags.get("source:maxspeed") or tags.get("maxspeed:type")
    if source_tag in DEFAULT_SOURCE_SPEEDS:
        return ResolvedSpeedLimit(DEFAULT_SOURCE_SPEEDS[source_tag], None, source_tag)

    stats.roads_skipped_missing_limit += 1
    return None


def iter_segment_cells(start_lat: float, start_lon: float, end_lat: float, end_lon: float) -> Iterable[str]:
    min_lat_index = math.floor(min(start_lat, end_lat) / CELL_SIZE_DEGREES)
    max_lat_index = math.floor(max(start_lat, end_lat) / CELL_SIZE_DEGREES)
    min_lon_index = math.floor(min(start_lon, end_lon) / CELL_SIZE_DEGREES)
    max_lon_index = math.floor(max(start_lon, end_lon) / CELL_SIZE_DEGREES)

    for lat_index in range(min_lat_index, max_lat_index + 1):
        for lon_index in range(min_lon_index, max_lon_index + 1):
            yield f"{lat_index}:{lon_index}"


class PackWriter:
    def __init__(self, output_db: Path, region_id: str, region_name: str, pack_version: str, source_timestamp: str) -> None:
        output_db.parent.mkdir(parents=True, exist_ok=True)
        if output_db.exists():
            output_db.unlink()

        self.connection = sqlite3.connect(output_db)
        self.output_db = output_db
        self.region_id = region_id
        self.region_name = region_name
        self.pack_version = pack_version
        self.source_timestamp = source_timestamp
        self.stats = BuildStats()
        self._segment_id = 1
        self._bounds: Optional[Tuple[float, float, float, float]] = None
        self._setup_schema()

    def _setup_schema(self) -> None:
        cursor = self.connection.cursor()
        cursor.executescript(
            """
            PRAGMA journal_mode = OFF;
            PRAGMA synchronous = OFF;

            CREATE TABLE pack_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE road_segments (
              id INTEGER PRIMARY KEY,
              way_id INTEGER NOT NULL,
              speed_limit_kmh REAL NOT NULL,
              raw_speed_tag TEXT,
              raw_source_tag TEXT,
              start_lat REAL NOT NULL,
              start_lon REAL NOT NULL,
              end_lat REAL NOT NULL,
              end_lon REAL NOT NULL
            );

            CREATE TABLE segment_cells (
              cell_key TEXT NOT NULL,
              segment_id INTEGER NOT NULL,
              PRIMARY KEY (cell_key, segment_id)
            );

            CREATE INDEX idx_segment_cells_key ON segment_cells(cell_key);
            """
        )
        self.connection.commit()

    def _update_bounds(self, coordinates: Sequence[Tuple[float, float]]) -> None:
        latitudes = [coordinate[0] for coordinate in coordinates]
        longitudes = [coordinate[1] for coordinate in coordinates]
        new_bounds = (min(latitudes), min(longitudes), max(latitudes), max(longitudes))

        if self._bounds is None:
            self._bounds = new_bounds
            return

        self._bounds = (
            min(self._bounds[0], new_bounds[0]),
            min(self._bounds[1], new_bounds[1]),
            max(self._bounds[2], new_bounds[2]),
            max(self._bounds[3], new_bounds[3]),
        )

    def add_way(self, way_id: int, tags: Dict[str, str], coordinates: Sequence[Tuple[float, float]]) -> None:
        if tags.get("highway") not in DRIVABLE_HIGHWAYS:
            self.stats.roads_skipped_non_drivable += 1
            return

        resolved_limit = resolve_speed_limit(tags, self.stats)
        if resolved_limit is None:
            return

        usable_coordinates = [coordinate for coordinate in coordinates if len(coordinate) == 2]
        if len(usable_coordinates) < 2:
            return

        self.stats.roads_written += 1
        self._update_bounds(usable_coordinates)

        cursor = self.connection.cursor()

        for index in range(len(usable_coordinates) - 1):
            start_lat, start_lon = usable_coordinates[index]
            end_lat, end_lon = usable_coordinates[index + 1]

            if start_lat == end_lat and start_lon == end_lon:
                continue

            segment_id = self._segment_id
            self._segment_id += 1

            cursor.execute(
                """
                INSERT INTO road_segments (
                  id,
                  way_id,
                  speed_limit_kmh,
                  raw_speed_tag,
                  raw_source_tag,
                  start_lat,
                  start_lon,
                  end_lat,
                  end_lon
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    segment_id,
                    way_id,
                    resolved_limit.speed_limit_kmh,
                    resolved_limit.raw_speed_tag,
                    resolved_limit.raw_source_tag,
                    start_lat,
                    start_lon,
                    end_lat,
                    end_lon,
                ),
            )

            cursor.executemany(
                "INSERT OR IGNORE INTO segment_cells (cell_key, segment_id) VALUES (?, ?)",
                [(cell_key, segment_id) for cell_key in iter_segment_cells(start_lat, start_lon, end_lat, end_lon)],
            )
            self.stats.segments_written += 1

        self.connection.commit()

    def finalize(self) -> Dict[str, object]:
        cursor = self.connection.cursor()
        bounds = self._bounds or (0.0, 0.0, 0.0, 0.0)

        metadata = {
            "schemaVersion": "1",
            "regionId": self.region_id,
            "regionName": self.region_name,
            "packVersion": self.pack_version,
            "sourceTimestamp": self.source_timestamp,
            "segmentCount": str(self.stats.segments_written),
            "roadCount": str(self.stats.roads_written),
            "roadsSkippedDirectionalConflict": str(self.stats.roads_skipped_directional_conflict),
        }

        cursor.executemany(
            "INSERT INTO pack_metadata (key, value) VALUES (?, ?)",
            list(metadata.items()),
        )
        self.connection.commit()
        self.connection.close()

        return {
            "bounds": {
                "minLat": bounds[0],
                "minLon": bounds[1],
                "maxLat": bounds[2],
                "maxLon": bounds[3],
            },
            "stats": self.stats,
        }


def load_xml_ways(input_path: Path, writer: PackWriter) -> None:
    root = ET.parse(input_path).getroot()
    nodes = {
        node.attrib["id"]: (float(node.attrib["lat"]), float(node.attrib["lon"]))
        for node in root.findall("node")
    }

    for way in root.findall("way"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
        coordinates = [nodes[ref.attrib["ref"]] for ref in way.findall("nd") if ref.attrib["ref"] in nodes]
        writer.add_way(int(way.attrib["id"]), tags, coordinates)


def load_pbf_ways(input_path: Path, writer: PackWriter) -> None:
    if osmium is None:
        raise RuntimeError("The 'osmium' Python package is required to process .osm.pbf inputs.")

    class WayHandler(osmium.SimpleHandler):  # type: ignore[misc]
        def way(self, way) -> None:
            tags = {tag.k: tag.v for tag in way.tags}
            coordinates: List[Tuple[float, float]] = []

            for node in way.nodes:
                if not node.location.valid():
                    continue
                coordinates.append((float(node.location.lat), float(node.location.lon)))

            writer.add_way(int(way.id), tags, coordinates)

    handler = WayHandler()
    handler.apply_file(str(input_path), locations=True)


def compute_md5(file_path: Path) -> str:
    hasher = hashlib.md5()
    with file_path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def ensure_input_file(args: argparse.Namespace) -> Path:
    if args.input:
        return Path(args.input)

    if not args.input_url:
        raise RuntimeError("Either --input or --input-url must be provided.")

    download_target = Path(tempfile.mkdtemp(prefix="speed-limit-pack-build-")) / Path(args.input_url).name
    urllib.request.urlretrieve(args.input_url, download_target)
    return download_target


def build_manifest(
    output_db: Path,
    output_manifest: Path,
    region_id: str,
    region_name: str,
    pack_version: str,
    source_timestamp: str,
    download_url: str,
    bounds: Dict[str, float],
) -> None:
    output_manifest.parent.mkdir(parents=True, exist_ok=True)

    manifest = {
        "schemaVersion": 1,
        "generatedAt": source_timestamp,
        "regionId": region_id,
        "regionName": region_name,
        "packVersion": pack_version,
        "sourceTimestamp": source_timestamp,
        "downloadUrl": download_url,
        "md5": compute_md5(output_db),
        "sizeBytes": output_db.stat().st_size,
        "bounds": bounds,
        "osmAttribution": "Contains OpenStreetMap data © OpenStreetMap contributors (ODbL).",
    }

    output_manifest.write_text(json.dumps(manifest, indent=2))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build an offline speed limit SQLite pack from OpenStreetMap data.")
    parser.add_argument("--input", help="Path to a local .osm or .osm.pbf extract.")
    parser.add_argument("--input-url", help="Remote URL for a .osm.pbf extract to download.")
    parser.add_argument("--output-db", required=True, help="Path to the output SQLite pack.")
    parser.add_argument("--output-manifest", required=True, help="Path to the output manifest JSON.")
    parser.add_argument("--download-url", required=True, help="Download URL to place in the generated manifest.")
    parser.add_argument("--region-id", required=True, help="Region id for the generated pack.")
    parser.add_argument("--region-name", required=True, help="Human-readable region name.")
    parser.add_argument("--pack-version", required=True, help="Pack version string.")
    parser.add_argument("--source-timestamp", required=True, help="UTC timestamp for the source data/version.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    input_path = ensure_input_file(args)
    output_db = Path(args.output_db)
    output_manifest = Path(args.output_manifest)

    writer = PackWriter(output_db, args.region_id, args.region_name, args.pack_version, args.source_timestamp)

    if input_path.suffix == ".pbf" or input_path.name.endswith(".osm.pbf"):
        load_pbf_ways(input_path, writer)
    else:
        load_xml_ways(input_path, writer)

    result = writer.finalize()
    build_manifest(
        output_db=output_db,
        output_manifest=output_manifest,
        region_id=args.region_id,
        region_name=args.region_name,
        pack_version=args.pack_version,
        source_timestamp=args.source_timestamp,
        download_url=args.download_url,
        bounds=result["bounds"],
    )

    print(
        json.dumps(
            {
                "outputDb": str(output_db),
                "outputManifest": str(output_manifest),
                "roadsWritten": result["stats"].roads_written,
                "segmentsWritten": result["stats"].segments_written,
                "directionalConflictsSkipped": result["stats"].roads_skipped_directional_conflict,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
