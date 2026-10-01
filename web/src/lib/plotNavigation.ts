/** Resolve keyboard focus within the rendered sample without changing selection. */
export function activePlotPointIndex(
  pointIds: readonly string[],
  activeId: string | null,
  selectedId: string | null,
): number {
  const activeIndex = activeId === null ? -1 : pointIds.indexOf(activeId);
  if (activeIndex >= 0) return activeIndex;
  const selectedIndex = selectedId === null ? -1 : pointIds.indexOf(selectedId);
  return selectedIndex >= 0 ? selectedIndex : pointIds.length > 0 ? 0 : -1;
}

/** Arrow keys follow displayed sample order, rather than physical axis direction. */
export function nextPlotPointIndex(
  key: string,
  currentIndex: number,
  pointCount: number,
): number | null {
  if (pointCount === 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return Math.min(pointCount - 1, currentIndex + 1);
    case "ArrowLeft":
    case "ArrowUp":
      return Math.max(0, currentIndex - 1);
    case "Home":
      return 0;
    case "End":
      return pointCount - 1;
    default:
      return null;
  }
}
