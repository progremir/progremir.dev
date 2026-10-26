# progremir.dev

Plain static site in `site/`. No build step.

- `index.html`, `style.css`, `main.js`: the page
- `404.html`: served for unknown paths
- `fonts/geist.woff2`: Geist, subset to Latin and weights 400 to 600 (SIL OFL, see `fonts/OFL.txt`)
- `og.png`, `favicon.svg`, `apple-touch-icon.png`: sharing image and icons

## The skyline

The ridge in the hero is the real horizon seen from Republic Square in Almaty,
looking south, traced from SRTM elevation data (AWS Terrain Tiles). The sun or
the moon is drawn at its actual position for the current time, computed in the
browser. To trace the ridge again, for example from another viewpoint:

```sh
pip install numpy pillow
python3 scripts/skyline.py
```

Then paste the three printed paths into `site/index.html` and `site/404.html`.

## Run locally

```sh
npx serve site
```

## Deploy (Cloudflare Workers, static assets)

```sh
npx wrangler login     # once
npx wrangler deploy
```

`wrangler.jsonc` serves the `site/` folder as is.
