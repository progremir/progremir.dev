// "instant" renders the rest of the session at once: reduced motion, or the visitor skipped.
let instant = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, instant ? 0 : ms));

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

// Clock (Almaty, UTC+5)
let clock = "--:--";
function tick() {
  const d = new Date(Date.now() + 5 * 3600 * 1000);
  clock = String(d.getUTCHours()).padStart(2, "0") + ":" + String(d.getUTCMinutes()).padStart(2, "0");
  $("clock").textContent = clock;
}
tick();
setInterval(tick, 30000);

// The session. Answers are segments: [kind, text, href?] with kind t(ext) b(old) c(ode) a(link).
const SESSION = [
  {
    q: "who is emir? make no mistakes",
    verb: "Remembering", past: "Cogitated",
    tools: [["Read", "~/about.md", ["Read 3 lines"]]],
    blocks: [
      ["h", [["t", "Emir Amanbekov"]]],
      ["p", [["t", "Software engineer based in "], ["b", "Almaty, Kazakhstan"], ["t", ". Also goes by "], ["c", "progremir"], ["t", "."]]],
    ],
  },
  {
    q: "where has he worked. be concise, no yapping",
    verb: "Grepping", past: "Grepped",
    tools: [
      ["Bash", "ls work/", ["b12/  jo-solutions/  kyohealth/"]],
      ["Read", "work/jo-solutions/README.md", ["Read 4 lines"]],
    ],
    blocks: [
      ["h", [["t", "Work"]]],
      ["li", [["b", "Jo Solutions"], ["t", " — Software Engineer, "], ["c", "2025–now"], ["t", " "], ["a", "jo.xyz", "https://www.jo.xyz"]]],
      ["li", [["b", "KyoHealth"], ["t", " — Founding Engineer, "], ["c", "2023–2025"], ["t", " "], ["a", "kyohealth.ai", "https://www.kyohealth.ai"]]],
      ["li", [["b", "B12"], ["t", " — Software Engineer, "], ["c", "2019–2023"], ["t", " "], ["a", "b12.io", "https://www.b12.io"]]],
    ],
  },
  {
    q: "how do i reach him?? ultrathink",
    verb: "Looking up", past: "Looked up",
    tools: [
      ["Grep", 'pattern: "progremir", path: "~/links"', ["Found 4 matches"]],
      ["Bash", "cat ~/links/*.url | head -2", ["https://github.com/progremir", "https://twitter.com/progremir"], 2],
    ],
    blocks: [
      ["h", [["t", "Socials"]]],
      ["li", [["a", "github.com/progremir", "https://github.com/progremir"]]],
      ["li", [["a", "x.com/progremir", "https://twitter.com/progremir"]]],
      ["li", [["a", "instagram.com/progremir", "https://instagram.com/progremir"]]],
      ["li", [["a", "linkedin.com/in/progremir", "https://linkedin.com/in/progremir"]]],
    ],
  },
];

const RAINBOW = ["#e5737c", "#e9a06b", "#e5c96c", "#9fcb7a", "#6fc3b8", "#6aa9e3", "#8e95e6", "#b18ae0", "#d987c7", "#e57d9f"];

// Render text into a node, colouring the "ultrathink" keyword letter by letter.
function paint(node, str) {
  node.textContent = "";
  const re = /ultrathink/gi;
  let i = 0, m;
  while ((m = re.exec(str))) {
    if (m.index > i) node.append(str.slice(i, m.index));
    [...m[0]].forEach((ch, k) => {
      const s = el("span", null, ch);
      s.style.color = RAINBOW[k];
      node.append(s);
    });
    i = m.index + m[0].length;
  }
  if (i < str.length) node.append(str.slice(i));
}

const log = $("log"), scroll = $("scroll"), draft = $("draft"), spinner = $("spinner"), tab = $("tab"), skipBtn = $("skip");

function skip() {
  instant = true;
  skipBtn.hidden = true;
}
skipBtn.addEventListener("click", skip);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") skip(); });
const follow = () => { scroll.scrollTop = scroll.scrollHeight; };

