from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
from typing import Any, Mapping, Sequence, cast

import numpy.ma as ma
from astropy import units as u
from astropy.coordinates import Angle, SkyCoord
from astropy.io import ascii
from astropy.table import Row, Table


STANDARD_COLUMNS = [
    "object_key",
    "object_name",
    "source_kind",
    "source_provider",
    "source_ref",
    "source_name",
    "source_table",
    "source_url",
    "source_row",
    "star_id",
    "ra_deg",
    "dec_deg",
    "vlos_kms",
    "vlos_err_kms",
    "pmra_masyr",
    "pmra_err_masyr",
    "pmdec_masyr",
    "pmdec_err_masyr",
    "membership_probability",
    "membership_flag",
    "feh",
    "feh_err",
    "original_row_json",
]

GAIA_DR3_TAP_URL = "https://gea.esac.esa.int/tap-server/tap/sync"
GAIA_DR3_SOURCE_REF = "GaiaCollaboration2023A&A...674A...1G"
GAIA_DR3_SOURCE_NAME = "gaia_dr3_source"
GAIA_DR3_SOURCE_TABLE = "gaiadr3.gaia_source"
GAIA_SOURCE_ID_RE = re.compile(r"(?<!\d)(\d{16,20})(?!\d)")


@dataclass(frozen=True)
class GaiaKinematicTarget:
    """Gaia source attached to one normalized LVDB member-star row.

    Parameters
    ----------
    object_key : str
        LVDB object key associated with the member-star row.
    object_name : str
        Human-readable LVDB object name.
    source_id : str
        Gaia DR2/EDR3/DR3 source identifier to query in Gaia DR3.
    seed_source_name : str
        Normalized source table that supplied the source identifier.
    seed_source_ref : str
        Reference for the source table that supplied the source identifier.
    seed_source_row : str
        Row number in the source table that supplied the source identifier.
    seed_membership_probability : str
        Membership probability from the source row, when available.
    seed_membership_flag : str
        Membership flag from the source row, when available.
    """

    object_key: str
    object_name: str
    source_id: str
    seed_source_name: str = ""
    seed_source_ref: str = ""
    seed_source_row: str = ""
    seed_membership_probability: str = ""
    seed_membership_flag: str = ""


@dataclass(frozen=True)
class KinematicSource:
    """Published table metadata for the kinematics normalizer.

    Parameters
    ----------
    name : str
        Stable registry name used by the command-line interface.
    bibcode : str
        ADS bibcode for the source paper.
    source_id : str
        Provider-specific table identifier.
    source_kind : str
        Type of source table, such as ``"spectroscopy"`` or
        ``"proper_motion"``.
    columns : Mapping[str, str or Sequence[str]]
        Mapping from standard output column names to provider table columns.
    provider : str, optional
        Data provider name. The default is ``"vizier"``.
    data_url : str, optional
        Direct download URL for non-VizieR providers.
    table_format : str, optional
        Astropy-readable table format key handled by :func:`read_table_payload`.
    query_constraints : Mapping[str, str], optional
        VizieR query constraints to apply when fetching this table.
    object_key : str, optional
        Fixed LVDB object key for all rows in the table.
    object_key_column : str, optional
        Column used to infer the LVDB object key.
    object_key_map : Mapping[str, str], optional
        Exact value to LVDB object key mapping.
    object_key_prefix_map : Mapping[str, str], optional
        Prefix to LVDB object key mapping.
    nearest_object_keys : Sequence[str], optional
        Candidate LVDB object keys for nearest-position assignment.
    nearest_max_sep_deg : float, optional
        Maximum allowed angular separation for nearest-position assignment.
    membership_probability_scale : float, optional
        Factor applied to membership probabilities after reading.
    notes : str, optional
        Human-readable notes about the source table.
    """

    name: str
    bibcode: str
    source_id: str
    source_kind: str
    columns: Mapping[str, str | Sequence[str]]
    provider: str = "vizier"
    data_url: str | None = None
    table_format: str = "votable"
    query_constraints: Mapping[str, str] = field(default_factory=dict)
    object_key: str | None = None
    object_key_column: str | None = None
    object_key_map: Mapping[str, str] = field(default_factory=dict)
    object_key_prefix_map: Mapping[str, str] = field(default_factory=dict)
    nearest_object_keys: Sequence[str] = field(default_factory=tuple)
    nearest_max_sep_deg: float = 2.0
    membership_probability_scale: float = 1.0
    notes: str = ""

    @property
    def url(self) -> str:
        """Return the download URL for this source.

        Returns
        -------
        str
            Direct provider URL when configured, otherwise a VizieR VOTable
            query URL.
        """
        if self.data_url:
            return self.data_url
        return vizier_votable_url(self.source_id, constraints=self.query_constraints)


