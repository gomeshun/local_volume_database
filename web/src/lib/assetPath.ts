/**
 * Prefix a public asset path with the configured GitHub Pages base path.
 *
 * @param pathname - Root-relative path to a generated public asset.
 * @returns A path that works both locally and on GitHub project pages.
 */
export function assetPath(pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${normalized}`;
}
