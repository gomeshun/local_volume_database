"""Tools for fetching and normalizing member-star kinematics data."""

from .core import (
    KinematicSource,
    STANDARD_COLUMNS,
    VizierClient,
    build_reference_manifest,
    fetch_registered_sources,
    fetch_source_table,
    guess_vizier_source_id,
    load_dwarf_rows,
    normalize_table,
    read_table_payload,
    write_kinematics_outputs,
    write_reference_manifest,
)
from .registry import KINEMATIC_SOURCES, sources_by_bibcode, sources_by_name

__all__ = [
    "KINEMATIC_SOURCES",
    "KinematicSource",
    "STANDARD_COLUMNS",
    "VizierClient",
    "build_reference_manifest",
    "fetch_registered_sources",
    "fetch_source_table",
    "guess_vizier_source_id",
    "load_dwarf_rows",
    "normalize_table",
    "read_table_payload",
    "sources_by_bibcode",
    "sources_by_name",
    "write_kinematics_outputs",
    "write_reference_manifest",
]