class VizierClient:
    """Small remote table client with a project-local raw cache.

    Parameters
    ----------
    cache_dir : pathlib.Path
        Directory where raw provider responses are cached.
    min_interval_s : float, optional
        Minimum delay between remote requests.
    user_agent : str, optional
        User-Agent header sent with remote requests.
    """

    def __init__(
        self,
        cache_dir: Path,
        min_interval_s: float = 3.2,
        user_agent: str = "local_volume_database kinematics fetcher",
    ) -> None:
        """Initialize the cached remote table client.

        Parameters
        ----------
        cache_dir : pathlib.Path
            Directory where raw provider responses are cached.
        min_interval_s : float, optional
            Minimum delay between remote requests.
        user_agent : str, optional
            User-Agent header sent with remote requests.
        """
        self.cache_dir = Path(cache_dir)
        self.min_interval_s = min_interval_s
        self.user_agent = user_agent
        self._last_request_at = 0.0

    def fetch_votable(
        self,
        source_id: str,
        max_rows: int | None = None,
        force: bool = False,
        constraints: Mapping[str, str] | None = None,
    ) -> bytes:
        """Fetch a VizieR source table as VOTable bytes.

        Parameters
        ----------
        source_id : str
            VizieR source identifier.
        max_rows : int, optional
            Maximum number of rows to request.
        force : bool, optional
            Re-download even when a cached response exists.
        constraints : Mapping[str, str], optional
            Additional VizieR query constraints.

        Returns
        -------
        bytes
            Raw VOTable response payload.
        """
        cache_file = self._cache_file(source_id, "votable", "vot", max_rows=max_rows, constraints=constraints)
        if cache_file.exists() and not force:
            return cache_file.read_bytes()

        url = vizier_votable_url(source_id, max_rows=max_rows, constraints=constraints)
        payload = self._download(url)
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_bytes(payload)
        return payload

    def fetch_asu_tsv(self, source_id: str, max_rows: int | None = 10, force: bool = False) -> str:
        """Fetch a VizieR source table through the ASU-TSV endpoint.

        Parameters
        ----------
        source_id : str
            VizieR source identifier.
        max_rows : int, optional
            Maximum number of rows to request.
        force : bool, optional
            Re-download even when a cached response exists.

        Returns
        -------
        str
            Decoded ASU-TSV response text.
        """
        cache_file = self._cache_file(source_id, "asu-tsv", "tsv", max_rows=max_rows)
        if cache_file.exists() and not force:
            return cache_file.read_text(encoding="utf-8")

        url = vizier_asu_tsv_url(source_id, max_rows=max_rows)
        payload = self._download(url)
        text = payload.decode("utf-8", "replace")
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(text, encoding="utf-8")
        return text

    def fetch_url_bytes(
        self,
        url: str,
        endpoint: str,
        suffix: str,
        cache_key: str | None = None,
        force: bool = False,
    ) -> bytes:
        """Fetch a direct provider URL as bytes with local caching.

        Parameters
        ----------
        url : str
            Direct URL to download.
        endpoint : str
            Provider or endpoint name used in the cache path.
        suffix : str
            File suffix for the cached payload.
        cache_key : str, optional
            Stable cache filename stem.
        force : bool, optional
            Re-download even when a cached response exists.

        Returns
        -------
        bytes
            Raw response payload.
        """
        cache_file = self._url_cache_file(url, endpoint, suffix, cache_key=cache_key)
        if cache_file.exists() and not force:
            return cache_file.read_bytes()

        payload = self._download(url)
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_bytes(payload)
        return payload

    def _download(self, url: str) -> bytes:
        """Download a URL while respecting the configured request interval.

        Parameters
        ----------
        url : str
            URL to download.

        Returns
        -------
        bytes
            Raw response payload.
        """
        now = time.monotonic()
        wait_s = self.min_interval_s - (now - self._last_request_at)
        if wait_s > 0:
            time.sleep(wait_s)

        request = urllib.request.Request(url, headers={"User-Agent": self.user_agent})
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = response.read()
        self._last_request_at = time.monotonic()
        return payload

    def _cache_file(
        self,
        source_id: str,
        endpoint: str,
        suffix: str,
        max_rows: int | None = None,
        constraints: Mapping[str, str] | None = None,
    ) -> Path:
        """Build a cache path for VizieR endpoint responses.

        Parameters
        ----------
        source_id : str
            VizieR source identifier.
        endpoint : str
            Endpoint name used in the cache path.
        suffix : str
            File suffix for the cached payload.
        max_rows : int, optional
            Row limit included in the cache key.
        constraints : Mapping[str, str], optional
            Query constraints included in the cache key.

        Returns
        -------
        pathlib.Path
            Cache file path.
        """
        row_part = "all" if max_rows is None else str(max_rows)
        constraint_part = ""
        if constraints:
            encoded = "__".join(f"{key}-{value}" for key, value in sorted(constraints.items()))
            constraint_part = f"__{encoded}"
        safe = safe_filename(f"{source_id}{constraint_part}__max-{row_part}.{suffix}")
        return self.cache_dir / endpoint / safe

    def _url_cache_file(self, url: str, endpoint: str, suffix: str, cache_key: str | None = None) -> Path:
        """Build a cache path for direct URL responses.

        Parameters
        ----------
        url : str
            Direct provider URL.
        endpoint : str
            Provider or endpoint name used in the cache path.
        suffix : str
            File suffix for the cached payload.
        cache_key : str, optional
            Stable cache filename stem.

        Returns
        -------
        pathlib.Path
            Cache file path.
        """
        digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
        stem = safe_filename(cache_key or url)[:120]
        return self.cache_dir / endpoint / f"{stem}__{digest}.{suffix}"


