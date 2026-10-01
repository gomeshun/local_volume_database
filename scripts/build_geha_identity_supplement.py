"""Enrich committed public snapshots from a verified local Geha MRT, offline."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("LVDBDIR", str(ROOT) + "/")
sys.path.insert(0, str(ROOT / "src"))
from local_volume_database.kinematics import KINEMATIC_SOURCES, load_dwarf_rows, normalize_table, read_table_payload  # noqa: E402

SOURCE_NAME = "geha2026_deimos_expanded_aas_iop"
NUMERIC = {"ra_deg", "dec_deg", "vlos_kms", "vlos_err_kms", "pmra_masyr", "pmra_err_masyr", "pmdec_masyr", "pmdec_err_masyr", "membership_probability", "feh", "feh_err"}


def equal_public_value(column: str, old: str, new: object) -> bool:
    """Compare original public values without changing their representation.

    Parameters
    ----------
    column : str
        Existing public column name.
    old : str
        Committed public string value.
    new : object
        Independently normalized value from the local source file.

    Returns
    -------
    bool
        Whether values agree, using decimal comparison for measurements.
    """
    text = "" if new is None else str(new)
    if column in NUMERIC and old and text:
        try:
            return Decimal(old) == Decimal(text)
        except InvalidOperation:
            return False
    return old == text


def main() -> None:
    """Verify the source snapshot and write only additive identity metadata.

    Returns
    -------
    None
        Writes supplements and manifest pointers after every row passes checks.
    """
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_file", type=Path, help="Previously downloaded registered Geha Table A5 MRT; no network is used")
    args = parser.parse_args()
    source = next(item for item in KINEMATIC_SOURCES if item.name == SOURCE_NAME)
    raw = args.source_file.read_bytes()
    normalized = normalize_table(read_table_payload(raw, source.table_format), source, load_dwarf_rows(ROOT / "data/dwarf_mw.csv"))
    by_row = {str(row["source_row"]): row for row in normalized}
    assert len(by_row) == len(normalized), "Duplicate normalized source rows"
    public_root = ROOT / "web/public/data/kinematics"
    pending = []
    seen = set()
    for manifest_path in sorted(public_root.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text())
        rows = []
        for chunk in manifest["chunks"]:
            if chunk["sourceName"] != SOURCE_NAME:
                continue
            chunk_bytes = (ROOT / "web/public" / chunk["path"].lstrip("/")).read_bytes()
            assert hashlib.sha256(chunk_bytes).hexdigest() == chunk["sha256"], "Base chunk checksum mismatch"
            for old in json.loads(chunk_bytes)["rows"]:
                row_id = old["source_row"]
                assert row_id not in seen, f"Duplicate public Geha source row {row_id}"
                seen.add(row_id)
                current = by_row[row_id]
                for column, value in old.items():
                    assert equal_public_value(column, value, current.get(column)), f"Source mismatch: row {row_id}, {column}: {value!r} != {current.get(column)!r}"
                rows.append({"source_row": row_id, "star_id": old["star_id"], "source_target_label": current["source_target_label"] or "", "gaia_source_id": current["gaia_source_id"] or ""})
        if not rows:
            continue
        supplement = {"schemaVersion": 1, "objectKey": manifest["objectKey"], "sourceProvider": source.provider, "sourceName": source.name, "sourceTable": source.source_id, "sourceUrl": source.url, "sourceFileSha256": hashlib.sha256(raw).hexdigest(), "basePublicDataSha256": manifest["publicDataSha256"], "baseSourceInputSha256": manifest["sourceInputSha256"], "verification": "Every pre-existing public field matched independently normalized source rows; original public chunks and scientific values are unchanged.", "rows": rows}
        content = json.dumps(supplement, ensure_ascii=False, separators=(",", ":")) + "\n"
        manifest["identitySupplement"] = {"path": f"/data/kinematics/{manifest['objectKey']}/geha-record-identities.json", "sha256": hashlib.sha256(content.encode()).hexdigest(), "sourceFileSha256": supplement["sourceFileSha256"], "sourceUrl": source.url, "basePublicDataSha256": manifest["publicDataSha256"]}
        pending.append((manifest_path, manifest, content))
    assert seen == set(by_row), "Public and source Geha row coverage differs"
    for manifest_path, manifest, content in pending:
        (manifest_path.parent / "geha-record-identities.json").write_text(content)
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Verified all original fields for {len(seen)} Geha rows; added identity supplements for {len(pending)} objects. Source SHA-256: {hashlib.sha256(raw).hexdigest()}")


if __name__ == "__main__":
    main()
