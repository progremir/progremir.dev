// Reveals, the nav's current section, day and night, and the sky over Almaty.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const html = document.documentElement;
html.classList.add("ready");

// Hero intro once the font is in, so nothing reflows mid animation. The land joins it
// once land.js has painted the first view; after 5s the rest goes on without it.
Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]).then(() =>
  requestAnimationFrame(() => html.classList.add("intro"))
);
setTimeout(() => html.classList.add("drawn"), 5000);

// Sections rise in once as they enter the viewport, children 80ms apart in reading order.
const groups = $$("[data-group]");
const seen = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      seen.unobserve(e.target);
    }
  },
  { threshold: 0.2 }
);
for (const g of groups) {
  $$("[data-reveal]", g).forEach((n, i) => n.style.setProperty("--d", `${i * 80}ms`));
  seen.observe(g);
}

// Nav: mark the section under the top 40% of the viewport as current. A clicked
// link stays marked until the reader scrolls on their own, since the page may be
// too short to bring its section all the way up. Only on the page the links point into.
const navLinks = $$(".nav a");
const marks = navLinks.map((a) => a.getAttribute("href").startsWith("#") && $(a.hash));
const spy = marks.every(Boolean);
let current = 0;
let pinned = -1;
let ticking = false;
function frame() {
  ticking = false;
  if (!spy) return;
  const vh = innerHeight;
  let idx = 0;
  marks.forEach((m, i) => { if (m.getBoundingClientRect().top <= vh * 0.4) idx = i; });
  if (vh + scrollY >= html.scrollHeight - 2) idx = marks.length - 1;
  if (pinned >= 0) idx = pinned;
  if (idx !== current) {
    navLinks[current].removeAttribute("aria-current");
    navLinks[idx].setAttribute("aria-current", "true");
    current = idx;
  }
}
function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(frame);
  }
}
if (spy) {
  navLinks.forEach((a, i) => a.addEventListener("click", () => { pinned = i; frame(); }));
  for (const type of ["wheel", "touchstart", "keydown"]) {
    addEventListener(type, () => { pinned = -1; onScroll(); }, { passive: true });
  }
  addEventListener("scroll", onScroll, { passive: true });
  frame();
}

// Day and night. The theme is the device's, unless the visitor picks the other with the
// toggle; the pick is kept until they pick the device's again. When it turns, style.css
// fades the page through dusk or dawn, the sun sets as the moon rises (or the other way
// round), and land.js paints the land again in the new ink.
const device = matchMedia("(prefers-color-scheme: light)");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const toggle = $(".theme");
const bars = $$('meta[name="theme-color"]').map((m) => [m, m.media.includes("light") ? "light" : "dark"]);
const deviceTheme = () => (device.matches ? "light" : "dark");
const isDay = () => html.dataset.theme === "light";
function picked() {
  try { return localStorage.getItem("theme"); } catch { return null; }
}
function show(theme) {
  html.dataset.theme = theme;
  toggle?.setAttribute("aria-pressed", String(theme === "dark"));
  for (const [m, t] of bars) m.media = t === theme ? "all" : "not all"; // the browser's bar
}
function turn(theme) {
  if (theme === html.dataset.theme) return;
  show(theme);
  turnSky();
}
show(html.dataset.theme || deviceTheme());
if (toggle) {
  toggle.addEventListener("click", () => {
    const theme = isDay() ? "dark" : "light";
    try {
      if (theme === deviceTheme()) localStorage.removeItem("theme");
      else localStorage.setItem("theme", theme);
    } catch {}
    turn(theme);
  });
  toggle.hidden = false;
}
device.addEventListener("change", () => { if (!picked()) turn(deviceTheme()); });

// Sky. Low precision positions (better than a degree), plenty for a drawing.
const RAD = Math.PI / 180;
const LAT = 43.25 * RAD; // Almaty
const LON = 76.94;
const OBL = 23.4397 * RAD;
const EAST = 75, WEST = 285; // the sun and moon cross the whole width, east on the left
const HORIZON = 0.3; // share of the land's height where the far crests meet the sky

function horizontal(ra, dec, lst) {
  const h = lst - ra;
  const alt = Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(h));
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(LAT) - Math.tan(dec) * Math.cos(LAT)) + Math.PI;
  return { alt: alt / RAD, az: az / RAD };
}