class GaiaTapClient:
    """Cached Gaia Archive TAP client for Gaia DR3 source rows.

    Parameters
    ----------
    cache_dir : pathlib.Path
        Directory where raw TAP VOTable responses are cached.
    min_interval_s : float, optional
        Minimum delay between remote TAP requests.
    user_agent : str, optional
        User-Agent header sent with remote requests.
    """

    def __init__(
        self,
        cache_dir: Path,
        min_interval_s: float = 3.2,
        user_agent: str = "local_volume_database Gaia TAP fetcher",
    ) -> None:
        """Initialize the cached Gaia TAP client.

        Parameters
        ----------
        cache_dir : pathlib.Path
            Directory where raw TAP VOTable responses are cached.
        min_interval_s : float, optional
            Minimum delay between remote TAP requests.
        user_agent : str, optional
            User-Agent header sent with remote requests.
        """
        self.cache_dir = Path(cache_dir)
        self.min_interval_s = min_interval_s
        self.user_agent = user_agent
        self._last_request_at = 0.0

    def fetch_source_rows(self, source_ids: Sequence[str], force: bool = False) -> Table:
        """Fetch Gaia DR3 rows for source identifiers.

        Parameters
        ----------
        source_ids : Sequence[str]
            Gaia source identifiers to query.
        force : bool, optional
            Re-download even when a cached response exists.

        Returns
        -------
        astropy.table.Table
            Gaia DR3 rows returned by the TAP service.
        """
        normalized_ids = sorted({str(source_id).strip() for source_id in source_ids if str(source_id).strip()})
        cache_file = self._cache_file(normalized_ids)
        if cache_file.exists() and not force:
            payload = cache_file.read_bytes()
        else:
            payload = self._download_query(gaia_dr3_source_query(normalized_ids))
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            cache_file.write_bytes(payload)
        return Table.read(BytesIO(payload), format="votable")

    def _download_query(self, query: str) -> bytes:
        """Post an ADQL query to the Gaia TAP sync endpoint.

        Parameters
        ----------
        query : str
            ADQL query string.

        Returns
        -------
        bytes
            Raw VOTable response payload.
        """
        now = time.monotonic()
        wait_s = self.min_interval_s - (now - self._last_request_at)
        if wait_s > 0:
            time.sleep(wait_s)

        body = urllib.parse.urlencode(
            {
                "REQUEST": "doQuery",
                "LANG": "ADQL",
                "FORMAT": "votable",
                "QUERY": query,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            GAIA_DR3_TAP_URL,
            data=body,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": self.user_agent,
            },
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read()
        self._last_request_at = time.monotonic()
        return payload

    def _cache_file(self, source_ids: Sequence[str]) -> Path:
        """Build a cache path for a Gaia DR3 source-id batch.

        Parameters
        ----------
        source_ids : Sequence[str]
            Gaia source identifiers included in the batch.

        Returns
        -------
        pathlib.Path
            Cache file path.
        """
        joined_ids = ",".join(source_ids)
        digest = hashlib.sha1(joined_ids.encode("utf-8")).hexdigest()[:16]
        first_id = source_ids[0] if source_ids else "empty"
        return self.cache_dir / "gaia_tap" / f"gaia_dr3_source__{len(source_ids)}__{first_id}__{digest}.vot"


def repo_root() -> Path:
    """Return the repository root used by the LVDB package.

    Returns
    -------
    pathlib.Path
        Repository root, preferring the ``LVDBDIR`` environment variable.
    """
    env_path = os.environ.get("LVDBDIR")
    if env_path:
        return Path(env_path).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def load_dwarf_rows(csv_path: Path | None = None) -> list[dict[str, str]]:
    """Load dwarf galaxy rows from the LVDB CSV table.

    Parameters
    ----------
    csv_path : pathlib.Path, optional
        CSV path to load. Defaults to ``data/dwarf_mw.csv``.

    Returns
    -------
    list of dict[str, str]
        Rows from the dwarf table.
    """
    path = csv_path or repo_root() / "data" / "dwarf_mw.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def build_reference_manifest(
    dwarf_rows: Sequence[Mapping[str, str]],
    sources: Sequence[KinematicSource],
) -> list[dict[str, str]]:
    """Build a manifest of kinematic references and registered sources.

    Parameters
    ----------
    dwarf_rows : Sequence[Mapping[str, str]]
        Rows from ``data/dwarf_mw.csv``.
    sources : Sequence[KinematicSource]
        Registered source definitions.

    Returns
    -------
    list of dict[str, str]
        Manifest rows indicating which references have registered fetchers.
    """
    by_ref = sources_by_ref(sources)
    manifest: list[dict[str, str]] = []
    for row in dwarf_rows:
        for column_name, source_kind in (
            ("ref_vlos", "spectroscopy"),
            ("ref_proper_motion", "proper_motion"),
        ):
            bibcode = str(row.get(column_name, "")).strip()
            if not bibcode:
                continue
            registered = by_ref.get(bibcode, [])
            manifest.append(
                {
                    "object_key": str(row.get("key", "")),
                    "object_name": str(row.get("name", "")),
                    "reference_column": column_name,
                    "source_kind": source_kind,
                    "bibcode": bibcode,
                    "registered_source_names": ";".join(source.name for source in registered),
                    "registered_source_providers": ";".join(source.provider for source in registered),
                    "registered_source_ids": ";".join(source.source_id for source in registered),
                    "registered": "1" if registered else "0",
                }
            )
    return manifest


