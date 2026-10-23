# progremir.dev

Plain static site: `site/index.html`, `site/style.css`, `site/main.js`. No build step.

## Run locally

```sh
npx serve site
```

## Deploy (Cloudflare Workers, static assets)

```sh
npx wrangler login     # once
npx wrangler deploy
```

`wrangler.jsonc` serves the `site/` folder as-is.
