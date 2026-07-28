import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ASSET_MARKER = "/* __PRECACHE_ASSETS__ */ '/'";
const VERSION_MARKER = '__PRECACHE_VERSION__';
const ASSET_REFERENCE =
  /(?:\.\.?\/|\/)([a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:css|ico|js|png|svg|webmanifest|webp))/g;
const TEXT_ASSET = /\.(?:css|html|js|webmanifest)$/;

export function extractAssetFilenames(source: string): string[] {
  return Array.from(source.matchAll(ASSET_REFERENCE), (match) => match[1]);
}

async function discoverAssetFilenames(
  outputDirectory: string
): Promise<string[]> {
  const discovered = new Set(['index.html']);
  const toScan = ['index.html'];

  while (toScan.length > 0) {
    const filename = toScan.shift()!;
    const source = await readFile(resolve(outputDirectory, filename), 'utf8');
    for (const reference of extractAssetFilenames(source)) {
      if (reference === 'sw.js' || discovered.has(reference)) continue;
      discovered.add(reference);
      if (TEXT_ASSET.test(reference)) toScan.push(reference);
    }
  }

  return Array.from(discovered);
}

export function renderServiceWorker(
  template: string,
  assetFilenames: readonly string[],
  assetVersion?: string
): string {
  if (!template.includes(ASSET_MARKER) || !template.includes(VERSION_MARKER)) {
    throw new Error('Service worker template is missing precache markers');
  }

  const urls = [
    '/',
    ...assetFilenames
      .filter((filename) => filename !== 'index.html' && filename !== 'sw.js')
      .sort()
      .map((filename) => `/${filename}`),
  ];
  const manifest = urls.map((url) => JSON.stringify(url)).join(',\n  ');
  const version =
    assetVersion ??
    createHash('sha256').update(manifest).digest('hex').slice(0, 12);

  return template
    .replace(ASSET_MARKER, manifest)
    .replace(VERSION_MARKER, version);
}

async function fingerprintAssets(
  outputDirectory: string,
  assetFilenames: readonly string[]
): Promise<string> {
  const hash = createHash('sha256');
  for (const filename of [...assetFilenames].sort()) {
    hash.update(filename);
    hash.update(await readFile(resolve(outputDirectory, filename)));
  }
  return hash.digest('hex').slice(0, 12);
}

async function main() {
  const outputDirectory = resolve(process.argv[2] ?? 'dist');
  const assetFilenames = await discoverAssetFilenames(outputDirectory);
  const assetVersion = await fingerprintAssets(outputDirectory, assetFilenames);
  const template = await readFile(resolve('src/sw.js'), 'utf8');
  const serviceWorker = renderServiceWorker(
    template,
    assetFilenames,
    assetVersion
  );

  await writeFile(resolve(outputDirectory, 'sw.js'), serviceWorker);
  console.log(
    `Generated service worker precache for ${assetFilenames.length} resources`
  );
}

if (import.meta.main) {
  await main();
}