def write_reference_manifest(rows: Sequence[Mapping[str, str]], output_path: Path) -> None:
    """Write a reference manifest CSV.

    Parameters
    ----------
    rows : Sequence[Mapping[str, str]]
        Manifest rows from :func:`build_reference_manifest`.
    output_path : pathlib.Path
        Destination CSV path.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "object_key",
        "object_name",
        "reference_column",
        "source_kind",
        "bibcode",
        "registered_source_names",
        "registered_source_providers",
        "registered_source_ids",
        "registered",
    ]
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def fetch_registered_sources(
    sources: Sequence[KinematicSource],
    dwarf_rows: Sequence[Mapping[str, str]],
    cache_dir: Path,
    output_dir: Path,
    source_names: Sequence[str] | None = None,
    providers: Sequence[str] | None = None,
    object_keys: Sequence[str] | None = None,
    max_rows: int | None = None,
    force: bool = False,
    min_interval_s: float = 3.2,
) -> list[dict[str, Any]]:
    """Fetch registered source tables and write normalized outputs.

    Parameters
    ----------
    sources : Sequence[KinematicSource]
        Candidate source definitions.
    dwarf_rows : Sequence[Mapping[str, str]]
        Rows from ``data/dwarf_mw.csv``.
    cache_dir : pathlib.Path
        Directory used for raw response caching.
    output_dir : pathlib.Path
        Directory where normalized CSV products are written.
    source_names : Sequence[str], optional
        Source names to include.
    providers : Sequence[str], optional
        Provider names to include.
    object_keys : Sequence[str], optional
        LVDB object keys to keep in the normalized output.
    max_rows : int, optional
        Maximum number of rows to fetch or keep per source table.
    force : bool, optional
        Re-download raw provider payloads even when cached.
    min_interval_s : float, optional
        Minimum delay between remote requests.

    Returns
    -------
    list of dict[str, Any]
        Normalized kinematics rows.
    """
    selected_sources = filter_sources(sources, source_names=source_names, providers=providers)
    selected_object_keys = set(object_keys or [])
    client = VizierClient(cache_dir=cache_dir, min_interval_s=min_interval_s)
    normalized_rows: list[dict[str, Any]] = []

    for source in selected_sources:
        table = fetch_source_table(client, source, max_rows=max_rows, force=force)
        rows = normalize_table(table, source, dwarf_rows)
        if selected_object_keys:
            rows = [row for row in rows if row["object_key"] in selected_object_keys]
        normalized_rows.extend(rows)

    write_kinematics_outputs(normalized_rows, output_dir)
    return normalized_rows


def fetch_gaia_dr3_proper_motions(
    input_csv: Path,
    cache_dir: Path,
    output_dir: Path,
    force: bool = False,
    batch_size: int = 400,
    min_interval_s: float = 3.2,
    merge_combined: bool = True,
) -> list[dict[str, Any]]:
    """Fetch Gaia DR3 astrometry for member stars with Gaia source IDs.

    Parameters
    ----------
    input_csv : pathlib.Path
        Existing normalized kinematics CSV used as the source of Gaia IDs.
    cache_dir : pathlib.Path
        Directory used for raw Gaia TAP response caching.
    output_dir : pathlib.Path
        Directory where normalized CSV products are written.
    force : bool, optional
        Re-download raw Gaia TAP payloads even when cached.
    batch_size : int, optional
        Number of Gaia source IDs per TAP query.
    min_interval_s : float, optional
        Minimum delay between TAP requests.
    merge_combined : bool, optional
        Append Gaia rows to the combined kinematics output when ``True``.

    Returns
    -------
    list of dict[str, Any]
        Normalized Gaia DR3 proper-motion rows.
    """
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")

    existing_rows = read_kinematics_csv(input_csv)
    targets = extract_gaia_targets(existing_rows)
    gaia_rows_by_id = fetch_gaia_dr3_source_rows(
        [target.source_id for target in targets],
        cache_dir=cache_dir,
        batch_size=batch_size,
        force=force,
        min_interval_s=min_interval_s,
    )
    gaia_rows = normalize_gaia_dr3_rows(targets, gaia_rows_by_id)

    output_dir.mkdir(parents=True, exist_ok=True)
    write_standard_csv(gaia_rows, output_dir / "gaia_dr3_proper_motion.csv")

    if merge_combined:
        base_rows = [
            row
            for row in existing_rows
            if not (row.get("source_provider") == "gaia_tap" and row.get("source_name") == GAIA_DR3_SOURCE_NAME)
        ]
        write_kinematics_outputs([*base_rows, *gaia_rows], output_dir)

    return gaia_rows


def read_kinematics_csv(csv_path: Path) -> list[dict[str, str]]:
    """Read a normalized kinematics CSV file.

    Parameters
    ----------
    csv_path : pathlib.Path
        CSV path to read.

    Returns
    -------
    list of dict[str, str]
        Kinematics rows with string values.
    """
    with csv_path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def extract_gaia_targets(rows: Sequence[Mapping[str, str]]) -> list[GaiaKinematicTarget]:
    """Extract unique Gaia source targets from normalized kinematics rows.

    Parameters
    ----------
    rows : Sequence[Mapping[str, str]]
        Normalized member-star kinematics rows.

    Returns
    -------
    list of GaiaKinematicTarget
        Unique Gaia source IDs grouped by LVDB object.
    """
    targets_by_key: dict[tuple[str, str], GaiaKinematicTarget] = {}
    for index, row in enumerate(rows):
        object_key = str(row.get("object_key", "")).strip()
        if not object_key:
            continue
        object_name = str(row.get("object_name", object_key)).strip() or object_key
        for source_id in gaia_source_ids_from_normalized_row(row):
            target_key = (object_key, source_id)
            if target_key in targets_by_key:
                continue
            targets_by_key[target_key] = GaiaKinematicTarget(
                object_key=object_key,
                object_name=object_name,
                source_id=source_id,
                seed_source_name=str(row.get("source_name", "")).strip(),
                seed_source_ref=str(row.get("source_ref", "")).strip(),
                seed_source_row=str(row.get("source_row", index)).strip(),
                seed_membership_probability=str(row.get("membership_probability", "")).strip(),
                seed_membership_flag=str(row.get("membership_flag", "")).strip(),
            )
    return sorted(targets_by_key.values(), key=lambda target: (target.object_key, int(target.source_id)))


def gaia_source_ids_from_normalized_row(row: Mapping[str, str]) -> list[str]:
    """Extract Gaia source identifiers from one normalized row.

    Parameters
    ----------
    row : Mapping[str, str]
        Normalized kinematics row, optionally including ``original_row_json``.

    Returns
    -------
    list of str
        Gaia-like numeric source identifiers in stable discovery order.
    """
    candidates: list[str] = []
    candidates.extend(gaia_source_ids_from_value(row.get("star_id", "")))

    original_row_json = str(row.get("original_row_json", "")).strip()
    if original_row_json:
        try:
            original_row = json.loads(original_row_json)
        except json.JSONDecodeError:
            original_row = {}
        if isinstance(original_row, Mapping):
            for key, value in original_row.items():
                normalized_key = re.sub(r"[^a-z0-9]", "", str(key).lower())
                value_text = str(value)
                if "gaia" in normalized_key or normalized_key in {"sourceid", "source_id"}:
                    candidates.extend(gaia_source_ids_from_value(value))
                elif isinstance(value, str) and "gaia" in value_text.lower():
                    candidates.extend(gaia_source_ids_from_value(value_text))

    return unique_preserving_order(candidates)


def gaia_source_ids_from_value(value: Any) -> list[str]:
    """Extract Gaia-like numeric source identifiers from a value.

    Parameters
    ----------
    value : Any
        Scalar value or string that may contain a Gaia source identifier.

    Returns
    -------
    list of str
        Numeric identifiers with 16 to 20 digits.
    """
    if value is None:
        return []
    if isinstance(value, float) and math.isnan(value):
        return []
    scalar_value = cast(Any, value)
    if hasattr(scalar_value, "item"):
        scalar_value = scalar_value.item()
    text = str(scalar_value).strip()
    if not text:
        return []
    return GAIA_SOURCE_ID_RE.findall(text)


def unique_preserving_order(values: Sequence[str]) -> list[str]:
    """Deduplicate strings while preserving first-seen order.

    Parameters
    ----------
    values : Sequence[str]
        Input string values.

    Returns
    -------
    list of str
        Deduplicated values.
    """
    seen: set[str] = set()
    output: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        output.append(value)
    return output


def fetch_gaia_dr3_source_rows(
    source_ids: Sequence[str],
    cache_dir: Path,
    batch_size: int = 400,
    force: bool = False,
    min_interval_s: float = 3.2,
) -> dict[str, dict[str, Any]]:
    """Fetch Gaia DR3 source rows and return them by source ID.

    Parameters
    ----------
    source_ids : Sequence[str]
        Gaia source identifiers to query.
    cache_dir : pathlib.Path
        Directory used for raw TAP response caching.
    batch_size : int, optional
        Number of source IDs per TAP query.
    force : bool, optional
        Re-download raw TAP payloads even when cached.
    min_interval_s : float, optional
        Minimum delay between TAP requests.

    Returns
    -------
    dict[str, dict[str, Any]]
        Gaia DR3 rows indexed by source ID.
    """
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    source_id_list = sorted({str(source_id).strip() for source_id in source_ids if str(source_id).strip()}, key=int)
    client = GaiaTapClient(cache_dir=cache_dir, min_interval_s=min_interval_s)
    rows_by_id: dict[str, dict[str, Any]] = {}
    for start in range(0, len(source_id_list), batch_size):
        batch = source_id_list[start : start + batch_size]
        if not batch:
            continue
        table = client.fetch_source_rows(batch, force=force)
        for gaia_row in cast(Sequence[Row], table):
            row_dict = row_to_jsonable_dict(gaia_row)
            source_id = str(row_dict.get("source_id") or row_dict.get("SOURCE_ID") or "").strip()
            if source_id:
                rows_by_id[source_id] = row_dict
    return rows_by_id


def normalize_gaia_dr3_rows(
    targets: Sequence[GaiaKinematicTarget],
    gaia_rows_by_id: Mapping[str, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Normalize Gaia DR3 source rows into the kinematics schema.

    Parameters
    ----------
    targets : Sequence[GaiaKinematicTarget]
        Gaia source IDs grouped by LVDB object.
    gaia_rows_by_id : Mapping[str, Mapping[str, Any]]
        Gaia DR3 rows indexed by source ID.

    Returns
    -------
    list of dict[str, Any]
        Normalized proper-motion rows.
    """
    normalized_rows: list[dict[str, Any]] = []
    for index, target in enumerate(targets):
        gaia_row = gaia_rows_by_id.get(target.source_id)
        if not gaia_row:
            continue
        original_payload = {
            "gaia_dr3": dict(gaia_row),
            "seed_source_name": target.seed_source_name,
            "seed_source_ref": target.seed_source_ref,
            "seed_source_row": target.seed_source_row,
        }
        normalized_rows.append(
            {
                "object_key": target.object_key,
                "object_name": target.object_name,
                "source_kind": "proper_motion",
                "source_provider": "gaia_tap",
                "source_ref": GAIA_DR3_SOURCE_REF,
                "source_name": GAIA_DR3_SOURCE_NAME,
                "source_table": GAIA_DR3_SOURCE_TABLE,
                "source_url": "https://gea.esac.esa.int/archive/",
                "source_row": index,
                "star_id": target.source_id,
                "ra_deg": float_from_mapping(gaia_row, "ra"),
                "dec_deg": float_from_mapping(gaia_row, "dec"),
                "vlos_kms": None,
                "vlos_err_kms": None,
                "pmra_masyr": float_from_mapping(gaia_row, "pmra"),
                "pmra_err_masyr": float_from_mapping(gaia_row, "pmra_error"),
                "pmdec_masyr": float_from_mapping(gaia_row, "pmdec"),
                "pmdec_err_masyr": float_from_mapping(gaia_row, "pmdec_error"),
                "membership_probability": string_or_none(target.seed_membership_probability),
                "membership_flag": string_or_none(target.seed_membership_flag),
                "feh": None,
                "feh_err": None,
                "original_row_json": json.dumps(original_payload, sort_keys=True, ensure_ascii=True),
            }
        )
    return normalized_rows