const FRAMES = "·✢✳✶✻✽✻✶✳✢";
let spinTimer;
function spin(verb) {
  const start = performance.now();
  spinner.replaceChildren(el("span", "glyph"), el("span", null, verb + "…"), el("span", "meta"));
  const [glyph, , meta] = spinner.children;
  const update = () => {
    const e = performance.now() - start;
    glyph.textContent = FRAMES[Math.floor(e / 110) % FRAMES.length];
    meta.textContent = `(${(e / 1000).toFixed(1)}s · ↓ ${Math.floor(e / 35)} tokens · esc to interrupt)`;
  };
  update();
  spinTimer = setInterval(update, 60);
  return start;
}
function stopSpin() {
  clearInterval(spinTimer);
  spinner.replaceChildren();
}

// Show the question as a grey suggestion, "press" tab to accept it, then submit.
async function suggest(text) {
  paint(draft, text);
  draft.classList.add("ghost");
  tab.hidden = false;
  await sleep(650);
  tab.classList.add("pressed");
  draft.classList.remove("ghost");
  await sleep(300);
  tab.hidden = true;
  tab.classList.remove("pressed");
  await sleep(200);
  draft.textContent = "";
}

async function runTool(ex, [name, arg, lines, more]) {
  const box = el("div", "tool running");
  const head = el("div", "row");
  const title = el("span");
  title.append(el("b", null, name), el("span", "arg", `(${arg})`));
  head.append(el("span", "dot", "●"), title);
  const running = el("div", "out");
  running.append(el("span", null, "⎿"), el("span", null, "Running…"));
  box.append(head, running);
  ex.append(box);
  follow();
  await sleep(450);
  box.classList.remove("running");
  running.remove();
  lines.forEach((text, i) => {
    const row = el("div", "out");
    row.append(el("span", null, i ? "" : "⎿"), el("span", null, text));
    box.append(row);
  });
  if (more) box.append(el("div", "more", `… +${more} lines (ctrl+o to expand)`));
  follow();
}

async function streamAnswer(ex, blocks) {
  const row = el("div", "row");
  const body = el("div", "answer");
  row.append(el("span", null, "●"), body);
  ex.append(row);
  // Build every node empty, then fill characters in order.
  const queue = [];
  for (const [kind, segs] of blocks) {
    const block = el("div", "blk-" + kind);
    body.append(block);
    for (const [type, text, href] of segs) {
      let node;
      if (type === "b") node = el("b");
      else if (type === "c") node = el("code");
      else if (type === "a") { node = el("a"); node.href = href; }
      else node = el("span");
      block.append(node);
      queue.push([node, text]);
    }
  }
  for (const [node, text] of queue) {
    if (instant) { node.textContent = text; continue; }
    for (let i = 1; i <= text.length; i++) {
      if (instant) { node.textContent = text; break; }
      node.textContent = text.slice(0, i);
      if (i % 3 === 0 || i === text.length) { follow(); await sleep(36); }
    }
  }
}

async function run() {
  await sleep(700);
  for (const step of SESSION) {
    if (!instant) await suggest(step.q);
    const ex = el("div", "ex");
    const user = el("div", "user");
    const q = el("span", "q");
    paint(q, step.q);
    user.append(el("span", null, "❯"), q);
    ex.append(user);
    log.append(ex);
    follow();

    const started = instant ? 0 : spin(step.verb);
    await sleep(700);
    for (const tool of step.tools) {
      await runTool(ex, tool);
      await sleep(300);
    }
    await streamAnswer(ex, step.blocks);
    stopSpin();
    const secs = Math.max(1, Math.round((performance.now() - started) / 1000));
    const done = el("div", "row done");
    done.append(el("span", null, "✻"), el("span", null, `${step.past} for ${started ? secs : 1}s · done ${clock}`));
    ex.append(done);
    follow();
    await sleep(900);
  }
  skipBtn.hidden = true;
  follow();
}
run();

// Terminal pointer: a block that follows the mouse, a labelled tag on links
if (matchMedia("(pointer: fine)").matches) {
  const caret = $("caret");
  let idle;
  document.documentElement.classList.add("has-caret");
  document.addEventListener("mousemove", (e) => {
    const link = e.target.closest && e.target.closest("a, button");
    let x = e.clientX - 1, y = e.clientY - 2;
    if (link) {
      caret.dataset.label = "↗ open";
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
