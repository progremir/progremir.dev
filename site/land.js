// The land under the sky: an endless ink scroll, painted a tile at a time by ink.js in
// workers and panned by the compositor. The scroll runs with the clock, so every visitor
// sees the same stretch of it at the same moment.
(() => {
  const land = document.getElementById("land");
  if (!land) return;
  const html = document.documentElement;
  if (!("OffscreenCanvas" in self)) {
    html.classList.add("no-land");
    return;
  }

  const TW = 800, H = 600; // tile width and land height in world units, as in ink.js
  const SPEED = 20; // world units a second
  const RUN = 64 * TW; // one animation's length; then it starts over from where it is
  const EPOCH = Date.UTC(2026, 0, 1);
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const dark = matchMedia("(prefers-color-scheme: dark)");
  // The ink, paper and tree tone come from style.css, so the land matches the page
  const read = () => {
    const css = getComputedStyle(land);
    const get = (name) => css.getPropertyValue(name).trim();
    return { ink: get("--land-ink"), paper: get("--land-paper"), leaf: parseFloat(get("--land-leaf")) || 1 };
  };
  let look = read();
  // Two painters when the device has the cores for it, taking alternate tiles
  const workers = Array.from({ length: (navigator.hardwareConcurrency || 2) > 3 ? 2 : 1 }, () => new Worker("/ink.js"));

  // One canvas holds the tiles side by side, so no seams show between them. It rides on
  // a strip the compositor pans, and steps one tile along whenever a tile has passed.
  const strip = document.createElement("div");
  strip.className = "land-strip";
  const view = document.createElement("canvas");
  const ctx = view.getContext("2d");
  strip.append(view);
  land.append(strip);

  const painted = new Set(); // tiles in the canvas, painted in this pass
  const pending = new Set(); // tiles asked for in this pass
  let dpr = 0;
  let px = 0; // tile width in device pixels, whole so that tiles meet exactly
  let scale = 0; // CSS px per world unit
  let first = 0; // tile at the canvas's left edge
  let slots = 0; // tiles the canvas holds
  let base = (SPEED * (Date.now() - EPOCH)) / 1000; // world x of the strip's origin
  let anim = null;
  let pass = 0; // bumped when the size or theme changes, so late paintings are dropped
  let seen = true;

  // World x at the left edge of the land right now
  const at = () => base + (anim ? ((anim.currentTime || 0) / 1000) * SPEED : 0);
  // Tiles that can be in view at once
  const span = () => Math.ceil(land.clientWidth / (TW * scale)) + 1;
  const place = () => (view.style.left = `${(first * TW - base) * scale}px`);

  function request(k) {
    pending.add(k);
    workers[k % workers.length].postMessage({ k, s: px / TW, look, id: pass });
  }

  // Once every tile in view is in, or painting has failed, the intro goes on
  const done = () => html.classList.add("drawn");
  function ready() {
    const x = at();
    for (let k = Math.floor(x / TW); k * TW < x + land.clientWidth / scale; k++) if (!painted.has(k)) return false;
    return true;
  }

  function receive({ data: { k, id, bitmap } }) {
    if (id === pass) {
      pending.delete(k);
      if (k >= first && k < first + slots) {
        painted.add(k);
        ctx.clearRect((k - first) * px, 0, px, view.height);
        ctx.drawImage(bitmap, (k - first) * px, 0, px, view.height);
        if (ready()) done();
      }
    }
    bitmap.close();
  }
  for (const w of workers) {
    w.onmessage = receive;
    w.onerror = () => {
      html.classList.add("no-land");
      done();
    };
  }

  // Step the canvas along once a tile has passed, and keep the tiles ahead painted
  function fill() {
    const k0 = Math.floor(at() / TW);
    const d = k0 - first;
    if (d) {
      const w = view.width - d * px;
      if (d > 0 && w > 0) {
        // Copy, not draw over: the tiles leave the sky clear, and the old ones would show through
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(view, d * px, 0, w, view.height, 0, 0, w, view.height);
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(w, 0, view.width - w, view.height);
        for (const k of painted) if (k < k0) painted.delete(k);
      } else {
        ctx.clearRect(0, 0, view.width, view.height);
        painted.clear();
      }
      first = k0;
      place();
    }
    const want = anim ? slots : span();
    for (let k = first; k < first + want; k++) if (!painted.has(k) && !pending.has(k)) request(k);
  }

  // Start the pan over from where it is now
  function run() {
    base = at();
    anim?.cancel();
    anim = null;
    place();
    if (!still.matches) {
      anim = strip.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(${-RUN * scale}px)` }],
        { duration: (RUN / SPEED) * 1000, easing: "linear", fill: "forwards" }
      );
      anim.onfinish = run;
      sync();
    }
    fill();
  }

  function sync() {
    if (!anim) return;
    if (seen && !document.hidden) anim.play();
    else anim.pause();
  }

  // Fit the canvas to the land. What is shown stays, stretched if the size changed,
  // until fresh paintings come in.
  function measure() {
    const h = land.clientHeight;
    if (!h) return;
    const d = Math.min(2, devicePixelRatio || 1);
    const p = Math.round((TW * h * d) / H);
    base = at();
    anim?.cancel();
    anim = null;
    const old = px ? new OffscreenCanvas(view.width, view.height) : null;
    old?.getContext("2d").drawImage(view, 0, 0);
    const [oldPx, oldFirst] = [px, first];
    if (p !== px || d !== dpr) {
      dpr = d;
      px = p;
      scale = px / dpr / TW;
      pass++;
      pending.clear();
      painted.clear();
    }
    first = Math.floor(base / TW);
    slots = span() + 1;
    view.width = slots * px;
    view.height = Math.round(h * dpr);
    view.style.width = `${(slots * px) / dpr}px`;
    if (old) ctx.drawImage(old, (oldFirst - first) * px, 0, (old.width * px) / oldPx, view.height);
    for (const k of painted) if (k < first || k >= first + slots) painted.delete(k);
    run();
  }

  measure();
  let timer = 0;
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(measure, 150);
  });
  still.addEventListener("change", run);
  dark.addEventListener("change", () => {
    look = read();
    pass++;
    pending.clear();
    painted.clear();
    fill();
  });
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting;
    sync();
  }).observe(land);
  document.addEventListener("visibilitychange", sync);
  setInterval(() => anim?.playState === "running" && fill(), 500);
})();
