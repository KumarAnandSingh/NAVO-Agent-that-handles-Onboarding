/**
 * Captures the product video's raw material from the running app: sharp 2x screenshots of each
 * moment in the story, short frame sequences while Navo works, and the position of every element
 * the video zooms to or clicks. Everything is produced by driving the real app with real clicks.
 *
 *   npm run build && NAVO_LIVE_AI=off npx next start -p 3200   (or set ANTHROPIC_API_KEY for live Claude)
 *   npm run video:capture
 *
 * Writes video/.capture/manifest.json and the frames next to it.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect, type Browser, type Locator, type Page } from "@playwright/test";
import type { Box, Frame, Manifest } from "../../video/types";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3200";
const OUT = path.join(process.cwd(), "video", ".capture");
const VIEWPORT = { width: 1600, height: 1000 };
const SCALE = 2;

const manifest: Manifest = { viewport: VIEWPORT, scale: SCALE, live: false, shots: {}, sequences: {}, faces: {}, data: {} };

class Recorder {
  constructor(readonly page: Page) {}

  get phone() {
    return this.page.getByRole("region", { name: "Anand's phone" });
  }

  get runtime() {
    return this.page.getByRole("complementary", { name: "Agent runtime" });
  }

  /** Wait until Navo has finished working: request done and tool replay finished. */
  async settled() {
    await expect(this.page.getByRole("button", { name: /Navo is working/ })).toHaveCount(0, { timeout: 60_000 });
    await expect(this.page.getByText("Running", { exact: true })).toHaveCount(0, { timeout: 60_000 });
  }

  async toastGone() {
    await expect(this.page.locator('[role="status"]:not([aria-live])')).toHaveCount(0, { timeout: 15_000 });
  }

  /** Click like a person: real click, then move the pointer away so no hover state is captured. */
  async click(target: Locator) {
    await target.click();
    await this.page.mouse.move(2, 2);
  }

  /** The box of an element, optionally of an ancestor `up` levels above it. */
  async box(target: Locator, up = 0): Promise<Box | null> {
    if ((await target.count()) === 0) return null;
    const rect = await target.first().evaluate((el, levels) => {
      let node: Element = el;
      for (let i = 0; i < levels && node.parentElement; i++) node = node.parentElement;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }, up);
    return rect.w > 0 && rect.h > 0 ? round(rect) : null;
  }

  /** Every tool card in the runtime panel, keyed by tool name ("name#2" for repeats). */
  async toolBoxes(): Promise<Record<string, Box>> {
    const cards = await this.runtime.evaluate((aside) => {
      const out: { name: string; x: number; y: number; w: number; h: number }[] = [];
      for (const span of Array.from(aside.querySelectorAll("span"))) {
        const match = /^([a-z][a-z0-9_]+)\(/.exec(span.textContent ?? "");
        const card = span.parentElement?.parentElement;
        if (!match?.[1] || !card || span.parentElement?.firstElementChild !== span) continue;
        const r = card.getBoundingClientRect();
        out.push({ name: match[1], x: r.x, y: r.y, w: r.width, h: r.height });
      }
      return out;
    });
    const boxes: Record<string, Box> = {};
    for (const card of cards) {
      let key = `tool:${card.name}`;
      for (let n = 2; key in boxes; n++) key = `tool:${card.name}#${n}`;
      boxes[key] = round(card);
    }
    return boxes;
  }

  async toolCount(): Promise<number> {
    if ((await this.runtime.count()) === 0) return 0;
    return Object.keys(await this.toolBoxes()).length;
  }

  /** The common boxes (stage areas) plus the named extras that are on screen. */
  async boxes(extra: Record<string, Locator | [Locator, number]>): Promise<Record<string, Box>> {
    const boxes: Record<string, Box> = { full: { x: 0, y: 0, ...{ w: VIEWPORT.width, h: VIEWPORT.height } } };
    const common: Record<string, Locator> = {
      phone: this.phone,
      runtime: this.runtime,
      presenter: this.page.getByRole("complementary", { name: "Presenter controls" }),
      advance: this.page.getByRole("button", { name: "Advance time ▸" }),
      hrTab: this.page.getByRole("tab", { name: "HR owner" }),
      empTab: this.page.getByRole("tab", { name: "Employee" }),
    };
    for (const [name, target] of Object.entries(common)) {
      const b = await this.box(target);
      if (b) boxes[name] = b;
    }
    if ((await this.runtime.count()) > 0) Object.assign(boxes, await this.toolBoxes());
    for (const [name, target] of Object.entries(extra)) {
      const b = Array.isArray(target) ? await this.box(target[0], target[1]) : await this.box(target);
      if (b) boxes[name] = b;
      else console.warn(`  (no box for ${name})`);
    }
    return boxes;
  }

  async frame(file: string) {
    await this.page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 90 });
    await this.collectFaces();
  }

  async shot(id: string, extra: Record<string, Locator | [Locator, number]> = {}) {
    await this.page.waitForTimeout(250);
    const file = `${id}.jpg`;
    await this.frame(file);
    manifest.shots[id] = { file, boxes: await this.boxes(extra) };
    console.warn(`shot ${id}`);
  }

  /** Start an action and keep capturing frames until it and Navo's tool replay are done. */
  async sequence(id: string, action: () => Promise<void>, extra: Record<string, Locator | [Locator, number]> = {}, minMs = 1200) {
    const frames: Frame[] = [];
    const start = Date.now();
    let done = false;
    const running = action().then(() => {
      done = true;
    });
    for (let i = 0; ; i++) {
      const file = `${id}-${String(i).padStart(3, "0")}.jpg`;
      const t = Date.now() - start;
      await this.frame(file);
      frames.push({ file, t, tools: await this.toolCount() });
      const busy = (await this.page.getByRole("button", { name: /Navo is working/ }).count()) + (await this.page.getByText("Running", { exact: true }).count());
      if (done && busy === 0 && t > minMs) break;
      if (t > 60_000) throw new Error(`sequence ${id} did not settle`);
      await this.page.waitForTimeout(120);
    }
    await running;
    manifest.sequences[id] = { frames, boxes: await this.boxes(extra) };
    console.warn(`sequence ${id}: ${frames.length} frames`);
  }

  /** Keep a clean copy of each face state Navo shows, for the title cards. */
  async collectFaces() {
    const faces = await this.page.evaluate(() =>
      Array.from(document.querySelectorAll("svg[aria-label^='Navo']")).map((svg) => {
        const copy = svg.cloneNode(true) as SVGElement;
        copy.removeAttribute("class");
        copy.querySelectorAll("[class]").forEach((el) => el.removeAttribute("class"));
        copy.removeAttribute("width");
        copy.removeAttribute("height");
        copy.removeAttribute("style");
        return { label: svg.getAttribute("aria-label") ?? "", markup: copy.outerHTML };
      }),
    );
    for (const face of faces) if (!(face.label in manifest.faces)) manifest.faces[face.label] = face.markup;
  }
}