def filter_sources(
    sources: Sequence[KinematicSource],
    source_names: Sequence[str] | None = None,
    providers: Sequence[str] | None = None,
) -> list[KinematicSource]:
    """Filter source definitions by registry name and provider.

    Parameters
    ----------
    sources : Sequence[KinematicSource]
        Candidate source definitions.
    source_names : Sequence[str], optional
        Source names to include.
    providers : Sequence[str], optional
        Provider names to include.

    Returns
    -------
    list of KinematicSource
        Selected source definitions.

    Raises
    ------
    ValueError
        If any requested source name is not registered.
    """
    selected = list(sources)
    if source_names:
        selected_names = set(source_names)
        selected = [source for source in selected if source.name in selected_names]
        missing = selected_names - {source.name for source in selected}
        if missing:
            raise ValueError(f"Unknown kinematics source name(s): {', '.join(sorted(missing))}")
    if providers:
        selected_providers = set(providers)
        selected = [source for source in selected if source.provider in selected_providers]
    return selected


def fetch_source_table(
    client: VizierClient,
    source: KinematicSource,
    max_rows: int | None = None,
    force: bool = False,
) -> Table:
    """Fetch and parse one registered source table.

    Parameters
    ----------
    client : VizierClient
        Cached remote table client.
    source : KinematicSource
        Source definition to fetch.
    max_rows : int, optional
        Maximum number of rows to fetch or keep.
    force : bool, optional
        Re-download raw provider payloads even when cached.

    Returns
    -------
    astropy.table.Table
        Parsed provider table.

    Raises
    ------
    ValueError
        If a non-VizieR source is missing a direct data URL.
    """
    if source.provider == "vizier":
        payload = client.fetch_votable(
            source.source_id,
            max_rows=max_rows,
            force=force,
            constraints=source.query_constraints,
        )
        return Table.read(BytesIO(payload), format="votable")

    if not source.data_url:
        raise ValueError(f"Non-VizieR source {source.name} is missing data_url")

    suffix = "txt" if source.table_format == "cds" else source.table_format
    payload = client.fetch_url_bytes(
        source.data_url,
        endpoint=source.provider,
        suffix=suffix,
        cache_key=source.source_id,
        force=force,
    )
    table = read_table_payload(payload, source.table_format)
    if max_rows is not None:
        return cast(Table, table[:max_rows])
    return table


