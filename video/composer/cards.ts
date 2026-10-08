/** Builders for the title cards: the pitch scenes between the product footage. */
import type { Card } from "../types";
import { h, svg } from "./dom";

type Faces = Record<string, string>;

function face(faces: Faces, label: string, size: number, at: number, extra = ""): HTMLElement {
  return h("div", { class: "face", style: `width:${size}px;height:${size}px;${extra}`, html: faces[label] ?? faces.Navo ?? "", at, anim: "pop", len: 0.7 });
}

function hook(card: Extract<Card, { type: "hook" }>): HTMLElement {
  const tile = h(
    "div",
    { class: "cal", at: card.day.at, anim: "pop", len: 0.7 },
    h("div", { class: "cal-band", text: card.day.label }),
    h("div", { class: "cal-day", text: card.day.date.split(" ")[0] }),
    h("div", { class: "cal-sub", text: card.day.date.split(" ").slice(1).join(" ") }),
  );
  const items = h(
    "div",
    { class: "hook-items" },
    ...card.items.map((item) =>
      h(
        "div",
        { class: "hook-item", at: item.at, anim: "left" },
        h("span", { class: "x", text: "✕" }),
        h("span", { class: "hook-label", text: item.label }),
        h("span", { class: "hook-status", text: item.status }),
      ),
    ),
  );
  return h(
    "div",
    { class: "card hook" },
    h("div", { class: "hook-row" }, tile, items),
    h("div", { class: "headline xl", text: card.headline.text, at: card.headline.at, style: "top:700px" }),
  );
}