function skyAt(t) {
  const d = t / 86400000 - 10957.5; // days since J2000
  const lst = (280.16 + 360.9856235 * d + LON) * RAD;
  const m = (357.5291 + 0.98560028 * d) * RAD;
  const ls = m + (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m) + 282.9372) * RAD;
  const sun = horizontal(Math.atan2(Math.sin(ls) * Math.cos(OBL), Math.cos(ls)), Math.asin(Math.sin(ls) * Math.sin(OBL)), lst);
  const lm = (218.316 + 13.176396 * d + 6.289 * Math.sin((134.963 + 13.064993 * d) * RAD)) * RAD;
  const bm = 5.128 * Math.sin((93.272 + 13.22935 * d) * RAD) * RAD;
  const moon = horizontal(
    Math.atan2(Math.sin(lm) * Math.cos(OBL) - Math.tan(bm) * Math.sin(OBL), Math.cos(lm)),
    Math.asin(Math.sin(bm) * Math.cos(OBL) + Math.cos(bm) * Math.sin(OBL) * Math.sin(lm)),
    lst
  );
  moon.lit = (1 - Math.cos(bm) * Math.cos(lm - ls)) / 2;
  moon.waxing = Math.sin(lm - ls) > 0;
  return { sun, moon };
}

// Lit part of the moon, in a 12 unit box: the bright limb plus the terminator ellipse.
function moonPath(k, waxing) {
  const rx = (Math.abs(1 - 2 * k) * 6).toFixed(2);
  const term = (k < 0.5) === waxing ? 0 : 1;
  return `M6 0A6 6 0 0 ${waxing ? 1 : 0} 6 12A${rx} 6 0 0 ${term} 6 0Z`;
}

const stage = $(".sky-stage");
const orb = $("#orb");
const disc = $(".orb-disc");
const orbLit = $("#orb-lit");
const clock = $("#clock");

// The paper theme has the sun and the night theme the moon. Each is where it really is
// over Almaty while it's up, and rests here while it's below the horizon.
const REST = { sun: { az: 215, alt: 24 }, moon: { az: 135, alt: 30 } };

// The sun or moon, behind the land: it sets behind the far crests, and peaks hide it for
// a while as they pass.
function placeSky() {
  const now = Date.now();
  const local = new Date(now + 5 * 3600000); // Almaty, UTC+5
  clock.textContent = clock.dateTime =
    String(local.getUTCHours()).padStart(2, "0") + ":" + String(local.getUTCMinutes()).padStart(2, "0");

  const { sun, moon } = skyAt(now);
  const day = isDay();
  const real = day ? sun : moon;
  const body = real.alt > -1 ? real : day ? REST.sun : REST.moon;
  orb.classList.toggle("moon", !day);
  // The moon's phase, but never thinner than a clear crescent, so there is a moon to see
  if (!day) orbLit.setAttribute("d", moonPath(Math.max(0.25, moon.lit), moon.waxing));

  // Low bodies climb quickly, so even a winter sun clears the peaks at noon. Up high,
  // the halo stays clear of the top edge.
  const s = stage.getBoundingClientRect();
  const top = s.height * HORIZON;
  const high = Math.min(top, orb.offsetHeight * 0.4);
  const x = ((body.az - EAST) / (WEST - EAST)) * s.width;
  const y = top - (top - high) * Math.pow(Math.max(0, body.alt) / 90, 0.45) - Math.min(0, body.alt) * 4;
  orb.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  orb.classList.add("on");
}

// When the theme turns, the sun or moon sinks behind the land, and the other rises in its
// place. Turned again on the way down, whichever the theme has by then comes up.
let setting = null;
let rising = null;
function turnSky() {
  if (!orb || setting) return;
  if (still.matches) return placeSky();
  const low = { transform: `translateY(${(stage.clientHeight * 0.18).toFixed(1)}px)`, opacity: 0 };
  const { transform, opacity } = getComputedStyle(disc);
  rising?.cancel();
  const set = disc.animate([{ transform, opacity }, low], { duration: 600, easing: "cubic-bezier(0.55, 0, 0.75, 0.3)", fill: "forwards" });
  setting = set;
  set.onfinish = () => {
    setting = null;
    placeSky();
    rising = disc.animate([{ offset: 0, ...low }], { duration: 1000, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    set.cancel();
  };
}
if (orb) {
  placeSky();
  setInterval(placeSky, 30000);
  // Rest the halo while the sky is off screen.
  new IntersectionObserver(([e]) => orb.classList.toggle("paused", !e.isIntersecting)).observe(stage);
}
addEventListener("resize", () => requestAnimationFrame(() => { if (orb) placeSky(); frame(); }));

for (const n of $$("[data-year]")) n.textContent = new Date().getFullYear();