def read_table_payload(payload: bytes, table_format: str) -> Table:
    """Read raw provider bytes into an Astropy table.

    Parameters
    ----------
    payload : bytes
        Raw provider response payload.
    table_format : str
        Supported table format key, such as ``"votable"`` or ``"cds"``.

    Returns
    -------
    astropy.table.Table
        Parsed table.

    Raises
    ------
    ValueError
        If ``table_format`` is not supported.
    """
    if table_format == "votable":
        return Table.read(BytesIO(payload), format="votable")
    if table_format == "cds":
        text = payload.decode("utf-8", "replace")
        return cast(Table, ascii.read(text.splitlines(), format="cds"))
    raise ValueError(f"Unsupported kinematics table format: {table_format}")


def normalize_table(
    table: Table,
    source: KinematicSource,
    dwarf_rows: Sequence[Mapping[str, str]],
) -> list[dict[str, Any]]:
    """Normalize a provider table into the common kinematics schema.

    Parameters
    ----------
    table : astropy.table.Table
        Provider table to normalize.
    source : KinematicSource
        Source definition containing column mappings.
    dwarf_rows : Sequence[Mapping[str, str]]
        Rows from ``data/dwarf_mw.csv``.

    Returns
    -------
    list of dict[str, Any]
        Normalized rows using ``STANDARD_COLUMNS`` keys where available.
    """
    dwarf_by_key = {str(row["key"]): row for row in dwarf_rows}
    normalized: list[dict[str, Any]] = []
    for index, row in enumerate(cast(Sequence[Row], table)):
        object_key = resolve_object_key(row, source, dwarf_by_key)
        if not object_key:
            continue
        object_name = str(dwarf_by_key.get(object_key, {}).get("name", object_key))
        membership_probability = get_float(row, source.columns.get("membership_probability"))
        if membership_probability is not None:
            membership_probability *= source.membership_probability_scale

        normalized.append(
            {
                "object_key": object_key,
                "object_name": object_name,
                "source_kind": source.source_kind,
                "source_provider": source.provider,
                "source_ref": source.bibcode,
                "source_name": source.name,
                "source_table": source.source_id,
                "source_url": source.url,
                "source_row": index,
                "star_id": get_string(row, source.columns.get("star_id")),
                "ra_deg": get_angle_deg(row, source.columns.get("ra_deg"), is_ra=True),
                "dec_deg": get_angle_deg(row, source.columns.get("dec_deg"), is_ra=False),
                "vlos_kms": get_float(row, source.columns.get("vlos_kms")),
                "vlos_err_kms": get_float(row, source.columns.get("vlos_err_kms")),
                "pmra_masyr": get_float(row, source.columns.get("pmra_masyr")),
                "pmra_err_masyr": get_float(row, source.columns.get("pmra_err_masyr")),
                "pmdec_masyr": get_float(row, source.columns.get("pmdec_masyr")),
                "pmdec_err_masyr": get_float(row, source.columns.get("pmdec_err_masyr")),
                "membership_probability": membership_probability,
                "membership_flag": get_string(row, source.columns.get("membership_flag")),
                "feh": get_float(row, source.columns.get("feh")),
                "feh_err": get_float(row, source.columns.get("feh_err")),
                "original_row_json": json.dumps(row_to_jsonable_dict(row), sort_keys=True, ensure_ascii=True),
            }
        )
    return normalized


