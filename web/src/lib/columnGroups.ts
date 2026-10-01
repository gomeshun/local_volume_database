export const SCIENCE_GROUPS = ["Identity & provenance", "Position & distance", "Structure & luminosity", "Velocity & proper motion", "Metallicity & age", "Membership", "Other"];

export function scienceGroup(column: string): string {
  const key = column.replace(/^ref_/, "").replace(/_(em|ep|ul|err|origin)$/, "");
  if (/membership/.test(key)) return "Membership";
  if (/^(ra|dec|ll|bb|distance|parallax)(_|$)/.test(key)) return "Position & distance";
  if (/vlos|pmra|pmdec|velocity|proper_motion/.test(key)) return "Velocity & proper motion";
  if (/metallicity|feh|age|alpha/.test(key)) return "Metallicity & age";
  if (/structure|photometry|rhalf|rcore|rking|sersic|ellipticity|position_angle|magnitude|M_V|m_v|surface_brightness|mass|flux|luminosity/.test(key)) return "Structure & luminosity";
  if (/^(name|key|star_id|gaia_source_id|record_id|object|source|host|ref|discovery|notes|type|confirmed)/.test(key)) return "Identity & provenance";
  return "Other";
}

export function presetColumns(columns: string[], preset: string, defaults: string[]): string[] {
  if (preset === "All") return columns;
  if (preset === "Basic") return columns.filter((column) => defaults.includes(column));
  const groups = preset === "Spectroscopy" ? ["Velocity & proper motion", "Metallicity & age", "Membership"] : preset === "Proper motion" ? ["Position & distance", "Membership"] : [preset];
  return columns.filter((column) => ["name", "key", "star_id", "source_name", "source_ref"].includes(column) || (preset === "Proper motion" && /pmra|pmdec|proper_motion/.test(column)) || (groups.includes(scienceGroup(column)) && (preset !== "Spectroscopy" || !/pmra|pmdec/.test(column))));
}
