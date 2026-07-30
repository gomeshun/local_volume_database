from __future__ import annotations

import os
import sys
from pathlib import Path

from astropy.table import Table

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("LVDBDIR", str(ROOT) + "/")
sys.path.insert(0, str(ROOT / "src"))

from local_volume_database.kinematics import (  # noqa: E402
    GAIA_DR3_SOURCE_NAME,
    GaiaKinematicTarget,
    KINEMATIC_SOURCES,
    KinematicSource,
    build_reference_manifest,
    gaia_source_ids_from_normalized_row,
    guess_vizier_source_id,
    load_dwarf_rows,
    normalize_gaia_dr3_rows,
    normalize_table,
    read_table_payload,
)


def test_guess_vizier_source_id() -> None:
    """Test ADS bibcode to VizieR source-id inference.

    Returns
    -------
    None
        Assertions validate representative journal bibcodes.
    """
    assert guess_vizier_source_id("Walker2009AJ....137.3100W") == "J/AJ/137/3100"
    assert guess_vizier_source_id("Fritz2019A&A...623A.129F") == "J/A+A/623/A129"
    assert guess_vizier_source_id("Ji2021ApJ...921...32J") == "J/ApJ/921/32"


def test_reference_manifest_marks_registered_sources() -> None:
    """Test that the reference manifest flags registered fetchers.

    Returns
    -------
    None
        Assertions validate registered and unregistered dwarf references.
    """
    dwarf_rows = load_dwarf_rows(ROOT / "data" / "dwarf_mw.csv")
    manifest = build_reference_manifest(dwarf_rows, KINEMATIC_SOURCES)
    assert any(row["object_key"] == "antlia_2" and row["registered"] == "1" for row in manifest)
    assert any(row["bibcode"] == "Pace2022ApJ...940..136P" and row["registered"] == "1" for row in manifest)


def test_normalize_walker_like_table() -> None:
    """Test normalization of a Walker-style spectroscopy table.

    Returns
    -------
    None
        Assertions validate coordinate conversion, velocity, and membership.
    """
    source = next(source for source in KINEMATIC_SOURCES if source.name == "walker2009_stars")
    table = Table(
        rows=[("Car-0001", "06 42 17.94", "-50 53 58.4", 1.0, 219.0, 2.0)],
        names=["Target", "RAJ2000", "DEJ2000", "Mmb", "__HV_", "e__HV_"],
    )
    dwarf_rows = load_dwarf_rows(ROOT / "data" / "dwarf_mw.csv")
    rows = normalize_table(table, source, dwarf_rows)
    assert len(rows) == 1
    assert rows[0]["object_key"] == "carina_1"
    assert abs(rows[0]["ra_deg"] - 100.57475) < 1e-4
    assert abs(rows[0]["dec_deg"] + 50.8995556) < 1e-4
    assert rows[0]["vlos_kms"] == 219.0
    assert rows[0]["membership_probability"] == 1.0


def test_normalize_nearest_object_assignment() -> None:
    """Test nearest-position object assignment during normalization.

    Returns
    -------
    None
        Assertions validate Carina II/III source assignment behavior.
    """
    source = next(source for source in KINEMATIC_SOURCES if source.name == "li2018_carina23")
    table = Table(
        rows=[("J073504.92-575646.9", 113.77049, -57.94636, 482.8, 3.38, 2)],
        names=["MagLiteS", "RAJ2000", "DEJ2000", "HRV", "e_HRV", "Mm"],
    )
    dwarf_rows = load_dwarf_rows(ROOT / "data" / "dwarf_mw.csv")
    rows = normalize_table(table, source, dwarf_rows)
    assert len(rows) == 1
    assert rows[0]["object_key"] == "carina_2"
    assert rows[0]["membership_flag"] == "2"


def test_direct_provider_source_url() -> None:
    """Test direct-provider source URL metadata.

    Returns
    -------
    None
        Assertions validate AAS/IOP provider configuration.
    """
    source = next(source for source in KINEMATIC_SOURCES if source.name == "ji2021_antlia2_aas_iop")
    assert source.provider == "aas_iop_mrt"
    assert source.table_format == "cds"
    assert source.url.startswith("https://content.cld.iop.org/")


def test_normalize_aas_iop_like_table() -> None:
    """Test normalization of an AAS/IOP MRT-like table.

    Returns
    -------
    None
        Assertions validate provider tagging and kinematic column mapping.
    """
    source = next(source for source in KINEMATIC_SOURCES if source.name == "bruce2023_aquarius2_aas_iop")
    table = Table(
        rows=[(2609060660860398208, 338.57394, -9.357, -65.3, 2.3, "M")],
        names=["Gaia", "RAdeg", "DEdeg", "Vhelio", "e_Vhelio", "Mem"],
    )
    dwarf_rows = load_dwarf_rows(ROOT / "data" / "dwarf_mw.csv")
    rows = normalize_table(table, source, dwarf_rows)
    assert len(rows) == 1
    assert rows[0]["object_key"] == "aquarius_2"
    assert rows[0]["source_provider"] == "aas_iop_mrt"
    assert rows[0]["vlos_kms"] == -65.3
    assert rows[0]["vlos_err_kms"] == 2.3