def write_kinematics_outputs(rows: Sequence[Mapping[str, Any]], output_dir: Path) -> None:
    """Write combined and per-object normalized CSV products.

    Parameters
    ----------
    rows : Sequence[Mapping[str, Any]]
        Normalized kinematics rows.
    output_dir : pathlib.Path
        Destination directory for CSV products.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    combined_path = output_dir / "dwarf_mw_kinematics.csv"
    write_standard_csv(rows, combined_path)

    grouped: dict[tuple[str, str], list[Mapping[str, Any]]] = {}
    for row in rows:
        grouped.setdefault((str(row["object_key"]), str(row["source_kind"])), []).append(row)
    for (object_key, source_kind), grouped_rows in grouped.items():
        write_standard_csv(grouped_rows, output_dir / f"{object_key}_{source_kind}.csv")


def write_standard_csv(rows: Sequence[Mapping[str, Any]], output_path: Path) -> None:
    """Write normalized rows using the standard CSV column order.

    Parameters
    ----------
    rows : Sequence[Mapping[str, Any]]
        Normalized kinematics rows.
    output_path : pathlib.Path
        Destination CSV path.
    """
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=STANDARD_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: csv_value(row.get(key)) for key in STANDARD_COLUMNS})


def resolve_object_key(
    row: Row,
    source: KinematicSource,
    dwarf_by_key: Mapping[str, Mapping[str, str]],
) -> str | None:
    """Resolve the LVDB object key for one provider row.

    Parameters
    ----------
    row : astropy.table.Row
        Provider table row.
    source : KinematicSource
        Source definition containing object assignment rules.
    dwarf_by_key : Mapping[str, Mapping[str, str]]
        Dwarf rows indexed by LVDB object key.

    Returns
    -------
    str or None
        LVDB object key, or ``None`` if no assignment can be made.
    """
    if source.object_key:
        return source.object_key

    if source.object_key_column:
        raw_value = get_string(row, source.object_key_column)
        if raw_value:
            if raw_value in source.object_key_map:
                return source.object_key_map[raw_value]
            for prefix, object_key in source.object_key_prefix_map.items():
                if raw_value.startswith(prefix):
                    return object_key

    if source.nearest_object_keys:
        ra_deg = get_angle_deg(row, source.columns.get("ra_deg"), is_ra=True)
        dec_deg = get_angle_deg(row, source.columns.get("dec_deg"), is_ra=False)
        if ra_deg is None or dec_deg is None:
            return None
        source_coord = SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg)
        best_key = None
        best_sep = math.inf
        for object_key in source.nearest_object_keys:
            dwarf = dwarf_by_key.get(object_key)
            if not dwarf:
                continue
            dwarf_coord = SkyCoord(ra=float(dwarf["ra"]) * u.deg, dec=float(dwarf["dec"]) * u.deg)
            separation = float(cast(Any, source_coord.separation(dwarf_coord).deg))
            if separation < best_sep:
                best_key = object_key
                best_sep = separation
        if best_key and best_sep <= source.nearest_max_sep_deg:
            return best_key
    return None


def get_value(row: Row, columns: str | Sequence[str] | None) -> Any:
    """Return the first non-missing value from candidate columns.

    Parameters
    ----------
    row : astropy.table.Row
        Provider table row.
    columns : str or Sequence[str], optional
        Candidate column name or names.

    Returns
    -------
    Any
        First non-missing value, or ``None`` if no candidate is available.
    """
    if not columns:
        return None
    colnames = [columns] if isinstance(columns, str) else list(columns)
    for column in colnames:
        if column not in row.colnames:
            continue
        value = row[column]
        if is_missing(value):
            continue
        return value
    return None


def get_string(row: Row, columns: str | Sequence[str] | None) -> str | None:
    """Return a provider row value as a stripped string.

    Parameters
    ----------
    row : astropy.table.Row
        Provider table row.
    columns : str or Sequence[str], optional
        Candidate column name or names.

    Returns
    -------
    str or None
        String value, or ``None`` when unavailable.
    """
    value = get_value(row, columns)
    if value is None:
        return None
    if isinstance(value, bytes):
        value = value.decode("utf-8", "replace")
    text = str(value).strip()
    return text or None


def get_float(row: Row, columns: str | Sequence[str] | None) -> float | None:
    """Return a provider row value as a finite float.

    Parameters
    ----------
    row : astropy.table.Row
        Provider table row.
    columns : str or Sequence[str], optional
        Candidate column name or names.

    Returns
    -------
    float or None
        Float value, or ``None`` when unavailable or non-numeric.
    """
    value = get_value(row, columns)
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result):
        return None
    return result


def get_angle_deg(row: Row, columns: str | Sequence[str] | None, is_ra: bool) -> float | None:
    """Return an angle value in decimal degrees.

    Parameters
    ----------
    row : astropy.table.Row
        Provider table row.
    columns : str or Sequence[str], optional
        Candidate column name or names.
    is_ra : bool
        Interpret sexagesimal strings as right ascension when ``True``.

    Returns
    -------
    float or None
        Angle in degrees, or ``None`` when unavailable or unparsable.
    """
    value = get_value(row, columns)
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        pass

    text = str(value).strip()
    if not text:
        return None
    unit = u.hourangle if is_ra else u.deg
    try:
        return float(cast(Any, Angle(text, unit=unit).degree))
    except Exception:
        return None


def is_missing(value: Any) -> bool:
    """Return whether a provider value should be treated as missing.

    Parameters
    ----------
    value : Any
        Provider value to inspect.

    Returns
    -------
    bool
        ``True`` when the value is masked, empty, NaN, or a placeholder.
    """
    if value is None:
        return True
    if ma.is_masked(value):
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    text = str(value).strip()
    return text in {"", "--", "nan", "None"}


def row_to_jsonable_dict(row: Row) -> dict[str, Any]:
    """Convert an Astropy row to a JSON-serializable dictionary.

    Parameters
    ----------
    row : astropy.table.Row
        Provider table row.

    Returns
    -------
    dict[str, Any]
        Dictionary containing JSON-compatible row values.
    """
    return {column: jsonable_value(row[column]) for column in row.colnames}


def jsonable_value(value: Any) -> Any:
    """Convert a provider value to a JSON-compatible scalar.

    Parameters
    ----------
    value : Any
        Provider value to convert.

    Returns
    -------
    Any
        JSON-compatible scalar value, or ``None`` for missing values.
    """
    if is_missing(value):
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, bytes):
        return value.decode("utf-8", "replace")
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def float_from_mapping(row: Mapping[str, Any], key: str) -> float | None:
    """Return a finite float from a mapping value.

    Parameters
    ----------
    row : Mapping[str, Any]
        Mapping containing scalar values.
    key : str
        Value key to read.

    Returns
    -------
    float or None
        Finite float value, or ``None`` when unavailable.
    """
    value = row.get(key)
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(result):
        return None
    return result


def string_or_none(value: Any) -> str | None:
    """Return a stripped string or ``None`` for empty values.

    Parameters
    ----------
    value : Any
        Value to stringify.

    Returns
    -------
    str or None
        Stripped string, or ``None`` when empty.
    """
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def csv_value(value: Any) -> str:
    """Convert a normalized value to a CSV field string.

    Parameters
    ----------
    value : Any
        Normalized value to serialize.

    Returns
    -------
    str
        String representation suitable for CSV output.
    """
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return f"{value:.12g}"
    return str(value)


def vizier_votable_url(
    source_id: str,
    max_rows: int | None = None,
    constraints: Mapping[str, str] | None = None,
) -> str:
    """Build a VizieR VOTable query URL.

    Parameters
    ----------
    source_id : str
        VizieR source identifier.
    max_rows : int, optional
        Maximum number of rows to request.
    constraints : Mapping[str, str], optional
        Additional query constraints.

    Returns
    -------
    str
        Encoded VizieR VOTable URL.
    """
    params = {"-source": source_id, "-out.max": "unlimited" if max_rows is None else str(max_rows)}
    if constraints:
        params.update(constraints)
    return "https://vizier.cds.unistra.fr/viz-bin/votable?" + urllib.parse.urlencode(params)


def vizier_asu_tsv_url(source_id: str, max_rows: int | None = 10) -> str:
    """Build a VizieR ASU-TSV query URL.

    Parameters
    ----------
    source_id : str
        VizieR source identifier.
    max_rows : int, optional
        Maximum number of rows to request.

    Returns
    -------
    str
        Encoded VizieR ASU-TSV URL.
    """
    params = {"-source": source_id, "-out.max": "unlimited" if max_rows is None else str(max_rows)}
    return "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?" + urllib.parse.urlencode(params)


def gaia_dr3_source_query(source_ids: Sequence[str]) -> str:
    """Build an ADQL query for Gaia DR3 astrometry by source ID.

    Parameters
    ----------
    source_ids : Sequence[str]
        Gaia source identifiers.

    Returns
    -------
    str
        ADQL query string for ``gaiadr3.gaia_source``.
    """
    if not source_ids:
        raise ValueError("source_ids must not be empty")
    id_list = ",".join(str(int(source_id)) for source_id in source_ids)
    return (
        "SELECT source_id, ra, dec, parallax, parallax_error, "
        "pmra, pmra_error, pmdec, pmdec_error, "
        "phot_g_mean_mag, bp_rp, radial_velocity, radial_velocity_error, ruwe "
        f"FROM {GAIA_DR3_SOURCE_TABLE} "
        f"WHERE source_id IN ({id_list})"
    )


def guess_vizier_source_id(bibcode: str) -> str | None:
    """Infer a likely VizieR catalog identifier from an ADS bibcode.

    Parameters
    ----------
    bibcode : str
        ADS bibcode or LVDB reference string containing a bibcode.

    Returns
    -------
    str or None
        Guessed VizieR source identifier, or ``None`` if parsing fails.
    """
    first_digit = re.search(r"\d", bibcode)
    if not first_digit:
        return None
    bibcode = bibcode[first_digit.start() :]
    match = re.match(r"^(\d{4})(.{5})(.{4})(.)(.{4})(.)$", bibcode)
    if not match:
        return None
    journal = match.group(2).replace(".", "")
    volume = match.group(3).replace(".", "")
    qualifier = match.group(4).replace(".", "")
    page = match.group(5).replace(".", "")
    if not journal or not volume or not page:
        return None
    journal = {"A&A": "A+A"}.get(journal, journal)
    page_part = f"{qualifier}{page}" if qualifier else page
    return f"J/{journal}/{volume}/{page_part}"


def sources_by_ref(sources: Sequence[KinematicSource]) -> dict[str, list[KinematicSource]]:
    """Group source definitions by ADS bibcode.

    Parameters
    ----------
    sources : Sequence[KinematicSource]
        Source definitions to group.

    Returns
    -------
    dict[str, list[KinematicSource]]
        Source definitions indexed by bibcode.
    """
    by_ref: dict[str, list[KinematicSource]] = {}
    for source in sources:
        by_ref.setdefault(source.bibcode, []).append(source)
    return by_ref


def safe_filename(value: str) -> str:
    """Return a filesystem-safe filename stem.

    Parameters
    ----------
    value : str
        Raw filename or cache key.

    Returns
    -------
    str
        Sanitized filename stem containing alphanumerics, dots,
        underscores, and hyphens.
    """
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_")