function teams(card: Extract<Card, { type: "teams" }>): HTMLElement {
  const cx = 960;
  const cy = 420;
  const r = 232;
  const lines = svg("svg", { width: 1920, height: 1080, class: "lines" });
  const nodes = card.teams.map((team, i) => {
    const angle = (-90 + i * (360 / card.teams.length)) * (Math.PI / 180);
    const x = cx + Math.cos(angle) * r * 1.35;
    const y = cy + Math.sin(angle) * r;
    const line = svg("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: "rgba(255,255,255,.28)", "stroke-width": 2.5, "stroke-dasharray": "8 8" }, team.at);
    line.dataset.length = String(Math.hypot(x - cx, y - cy));
    lines.append(line);
    return h(
      "div",
      { class: "team", style: `left:${x}px;top:${y}px`, at: team.at, anim: "pop" },
      h("span", { class: "dot", style: `background:${team.color}` }),
      h("span", { text: team.label }),
    );
  });
  const center = h("div", { class: "joiner", style: `left:${cx}px;top:${cy}px`, at: 0.2, anim: "pop" }, h("div", { class: "joiner-icon" }), h("div", { text: card.center }));
  const counters = h(
    "div",
    { class: "counters" },
    ...card.counters.map((c, i) =>
      h(
        "div",
        { class: "counter", at: c.at },
        h("div", { class: `counter-value ${i === card.counters.length - 1 ? "bad" : ""}`, text: c.value }),
        h("div", { class: "counter-label", text: c.label }),
      ),
    ),
  );
  return h("div", { class: "card teams" }, lines, center, ...nodes, counters, h("div", { class: "headline md", text: card.headline.text, at: card.headline.at, style: "top:58px" }));
}

function chain(card: Extract<Card, { type: "chain" }>): HTMLElement {
  const badges = ["LATE", "BLOCKED", "BLOCKED", "AT RISK"];
  const row = h("div", { class: "chain-row" });
  card.nodes.forEach((node, i) => {
    if (i > 0) row.append(h("div", { class: "chain-arrow", text: "→", at: node.at - 0.3, anim: "fade" }));
    row.append(
      h(
        "div",
        { class: "chain-node", at: 0.5 + i * 0.12 },
        h("div", { class: "chain-alarm", at: node.at, anim: "fade", len: 0.4 }),
        h("div", { class: "chain-badge", text: badges[i] ?? "AT RISK", at: node.at, anim: "pop" }),
        h("div", { class: "chain-label", text: node.label }),
        h("div", { class: "chain-sub", text: node.sub }),
      ),
    );
  });
  return h(
    "div",
    { class: "card chain" },
    h("div", { class: "headline md", text: card.title.text, at: card.title.at, style: "top:120px" }),
    row,
    h("div", { class: "headline lg", text: card.finale.text, at: card.finale.at, style: "top:660px" }),
  );
}

function intro(card: Extract<Card, { type: "intro" }>, faces: Faces): HTMLElement {
  return h(
    "div",
    { class: "card intro" },
    face(faces, card.face, 190, card.name.at, "position:absolute;left:865px;top:110px"),
    h("div", { class: "wordmark", text: "Navo", at: card.name.at + 0.15 }),
    h("div", { class: "tagline", text: card.tagline.text, at: card.tagline.at }),
    h(
      "div",
      { class: "pillars" },
      ...card.pillars.map((p) => h("div", { class: "pillar", at: p.at }, h("div", { class: "pillar-title", text: p.title }), h("div", { class: "pillar-body", text: p.body }))),
    ),
    h("div", { class: "footnote", text: card.footnote, at: 1.4, anim: "fade" }),
  );
}

function interstitial(card: Extract<Card, { type: "interstitial" }>, faces: Faces): HTMLElement {
  return h(
    "div",
    { class: "card interstitial" },
    card.face ? face(faces, card.face, 130, 0.1, "position:absolute;left:895px;top:170px") : null,
    h("div", { class: "kicker", text: card.kicker.text, at: card.kicker.at, style: "top:345px" }),
    h("div", { class: "headline xl", text: card.headline.text, at: card.headline.at, style: "top:400px" }),
    card.sub ? h("div", { class: "subline", text: card.sub.text, at: card.sub.at, style: "top:545px" }) : null,
  );
}

function architecture(card: Extract<Card, { type: "architecture" }>): HTMLElement {
  const stack = h("div", { class: "arch-stack" });
  card.layers.forEach((layer, i) => {
    if (i > 0) stack.append(h("div", { class: "arch-arrow", text: "↓", at: layer.at - 0.2, anim: "fade" }));
    stack.append(h("div", { class: `arch-layer ${layer.accent ? "accent" : ""}`, at: layer.at, anim: "left" }, h("div", { class: "arch-label", text: layer.label }), h("div", { class: "arch-detail", text: layer.detail })));
  });
  const link = svg("svg", { width: 1920, height: 1080, class: "lines" });
  const path = svg("path", { d: "M1238 470 C 1170 470, 1170 420, 1112 420", stroke: "#38BDF8", "stroke-width": 3, fill: "none", "stroke-dasharray": "8 8" }, card.side.at + 0.3);
  path.dataset.length = "160";
  const path2 = svg("path", { d: "M1238 520 C 1170 520, 1170 575, 1112 575", stroke: "#38BDF8", "stroke-width": 3, fill: "none" }, card.side.at + 0.5);
  path2.dataset.length = "160";
  link.append(path, path2);
  return h(
    "div",
    { class: "card architecture" },
    h("div", { class: "headline md", text: card.title.text, at: card.title.at, style: "top:70px" }),
    stack,
    link,
    h(
      "div",
      { class: "arch-side", at: card.side.at, anim: "pop" },
      h("div", { class: "arch-side-label", text: card.side.label }),
      h("div", { class: "arch-side-detail", text: card.side.detail }),
      h("div", { class: "verified", text: `✓ ${card.side.verified}` }),
    ),
  );
}

function stats(card: Extract<Card, { type: "stats" }>): HTMLElement {
  return h(
    "div",
    { class: "card stats" },
    h("div", { class: "headline lg", text: card.title.text, at: card.title.at, style: "top:150px" }),
    h(
      "div",
      { class: "stat-row" },
      ...card.stats.map((s) => {
        const numeric = /^\D*\d/.test(s.value);
        const value = h("div", { class: `stat-value ${numeric ? "" : "word"}`, text: s.value, at: s.at, anim: numeric ? "count" : "pop" });
        value.dataset.value = s.value;
        return h("div", { class: "stat", at: s.at - 0.1, anim: "fade" }, value, h("div", { class: "stat-label", text: s.label }));
      }),
    ),
    card.footer ? h("div", { class: "subline", text: card.footer.text, at: card.footer.at, style: "top:700px;font-size:30px" }) : null,
  );
}

function vision(card: Extract<Card, { type: "vision" }>): HTMLElement {
  const row = h("div", { class: "vision-row" });
  card.steps.forEach((step, i) => {
    if (i > 0) row.append(h("div", { class: "chain-arrow", text: "→", at: step.at - 0.2, anim: "fade" }));
    row.append(h("div", { class: `vision-step ${i === card.steps.length - 1 ? "accent" : ""}`, at: step.at }, h("div", { class: "kicker-inline", text: step.kicker }), h("div", { class: "vision-text", text: step.text })));
  });
  return h("div", { class: "card vision" }, h("div", { class: "headline md", text: card.title.text, at: card.title.at, style: "top:130px" }), row);
}

function close(card: Extract<Card, { type: "close" }>, faces: Faces): HTMLElement {
  return h(
    "div",
    { class: "card close" },
    face(faces, card.face, 210, card.name.at, "position:absolute;left:855px;top:120px"),
    h("div", { class: "wordmark", text: "Navo", at: card.name.at + 0.15, style: "top:350px" }),
    h("div", { class: "tagline", text: card.tagline.text, at: card.tagline.at, style: "top:540px" }),
    ...card.lines.map((line, i) => h("div", { class: "close-line", text: line.text, at: line.at, style: `top:${640 + i * 52}px` })),
  );
}

export function buildCard(card: Card, faces: Faces): HTMLElement {
  switch (card.type) {
    case "hook":
      return hook(card);
    case "teams":
      return teams(card);
    case "chain":
      return chain(card);
    case "intro":
      return intro(card, faces);
    case "interstitial":
      return interstitial(card, faces);
    case "architecture":
      return architecture(card);
    case "stats":
      return stats(card);
    case "vision":
      return vision(card);
    case "close":
      return close(card, faces);
  }
}
