# Member-star kinematics fetch outputs

This directory is the default workspace for scripts that fetch per-star kinematic data for objects in `data/dwarf_mw.csv`.

- `raw/` stores cached provider responses. It is ignored by git so repeated runs do not hit remote services unnecessarily.
- `processed/` stores normalized CSV products. Each row uses a common schema with position, line-of-sight velocity, proper motion when available, membership information, source provider, source reference, source URL, and the original row serialized as JSON.
- `manifest/` stores generated coverage/discovery reports. These files are ignored by git because they are reproducible from the scripts.

Typical commands from the repository root:

```bash
.venv/bin/python scripts/fetch_kinematics_data.py manifest
.venv/bin/python scripts/fetch_kinematics_data.py list-sources
.venv/bin/python scripts/fetch_kinematics_data.py fetch --source ji2021_antlia2 --max-rows 20
.venv/bin/python scripts/fetch_kinematics_data.py fetch --provider aas_iop_mrt --output-dir data_kinematics/processed/aas_iop_mrt
```

The fetch command spaces remote requests by default and reuses the `raw/` cache on later runs.
