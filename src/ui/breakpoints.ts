export const VIEWPORT_BREAKPOINTS = {
  mobile: '40rem',
  tablet: '48rem',
  laptop: '64rem',
  extraLargeDesktop: '80rem',
} as const;

type ViewportBreakpoint = keyof typeof VIEWPORT_BREAKPOINTS;

export function viewportMaxWidthQuery(breakpoint: ViewportBreakpoint): string {
  return `(max-width: ${VIEWPORT_BREAKPOINTS[breakpoint]})`;
}
