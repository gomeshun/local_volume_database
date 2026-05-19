#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("LVDBDIR", str(ROOT) + "/")
sys.path.insert(0, str(ROOT / "src"))

from local_volume_database.kinematics import (  # noqa: E402
    KINEMATIC_SOURCES,
    build_reference_manifest,
    fetch_gaia_dr3_proper_motions,
    fetch_registered_sources,
    guess_vizier_source_id,
    load_dwarf_rows,
    write_reference_manifest,
)
from local_volume_database.kinematics.core import VizierClient  # noqa: E402


def main() -> None:
    """Run the member-star kinematics fetcher command-line interface.

    The CLI writes reference manifests, lists registered data sources, fetches
    normalized kinematics tables, and probes likely VizieR source identifiers.

    Returns
    -------
    None
        Results are printed to stdout and written to the requested output paths.
    """
    parser = argparse.ArgumentParser(description="Fetch and normalize dwarf_mw member-star kinematics tables.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    manifest_parser = subparsers.add_parser("manifest", help="Write the dwarf_mw reference manifest.")
    manifest_parser.add_argument("--output", type=Path, default=ROOT / "data_kinematics" / "manifest" / "dwarf_mw_references.csv")

    list_parser = subparsers.add_parser("list-sources", help="List registered paper/table fetchers.")
    list_parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    list_parser.add_argument("--provider", action="append", dest="providers", help="Limit listed sources to a provider; repeatable.")

    fetch_parser = subparsers.add_parser("fetch", help="Fetch registered provider tables and write normalized CSV files.")
    fetch_parser.add_argument("--source", action="append", dest="sources", help="Registered source name; repeatable.")
    fetch_parser.add_argument("--provider", action="append", dest="providers", help="Limit fetched sources to a provider; repeatable.")
    fetch_parser.add_argument("--object-key", action="append", dest="object_keys", help="Limit output to a dwarf key; repeatable.")
    fetch_parser.add_argument("--max-rows", type=int, help="Limit rows per source table for smoke tests.")
    fetch_parser.add_argument("--force", action="store_true", help="Re-download raw provider tables even if cached.")
    fetch_parser.add_argument("--min-interval", type=float, default=3.2, help="Seconds between remote requests.")
    fetch_parser.add_argument("--cache-dir", type=Path, default=ROOT / "data_kinematics" / "raw")
    fetch_parser.add_argument("--output-dir", type=Path, default=ROOT / "data_kinematics" / "processed")

    gaia_parser = subparsers.add_parser(
        "fetch-gaia",
        help="Fetch Gaia DR3 proper motions for member stars with Gaia source IDs in the normalized output.",
    )
    gaia_parser.add_argument("--input", type=Path, default=ROOT / "data_kinematics" / "processed" / "dwarf_mw_kinematics.csv")
    gaia_parser.add_argument("--cache-dir", type=Path, default=ROOT / "data_kinematics" / "raw")
    gaia_parser.add_argument("--output-dir", type=Path, default=ROOT / "data_kinematics" / "processed")
    gaia_parser.add_argument("--batch-size", type=int, default=400, help="Gaia source IDs per TAP query.")
    gaia_parser.add_argument("--force", action="store_true", help="Re-download Gaia TAP batches even if cached.")
    gaia_parser.add_argument("--min-interval", type=float, default=3.2, help="Seconds between Gaia TAP requests.")
    gaia_parser.add_argument(
        "--no-merge-combined",
        action="store_true",
        help="Write gaia_dr3_proper_motion.csv without appending Gaia rows to dwarf_mw_kinematics.csv.",
    )

    discover_parser = subparsers.add_parser("discover", help="Probe guessed VizieR source IDs for dwarf_mw kinematic refs.")
    discover_parser.add_argument("--ref", action="append", dest="refs", help="Specific bibcode to probe; repeatable.")
    discover_parser.add_argument("--max-refs", type=int, help="Maximum refs to probe.")
    discover_parser.add_argument("--force", action="store_true", help="Re-download ASU-TSV discovery files.")
    discover_parser.add_argument("--min-interval", type=float, default=3.2, help="Seconds between VizieR requests.")
    discover_parser.add_argument("--cache-dir", type=Path, default=ROOT / "data_kinematics" / "raw")
    discover_parser.add_argument("--output", type=Path, default=ROOT / "data_kinematics" / "manifest" / "vizier_discovery.json")

    args = parser.parse_args()
    dwarf_rows = load_dwarf_rows(ROOT / "data" / "dwarf_mw.csv")

    if args.command == "manifest":
        rows = build_reference_manifest(dwarf_rows, KINEMATIC_SOURCES)
        write_reference_manifest(rows, args.output)
        print(f"wrote {len(rows)} manifest rows to {args.output}")
    elif args.command == "list-sources":
        listed_sources = [
            source
            for source in KINEMATIC_SOURCES
            if not args.providers or source.provider in set(args.providers)
        ]
        payload = [
            {
                "name": source.name,
                "bibcode": source.bibcode,
                "provider": source.provider,
                "source_id": source.source_id,
                "data_url": source.data_url,
                "source_kind": source.source_kind,
                "query_constraints": dict(source.query_constraints),
                "notes": source.notes,
            }
            for source in listed_sources
        ]
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            for item in payload:
                print(f"{item['name']}: {item['bibcode']} -> {item['source_id']} ({item['source_kind']}, {item['provider']})")
    elif args.command == "fetch":
        rows = fetch_registered_sources(
            KINEMATIC_SOURCES,
            dwarf_rows,
            cache_dir=args.cache_dir,
            output_dir=args.output_dir,
            source_names=args.sources,
            providers=args.providers,
            object_keys=args.object_keys,
            max_rows=args.max_rows,
            force=args.force,
            min_interval_s=args.min_interval,
        )
        print(f"wrote {len(rows)} normalized rows under {args.output_dir}")
    elif args.command == "fetch-gaia":
        rows = fetch_gaia_dr3_proper_motions(
            input_csv=args.input,
            cache_dir=args.cache_dir,
            output_dir=args.output_dir,
            batch_size=args.batch_size,
            force=args.force,
            min_interval_s=args.min_interval,
            merge_combined=not args.no_merge_combined,
        )
        print(f"wrote {len(rows)} Gaia DR3 proper-motion rows under {args.output_dir}")
    elif args.command == "discover":
        refs = args.refs or sorted(
            {
                value.strip()
                for row in dwarf_rows
                for value in (row.get("ref_vlos", ""), row.get("ref_proper_motion", ""))
                if value.strip()
            }
        )
        if args.max_refs is not None:
            refs = refs[: args.max_refs]
        client = VizierClient(cache_dir=args.cache_dir, min_interval_s=args.min_interval)
        results = []
        for bibcode in refs:
            guessed_source = guess_vizier_source_id(bibcode)
            result = {"bibcode": bibcode, "guessed_source_id": guessed_source, "status": "skipped"}
            if guessed_source:
                try:
                    text = client.fetch_asu_tsv(guessed_source, max_rows=2, force=args.force)
                    result["status"] = "found" if "Table or Catalog not found" not in text else "not_found"
                except Exception as exc:  # discovery should continue over individual failures
                    result["status"] = "error"
                    result["error"] = str(exc)
            results.append(result)
            print(f"{bibcode}: {result['status']} {guessed_source or ''}")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(results, indent=2, sort_keys=True), encoding="utf-8")
        print(f"wrote discovery results to {args.output}")


if __name__ == "__main__":
    main()
