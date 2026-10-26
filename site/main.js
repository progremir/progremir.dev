// Reveals, the nav's current section, and the sky over Almaty.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const html = document.documentElement;
html.classList.add("ready");

// Hero intro once the font is in, so nothing reflows mid animation.
Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]).then(() =>
  requestAnimationFrame(() => html.classList.add("intro"))
);

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
// too short to bring its section all the way up.
const navLinks = $$(".nav a");
const marks = navLinks.map((a) => $(a.hash));
let current = 0;
let pinned = -1;
navLinks.forEach((a, i) => a.addEventListener("click", () => { pinned = i; frame(); }));
for (const type of ["wheel", "touchstart", "keydown"]) {
  addEventListener(type, () => { pinned = -1; onScroll(); }, { passive: true });
}

let ticking = false;
function frame() {
  ticking = false;
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
addEventListener("scroll", onScroll, { passive: true });
frame();

// Sky. Low precision positions (better than a degree), plenty for a drawing.
const RAD = Math.PI / 180;
const LAT = 43.25 * RAD; // Almaty
const LON = 76.94;
const OBL = 23.4397 * RAD;
const EAST = 75, WEST = 285; // the sun and moon cross the whole width, east on the left

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

// Lit part of a 12px moon: the bright limb plus the terminator ellipse.
function moonPath(k, waxing) {
  const rx = (Math.abs(1 - 2 * k) * 6).toFixed(2);
  const term = (k < 0.5) === waxing ? 0 : 1;
  return `M6 0A6 6 0 0 ${waxing ? 1 : 0} 6 12A${rx} 6 0 0 ${term} 6 0Z`;
}

const stage = $(".sky-stage");
const ridge = $(".layer svg");
const orb = $("#orb");
const orbLit = $("#orb-lit");
const clock = $("#clock");
const SUN = orbLit.getAttribute("d");
// The ridge viewBox spans elevation angles from TOP down to BOTTOM (y is minus the angle).
const view = ridge.viewBox.baseVal;
const TOP = -view.y;
const BOTTOM = -(view.y + view.height);

function placeSky() {
  const now = Date.now();
  const local = new Date(now + 5 * 3600000); // Almaty, UTC+5
  clock.textContent = clock.dateTime =
    String(local.getUTCHours()).padStart(2, "0") + ":" + String(local.getUTCMinutes()).padStart(2, "0");

  const { sun, moon } = skyAt(now);
  const body = sun.alt > BOTTOM ? sun : moon.alt > BOTTOM ? moon : null;
  orb.classList.toggle("on", !!body);
  if (!body) return;
  orb.classList.toggle("moon", body === moon);
  orbLit.setAttribute("d", body === moon ? moonPath(moon.lit, moon.waxing) : SUN);

  // Same vertical scale as the ridge while low, so it rises and sets behind the peaks.
  // Higher up, TOP to 90° is eased into the sky, stopping 24px short of its top.
  const s = stage.getBoundingClientRect();
  const b = ridge.getBoundingClientRect();
  const top = b.top - s.top;
  const x = ((body.az - EAST) / (WEST - EAST)) * s.width;
  const y = body.alt <= TOP
    ? top + ((TOP - body.alt) * b.height) / (TOP - BOTTOM)
    : top - (top - 24) * Math.sin((((body.alt - TOP) / (90 - TOP)) * Math.PI) / 2);
  orb.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}
placeSky();
setInterval(placeSky, 30000);
addEventListener("resize", () => requestAnimationFrame(() => { placeSky(); frame(); }));

// Rest the pulse while the sky is off screen.
new IntersectionObserver(([e]) => orb.classList.toggle("paused", !e.isIntersecting)).observe(stage);

for (const n of $$("[data-year]")) n.textContent = new Date().getFullYear();
