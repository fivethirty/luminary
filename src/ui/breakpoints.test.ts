import { describe, expect, test } from 'bun:test';
import { VIEWPORT_BREAKPOINTS, viewportMaxWidthQuery } from '@ui/breakpoints';

const VIEWPORT_MEDIA_QUERY =
  /@media\s*\(\s*(?:(?:min|max)-width\s*:\s*|width\s*[<>]=?\s*)(\d+(?:\.\d+)?(?:px|r?em))/g;

describe('responsive breakpoints', () => {
  test('uses the four canonical viewport widths in every stylesheet', async () => {
    const widths = new Set<string>();

    for (const path of new Bun.Glob('src/**/*.css').scanSync('.')) {
      const css = await Bun.file(path).text();
      for (const match of css.matchAll(VIEWPORT_MEDIA_QUERY)) {
        widths.add(match[1]);
      }
    }

    expect([...widths].sort()).toEqual(
      Object.values(VIEWPORT_BREAKPOINTS).sort()
    );
  });

  test('builds runtime media queries from the shared scale', () => {
    expect(viewportMaxWidthQuery('tablet')).toBe('(max-width: 48rem)');
  });
});
