import { describe, expect, test } from 'bun:test';
import {
  extractAssetFilenames,
  renderServiceWorker,
} from './build-service-worker';

const TEMPLATE = `
const CACHE_NAME = 'luminary-__PRECACHE_VERSION__';
const PRECACHE_URLS = [/* __PRECACHE_ASSETS__ */ '/'];
`;

describe('build service worker', () => {
  test('generates a versioned manifest for every production asset', () => {
    const output = renderServiceWorker(
      TEMPLATE,
      ['sw.js', 'index.html', 'index-abc.js', 'index-def.css', 'ship.webp'],
      'build123'
    );

    expect(output).toContain("const CACHE_NAME = 'luminary-build123'");
    expect(output).not.toContain('__PRECACHE_VERSION__');
    expect(output).toContain('"/"');
    expect(output).toContain('"/index-abc.js"');
    expect(output).toContain('"/index-def.css"');
    expect(output).toContain('"/ship.webp"');
    expect(output).not.toContain('"/index.html"');
    expect(output).not.toContain('"/sw.js"');
  });

  test('rejects a template without the build markers', () => {
    expect(() => renderServiceWorker('const cache = [];', [])).toThrow(
      'missing precache markers'
    );
  });

  test('discovers root, relative, and parent-relative build references', () => {
    expect(
      extractAssetFilenames(`
        <link href="./index-abc.css">
        <img src="/web-app-manifest-192x192.png">
        new Worker(new URL("../combat-worker.js", import.meta.url));
      `)
    ).toEqual([
      'index-abc.css',
      'web-app-manifest-192x192.png',
      'combat-worker.js',
    ]);
  });
});
