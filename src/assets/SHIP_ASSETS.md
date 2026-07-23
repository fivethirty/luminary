# Ship tile and blueprint assets

The ship tile, blueprint, and upgrade images in this directory come from
[`AsyncEclipse/DiscordBot`](https://github.com/AsyncEclipse/DiscordBot), whose
repository is distributed under GPL-3.0.

The WebP files are display-sized derivatives: upgrade tiles are 128 × 128,
blueprints are at most 320 px high, and ship tiles retain their 256 × 256 source
dimensions. These sizes provide 2× density at their largest rendered dimensions.
They were encoded with `cwebp -m 6 -sharp_yuv`, using quality 82 for tiles and
quality 86 for blueprints.