function round(b: Box): Box {
  return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
}

async function open(browser: Browser) {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT, deviceScaleFactor: SCALE, reducedMotion: "reduce" });
  const page = await context.newPage();
  return new Recorder(page);
}

async function openStage(r: Recorder) {
  await r.page.goto("/");
  const brief = r.page.getByRole("dialog", { name: "About this demo" });
  await expect(brief).toBeVisible();
  await r.click(brief.getByRole("button", { name: "Explore on my own" }));
  await expect(brief).toHaveCount(0);
}

async function jumpToChapter(r: Recorder, name: RegExp) {
  await r.click(r.page.getByRole("navigation", { name: "Chapters" }).getByRole("button", { name }));
  await r.settled();
}

async function advance(r: Recorder) {
  await r.click(r.page.getByRole("button", { name: "Advance time ▸" }));
  await r.settled();
}

/** The main story with HR responding: first launch to Day 30. */
async function mainStory(browser: Browser) {
  const r = await open(browser);
  const { page } = r;
  const app = r.phone;

  await page.goto("/");
  const brief = page.getByRole("dialog", { name: "About this demo" });
  await expect(brief).toBeVisible();
  await r.shot("brief", {
    anand: [brief.getByText("Anand Mehta", { exact: true }), 2],
    priya: [brief.getByText("Priya Nair", { exact: true }), 2],
    watch: [brief.getByText("The late Employee ID", { exact: true }), 2],
  });
  const people = await r.box(brief.getByText("Anand Mehta", { exact: true }), 3);
  if (people) manifest.shots.brief!.boxes.peopleRow = people;
  await r.click(brief.getByRole("button", { name: "Explore on my own" }));
  await expect(brief).toHaveCount(0);
  manifest.live = (await page.getByText(/Claude live/).count()) > 0;

  await expect(app.getByRole("heading", { name: "Welcome to Halden." })).toBeVisible();
  await r.shot("launch", { continue: app.getByRole("button", { name: "Continue" }) });
  await r.click(app.getByRole("button", { name: "Continue" }));
  await expect(app.getByRole("heading", { name: /Meet Navo/ })).toBeVisible();
  await r.shot("meet", {
    ownRule: [app.getByText("I'll do on my own"), 1],
    askRule: [app.getByText("I'll always ask you first"), 1],
    seeRule: [app.getByText("You can always see"), 1],
    start: app.getByRole("button", { name: /Let's start/ }),
  });

  await r.click(app.getByRole("button", { name: /Let's start/ }));
  await expect(app.getByRole("heading", { name: "Your address proof is missing." })).toBeVisible();
  await r.shot("docs", {
    heading: app.getByRole("heading", { name: "Your address proof is missing." }),
    upload: app.getByRole("button", { name: "Upload address proof" }),
  });
  await r.click(app.getByRole("button", { name: "Upload address proof" }));
  await r.shot("picker", { bill: app.getByRole("button", { name: "Electricity bill (Sep 2026)" }) });
  await r.click(app.getByRole("button", { name: "Electricity bill (Sep 2026)" }));
  await r.settled();
  await expect(app.getByRole("heading", { name: "One thing to clarify." })).toBeVisible();
  await r.shot("docs-read", {
    toast: page.locator('[role="status"]:not([aria-live])'),
    heading: app.getByRole("heading", { name: "One thing to clarify." }),
    clarify: app.getByRole("button", { name: "Clarify relieving letter" }),
  });
  await r.toastGone();
  await r.click(app.getByRole("button", { name: "Clarify relieving letter" }));
  await expect(app.getByText("1? Oct 2026")).toBeVisible();
  await r.shot("clarify", {
    heading: app.getByRole("heading", { name: /couldn't read/ }),
    letter: [app.getByText(/I read:/), 1],
    reading: app.getByText(/I read:/),
    yes: app.getByRole("button", { name: "Yes, 16 Oct" }),
  });
  await r.click(app.getByRole("button", { name: "Yes, 16 Oct" }));
  await r.settled();
  await expect(app.getByRole("heading", { name: "All documents verified." })).toBeVisible();
  await r.shot("docs-done", {
    heading: app.getByRole("heading", { name: "All documents verified." }),
    forms: app.getByRole("button", { name: "Continue to forms" }),
  });
  await r.toastGone();

  await r.click(app.getByRole("button", { name: "Continue to forms" }));
  await expect(app.getByText("From address proof").first()).toBeVisible();
  await r.shot("forms", {
    prefilled: [app.getByText("From address proof").first(), 1],
    contact: app.getByRole("button", { name: "Add emergency contact" }),
  });
  await r.click(app.getByRole("button", { name: "Add emergency contact" }));
  await r.shot("forms-contact", { save: app.getByRole("button", { name: "Save" }) });
  await r.click(app.getByRole("button", { name: "Save" }));
  await r.settled();
  await r.toastGone();
  await r.shot("forms-ready", { submit: app.getByRole("button", { name: "Confirm and submit" }) });
  await r.click(app.getByRole("button", { name: "Confirm and submit" }));
  await r.settled();
  await expect(app.getByRole("heading", { name: /You join Halden in 12 days/ })).toBeVisible();
  await r.toastGone();
  await r.shot("home-start", { heading: app.getByRole("heading", { name: /You join Halden/ }) });

  // Quiet days pass; on Wednesday Navo starts watching, on Thursday it acts.
  await advance(r);
  await r.toastGone();
  await r.shot("home-wed", { heading: app.getByRole("heading").first() });
  await r.sequence("risk", async () => {
    await page.getByRole("button", { name: "Advance time ▸" }).click();
    await page.mouse.move(2, 2);
  });
  await expect(app.getByRole("heading", { name: "One risk to Monday. I'm on it." })).toBeVisible();
  await r.toastGone();
  await r.shot("risk", {
    heading: app.getByRole("heading", { name: "One risk to Monday. I'm on it." }),
    followed: [app.getByText("Followed up with HR"), 2],
    watching: [app.getByText("Laptop may miss Day 1"), 1],
    why: app.getByRole("button", { name: "Why?" }),
    changes: [r.runtime.getByText("State changes"), 1],
    runLine: [r.runtime.getByText(/Acted on Day-1 risk/), 1],
  });
  manifest.data.riskHeadline = (await r.runtime.getByText(/Acted on Day-1 risk/).first().textContent()) ?? "";

  await r.click(app.getByRole("button", { name: "Why?" }));
  const reason = app.getByText(/last safe start/).first();
  await reason.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await r.shot("why", { reasons: [reason, 2] });
  const reasons = await r.box(app.getByText("Noticed", { exact: true }).first(), 3);
  if (reasons) manifest.shots.why!.boxes.reasonList = reasons;
  await r.click(app.getByRole("button", { name: "Hide" }));

  // The HR owner's view of the same moment.
  await r.click(page.getByRole("tab", { name: "HR owner" }));
  const generate = page.getByRole("button", { name: "Generate ID" });
  await expect(generate).toBeVisible();
  await r.shot("hr", {
    greeting: page.getByRole("heading", { name: /Good (morning|afternoon|evening), Priya/ }),
    queueItem: [page.getByText("Employee ID not generated"), 2],
    navoNote: page.getByText(/Navo: reminded you/),
    generate,
    feed: [page.getByText(/Navo activity on this joiner/i), 1],
  });
  await r.sequence("generate", async () => {
    await generate.click();
    await page.mouse.move(2, 2);
  });
  await r.toastGone();
  await r.shot("hr-after", { feed: [page.getByText(/Navo activity on this joiner/i), 1] });
  await r.click(page.getByRole("tab", { name: "Employee" }));
  await r.settled();
  await r.toastGone();
  await r.shot("cleared", { heading: app.getByRole("heading").first() });

  // The one thing only Anand can do, then time runs on until everything is ready for Day 1.
  const training = app.getByRole("button", { name: "Start" });
  await r.shot("training", { start: training, card: [training, 1] });
  await r.click(training);
  await r.settled();
  await r.toastGone();
  const ready = app.getByRole("button", { name: /Your Day 1 pickup is ready/ });
  for (let i = 0; i < 10 && (await ready.count()) === 0; i++) await advance(r);
  await expect(ready).toBeVisible();
  await r.toastGone();
  await r.shot("ready", { ready, heading: app.getByRole("heading").first() });

  // Day 1 through Day 30, clicking through the joiner's own screens.
  await r.click(ready);
  await r.shot("idcard", { pickupButton: app.getByRole("button", { name: "See everything for pickup" }) });
  await r.click(app.getByRole("button", { name: "See everything for pickup" }));
  const skipMonday = app.getByRole("button", { name: /Skip to (Monday|Day 1)/ });
  await r.shot("pickup", { skip: skipMonday });
  await r.click(skipMonday);
  await r.settled();
  await r.toastGone();
  const arrive = app.getByRole("button", { name: /I'm at/ });
  await expect(arrive).toBeVisible();
  await r.shot("day1", { arrive, heading: app.getByRole("heading").first() });
  await r.click(arrive);
  await r.settled();
  await r.toastGone();
  const tap = app.getByRole("button", { name: "Tap what you collected" });
  if ((await tap.count()) > 0) {
    const unpicked = app.locator("button[aria-pressed='false']");
    while ((await unpicked.count()) > 0) await unpicked.first().click();
  }
  const confirm = app.getByRole("button", { name: /^Confirm \d item/ });
  await r.shot("confirm", { confirm, toggles: [confirm, 0] });
  await r.click(confirm);
  await r.settled();
  await r.toastGone();
  const toWeek1 = app.getByRole("button", { name: "Skip to Week 1 ▸" });
  if ((await toWeek1.count()) === 0) {
    const summary = app.getByRole("button", { name: "See today's summary" });
    if ((await summary.count()) > 0) await r.click(summary);
  }
  await expect(toWeek1).toBeVisible();
  await r.shot("day1done", { heading: app.getByRole("heading").first(), next: toWeek1 });
  await r.click(toWeek1);
  await r.settled();
  await r.toastGone();
  const book = app.getByRole("button", { name: "Book it" });
  await r.shot("week1", { book, suggestion: [book, 2], benefits: app.getByRole("button", { name: /Health cover/ }) });
  if ((await book.count()) > 0) {
    await r.click(book);
    await r.settled();
    await r.toastGone();
  }
  await r.click(app.getByRole("button", { name: /Health cover/ }));
  const enrol = app.getByRole("button", { name: "Enrol family" });
  await r.shot("benefits", { enrol, heading: app.getByRole("heading").first() });
  if ((await enrol.isEnabled().catch(() => false)) === true) {
    await r.click(enrol);
    await r.settled();
    await r.toastGone();
    await r.shot("benefits-done", { heading: app.getByRole("heading").first() });
  }
  await r.click(app.getByRole("button", { name: "‹ Week 1" }));
  await r.click(app.getByRole("button", { name: "Skip to Day 30 ▸" }));
  await r.settled();
  await r.toastGone();
  const impactButton = app.getByRole("button", { name: "See the impact →" });
  await r.shot("day30", { heading: app.getByRole("heading").first(), impact: impactButton });
  await r.click(impactButton);
  const impact = page.getByRole("dialog", { name: "Impact" });
  await expect(impact).toBeVisible();
  const statNumbers = await impact.locator("div").evaluateAll((els) =>
    els
      .filter((el) => el.children.length === 2 && /^\d/.test(el.children[0]?.textContent ?? ""))
      .map((el) => ({ value: el.children[0]?.textContent ?? "", label: el.children[1]?.textContent ?? "" })),
  );
  statNumbers.forEach((s, i) => {
    manifest.data[`impact${i + 1}`] = s.value;
    manifest.data[`impact${i + 1}Label`] = s.label;
  });
  const trust = await impact.getByText(/tool calls, each logged/).textContent();
  manifest.data.toolCalls = /(\d+) tool calls/.exec(trust ?? "")?.[1] ?? "";
  await r.shot("impact", {
    title: [impact.getByRole("heading").first(), 0],
    stats: [impact.getByText(/completed tasks closed/), 2],
  });
  await page.context().close();
}

/** HR stays silent: the loaner approval. */
async function silentStory(browser: Browser) {
  const r = await open(browser);
  const { page } = r;
  const app = r.phone;
  await openStage(r);
  await r.click(page.getByRole("radio", { name: "HR silent" }));
  await r.settled();
  await jumpToChapter(r, /Pre-joining/);
  await advance(r);
  await advance(r);
  await expect(app.getByText("Use a loaner laptop for Day 1?")).toBeVisible();
  await r.toastGone();
  const approve = app.getByRole("button", { name: "Approve" });
  await r.shot("loaner", {
    heading: app.getByRole("heading", { name: "I need one decision from you." }),
    card: [app.getByText("Use a loaner laptop for Day 1?"), 1],
    approve,
  });
  await r.sequence("loaner-approve", async () => {
    await approve.click();
    await page.mouse.move(2, 2);
  });
  await expect(app.getByRole("heading", { name: "Day 1 is covered." })).toBeVisible();
  await r.toastGone();
  await r.shot("covered", { heading: app.getByRole("heading", { name: "Day 1 is covered." }) });
  await page.context().close();
}

/** Ask Navo: a typed question, answered from live state and policy. */
async function askStory(browser: Browser) {
  const r = await open(browser);
  const { page } = r;
  const app = r.phone;
  await openStage(r);
  await jumpToChapter(r, /Pre-joining/);
  await advance(r);
  await r.toastGone();
  await r.click(app.getByRole("button", { name: "Ask Navo" }));
  const sheet = app.getByRole("dialog", { name: "Ask Navo" });
  const input = sheet.getByRole("textbox", { name: "Question for Navo" });
  await expect(input).toBeVisible();
  await page.waitForTimeout(500);
  await r.shot("ask-open", { input, sheet });

  const question = "What if HR doesn't respond?";
  const frames: Frame[] = [];
  await input.click();
  for (let i = 1; i <= question.length; i++) {
    await input.fill(question.slice(0, i));
    if (i % 2 === 0 || i === question.length) {
      const file = `ask-typing-${String(frames.length).padStart(3, "0")}.jpg`;
      await r.frame(file);
      frames.push({ file, t: i * 90, tools: 0 });
    }
  }
  manifest.sequences["ask-typing"] = { frames, boxes: await r.boxes({ input, send: sheet.getByRole("button", { name: "Ask", exact: true }) }) };
  await r.sequence(
    "ask-answer",
    async () => {
      await sheet.getByRole("button", { name: "Ask", exact: true }).click();
      await page.mouse.move(2, 2);
      await expect(sheet.getByText(/Offline answer from Navo's rules|Answered by Claude/)).toBeVisible({ timeout: 60_000 });
    },
    {
      answer: [sheet.getByText(/Offline answer from Navo's rules|Answered by Claude/), 1],
      checked: sheet.getByText(/^Checked /),
      sheet,
    },
  );
  await page.context().close();
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    await mainStory(browser);
    await silentStory(browser);
    await askStory(browser);
  } finally {
    await browser.close();
  }
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.warn(`captured ${Object.keys(manifest.shots).length} shots, ${Object.keys(manifest.sequences).length} sequences, faces: ${Object.keys(manifest.faces).join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
