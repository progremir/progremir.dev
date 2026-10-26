# progremir.dev

Plain static site in `site/`. No build step.

- `index.html`, `style.css`, `main.js`: the page
- `land.js`, `ink.js`: the landscape in the hero
- `404.html`: served for unknown paths
- `fonts/eb-garamond.woff2`: EB Garamond, Latin, weights 400 to 500 (SIL OFL, see `fonts/OFL.txt`)
- `og.png`, `favicon.svg`, `apple-touch-icon.png`: sharing image and icons

## The landscape

The hero is an endless ink scroll of the Tian Shan around Almaty: snowy peaks
over spruce forest, foothills with wild apples, and the steppe with yurts,
horses, sheep and poplar rows. It is generated, never stored. `ink.js` paints it
in tiles inside web workers with the brush, blob and texture techniques of
[{Shan, Shui}*](https://github.com/LingDong-/shan-shui-inf) by Lingdong Huang
(MIT, notice kept in the file). `land.js` lines the tiles up on one canvas and
pans it slowly on the compositor. The scroll runs with the clock, so everyone
sees the same stretch at the same moment. The light theme has the sun in a pink
sunset sky and the dark theme the moon in a blue night one, each where it is over
Almaty while it's up, passing behind the peaks.

## Day and night

The theme follows the device until the visitor picks the other with the sun/moon
toggle at the end of the nav; the pick is kept in `localStorage` until they pick
the device's again. An inline script in the `<head>` sets `data-theme` on
`<html>` before the page shows. In `style.css` every colour is a mix along one
animated dial, `--day`, so turning the theme fades the whole page through dusk or
dawn: the sun sinks behind the peaks as the moon rises, and `land.js` repaints the
land in the new ink under a copy of the old one that fades out.

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
