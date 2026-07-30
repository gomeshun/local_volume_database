# Member-star kinematics products

This directory is the working area for per-record kinematic data associated
with objects in `data/dwarf_mw.csv`.

- `raw/` contains cached provider responses.
- `processed/` contains normalized CSV products.
- `manifest/` contains reproducible source-coverage and discovery reports.

The generated web application consumes only the public normalized columns from
`processed/dwarf_mw_kinematics.csv`. Raw payloads and `original_row_json` are
never copied into `web/public/`.

Membership values carry explicit origin columns:

- `reported`: present on that provider row.
- `same_star`: filled from another row only when every reported value for the
  same source, LVDB object, and star identifier agrees.
- `seed_source`: copied onto a Gaia DR3 row from the normalized input record
  that supplied the Gaia source ID.

Blank membership remains unknown and must not be interpreted as non-membership.

Run the tools from the repository root with the project `uv` environment:

```bash
uv sync
uv run python scripts/fetch_kinematics_data.py manifest
uv run python scripts/fetch_kinematics_data.py list-sources
uv run python scripts/fetch_kinematics_data.py fetch --source ji2021_antlia2 --max-rows 20
uv run python scripts/fetch_kinematics_data.py fetch --provider aas_iop_mrt --output-dir data_kinematics/processed/aas_iop_mrt
uv run python scripts/fetch_kinematics_data.py fetch-gaia
```

Remote fetches are rate-limited and reuse the ignored `raw/` cache.
