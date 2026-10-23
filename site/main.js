const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Clock (Almaty, UTC+5)
const clock = document.getElementById("clock");
function tick() {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  clock.textContent =
    String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
}
tick();
setInterval(tick, 30000);
document.getElementById("year").textContent = new Date().getFullYear();

// Typed name
const typed = document.getElementById("typed");
if (!reduceMotion) {
  const name = typed.textContent;
  typed.textContent = "";
  let i = 0;
  setTimeout(function type() {
    typed.textContent = name.slice(0, ++i);
    if (i < name.length) setTimeout(type, 45);
  }, 500);
}

// Dithered mountains
const canvas = document.getElementById("mountains");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const far = (x) => H * (0.56 + 0.11 * Math.sin(x * 0.021 + 1) + 0.07 * Math.sin(x * 0.057 + 2) + 0.025 * Math.sin(x * 0.15));
const near = (x) => H * (0.76 + 0.07 * Math.sin(x * 0.016 + 4) + 0.04 * Math.sin(x * 0.045) + 0.015 * Math.sin(x * 0.12 + 1));

function draw(t) {
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const sunX = W * 0.68, sunY = H * 0.4 + Math.sin(t * 0.0004) * 2, sunR = H * 0.15;
  const drift = t * 0.006;
  for (let x = 0; x < W; x++) {
    const r1 = far(x), r2 = near(x);
    const lit1 = far(x + 1) > r1;
    const lit2 = near(x + 1) > r2;
    for (let y = 0; y < H; y++) {
      const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      let lum = 0, red = 0;
      if (y > r2) {
        lum = 0.08 + (lit2 ? 0.16 : 0.02) + 0.06 * Math.sin(x * 0.3 + y * 0.2);
      } else if (y > r1) {
        const snow = r1 < H * 0.52 && y - r1 < (H * 0.52 - r1) * 0.9 + 2;
        lum = snow ? (lit1 ? 0.92 : 0.55) : (lit1 ? 0.38 : 0.2);
      } else {
        lum = 0.04 + 0.34 * Math.pow(y / r1, 2.2);
        const dx = x - sunX, dy = (y - sunY) * 1.1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        red = dist < sunR ? 1 : Math.max(0, 1 - (dist - sunR) / (sunR * 2.4)) * 0.6;
        const cx = x + drift;
        const band = Math.exp(-Math.pow((y - H * 0.24) / (H * 0.06), 2));
        const cl = band * (0.5 + 0.5 * Math.sin(cx * 0.045) * Math.sin(cx * 0.013 + y * 0.12));
        if (cl > 0.45) { lum = Math.max(lum, 0.35 + cl * 0.5); red *= 0.3; }
        const band2 = Math.exp(-Math.pow((y - H * 0.12) / (H * 0.04), 2));
        const cx2 = x + drift * 0.6 + 200;
        const cl2 = band2 * (0.5 + 0.5 * Math.sin(cx2 * 0.03) * Math.sin(cx2 * 0.011));
        if (cl2 > 0.5) lum = Math.max(lum, 0.3 + cl2 * 0.4);
        if (y < H * 0.2 && (x * 7919 + y * 104729) % 997 < 3) lum = Math.sin(t * 0.002 + x) > 0 ? 1 : 0.2;
      }
      const i = (y * W + x) * 4;
      let c = 10;
      if (red > th) { d[i] = 177; d[i + 1] = 18; d[i + 2] = 38; }
      else { c = lum > th ? 1 : 0; d[i] = c ? 242 : 10; d[i + 1] = c ? 242 : 10; d[i + 2] = c ? 236 : 10; }
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const pause = document.getElementById("pause");
let paused = reduceMotion, visible = true, t = 0, last = 0;
function setPaused(p) {
  paused = p;
  pause.textContent = p ? "play ▶" : "pause ‖";
  pause.setAttribute("aria-pressed", String(p));
}
setPaused(paused);
pause.addEventListener("click", () => setPaused(!paused));
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

draw(0);
requestAnimationFrame(function loop(now) {
  requestAnimationFrame(loop);
  if (paused || !visible || now - last < 70) return;
  last = now;
  t += 70;
  draw(t);
});

// Terminal pointer: a block that follows the mouse, a labelled tag on links
if (matchMedia("(pointer: fine)").matches) {
  const caret = document.getElementById("caret");
  let idle;
  document.documentElement.classList.add("has-caret");
  document.addEventListener("mousemove", (e) => {
    const link = e.target.closest && e.target.closest("a, button");
    let x = e.clientX - 1, y = e.clientY - 2;
    if (link) {
      const href = link.getAttribute("href") || "";
      caret.dataset.label = link.tagName === "BUTTON" ? "↵ press" : href.startsWith("#") ? "↓ go" : "↗ open";
      x = e.clientX + 12;
      y = e.clientY + 10;
    }
    caret.style.transform = `translate(${x}px, ${y}px)`;
    caret.className = "caret on" + (link ? " link" : "");
    clearTimeout(idle);
    idle = setTimeout(() => caret.classList.add("idle"), 500);
  });
  document.addEventListener("mouseleave", () => {
    caret.className = "caret";
    clearTimeout(idle);
  });
}