def test_normalize_source_filters_and_missing_values() -> None:
    """Test source-specific row filters and placeholder missing values.

    Returns
    -------
    None
        Assertions validate filtered rows and fallback column handling.
    """
    source = KinematicSource(
        name="synthetic_filtered_source",
        bibcode="Test2026ApJ...999....1T",
        source_id="synthetic",
        source_kind="spectroscopy",
        object_key="bootes_1",
        row_filters={"kind": "star"},
        row_min_values={"membership": 0.1},
        missing_values=("-999",),
        columns={
            "star_id": ["Gaia", "Object"],
            "ra_deg": "RAdeg",
            "dec_deg": "DEdeg",
            "vlos_kms": "HRV",
            "pmra_masyr": "pmRA",
            "membership_probability": "membership",
        },
    )
    table = Table(
        rows=[
            ("star", "-999", "Boo1_1", 210.0, 14.5, 101.0, "-999", 0.2),
            ("star", "1234567890123456789", "Boo1_2", 210.1, 14.6, 102.0, 0.2, 0.01),
            ("galaxy", "1234567890123456789", "BG_1", 210.2, 14.7, 0.1, 0.2, 0.9),
        ],
        names=["kind", "Gaia", "Object", "RAdeg", "DEdeg", "HRV", "pmRA", "membership"],
    )
    dwarf_rows = load_dwarf_rows(ROOT / "data" / "dwarf_mw.csv")
    rows = normalize_table(table, source, dwarf_rows)
    assert len(rows) == 1
    assert rows[0]["star_id"] == "Boo1_1"
    assert rows[0]["vlos_kms"] == 101.0
    assert rows[0]["pmra_masyr"] is None
    assert rows[0]["membership_probability"] == 0.2


def test_read_commented_header_table() -> None:
    """Test parsing of space-delimited commented-header provider tables.

    Returns
    -------
    None
        Assertions validate the Pace/Zenodo-style table parser.
    """
    payload = b"# source_id ra dec mem_fixed\n1234567890123456789 210.0 14.5 0.2\n"
    table = read_table_payload(payload, "commented_header")
    assert len(table) == 1
    assert table["source_id"][0] == 1234567890123456789
    assert table["mem_fixed"][0] == 0.2


def test_pace2022_zenodo_source_registered() -> None:
    """Test Pace et al. 2022 Zenodo source configuration.

    Returns
    -------
    None
        Assertions validate the non-VizieR archive provider registration.
    """
    source = next(source for source in KINEMATIC_SOURCES if source.name == "pace2022_dwarf_spheroidal_gaia_edr3_zenodo")
    assert source.provider == "zenodo_zip"
    assert source.table_format == "commented_header"
    assert source.archive_members["bootes_1"] == "share_v2/catalogs/bootes_1.dat"
    assert source.row_min_values == {"mem_fixed": 0.1}


def test_extract_gaia_source_ids_from_normalized_row() -> None:
    """Test Gaia source-id extraction from normalized and raw fields.

    Returns
    -------
    None
        Assertions validate direct and embedded Gaia identifiers.
    """
    row = {
        "star_id": "5430123686295270528",
        "original_row_json": '{"SimbadName": "Gaia DR2 2908277352901612544", "source_id": 5430123686295270528}',
    }
    assert gaia_source_ids_from_normalized_row(row) == [
        "5430123686295270528",
        "2908277352901612544",
    ]


def test_normalize_gaia_dr3_rows() -> None:
    """Test Gaia DR3 rows are normalized as proper-motion rows.

    Returns
    -------
    None
        Assertions validate Gaia metadata and proper-motion columns.
    """
    target = GaiaKinematicTarget(
        object_key="antlia_2",
        object_name="Antlia II",
        source_id="5430123686295270528",
        seed_source_name="ji2021_antlia2",
        seed_source_ref="Ji2021ApJ...921...32J",
        seed_source_row="0",
        seed_membership_probability="1",
        seed_membership_flag="M",
    )
    rows = normalize_gaia_dr3_rows(
        [target],
        {
            "5430123686295270528": {
                "source_id": 5430123686295270528,
                "ra": 142.53357,
                "dec": -37.9144,
                "pmra": 0.88,
                "pmra_error": 0.1,
                "pmdec": 1.683,
                "pmdec_error": 0.2,
            }
        },
    )
    assert len(rows) == 1
    assert rows[0]["source_name"] == GAIA_DR3_SOURCE_NAME
    assert rows[0]["source_provider"] == "gaia_tap"
    assert rows[0]["source_kind"] == "proper_motion"
    assert rows[0]["pmra_masyr"] == 0.88
    assert rows[0]["pmdec_err_masyr"] == 0.2
    assert rows[0]["membership_flag"] == "M"


if __name__ == "__main__":
    test_guess_vizier_source_id()
    test_reference_manifest_marks_registered_sources()
    test_normalize_walker_like_table()
    test_normalize_nearest_object_assignment()
    test_direct_provider_source_url()
    test_normalize_aas_iop_like_table()
    test_normalize_source_filters_and_missing_values()
    test_read_commented_header_table()
    test_pace2022_zenodo_source_registered()
    test_extract_gaia_source_ids_from_normalized_row()
    test_normalize_gaia_dr3_rows()
    print("kinematics fetcher smoke tests passed")
