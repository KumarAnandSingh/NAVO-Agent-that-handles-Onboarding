/** Tiny DOM and easing helpers for the composer. Every visual is a pure function of time. */

export type Anim = "up" | "fade" | "pop" | "left" | "count" | "draw" | "grow";

interface Props {
  class?: string;
  style?: string;
  text?: string;
  html?: string;
  /** Seconds (scene time) when the element animates in. */
  at?: number;
  anim?: Anim;
  /** Animation length in seconds. */
  len?: number;
}

export function h(tag: string, props: Props = {}, ...children: (Node | string | null | undefined | false)[]): HTMLElement {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.style) el.style.cssText = props.style;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.html !== undefined) el.innerHTML = props.html;
  if (props.at !== undefined) {
    el.dataset.at = String(props.at);
    el.dataset.anim = props.anim ?? "up";
    if (props.len !== undefined) el.dataset.len = String(props.len);
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

export function svg(tag: string, attrs: Record<string, string | number>, at?: number, anim: Anim = "draw"): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (at !== undefined) {
    el.dataset.at = String(at);
    el.dataset.anim = anim;
  }
  return el;
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
export function easeOutBack(p: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

/** Applies every data-at animation under root for scene time t. */
export function animate(root: Element, t: number) {
  root.querySelectorAll<HTMLElement | SVGElement>("[data-at]").forEach((el) => {
    const at = Number(el.dataset.at);
    const len = Number(el.dataset.len ?? 0.6);
    const p = clamp01((t - at) / len);
    const e = easeOut(p);
    const style = el.style;
    switch (el.dataset.anim) {
      case "fade":
        style.opacity = String(e);
        break;
      case "left":
        style.opacity = String(e);
        style.transform = `translateX(${(1 - e) * -40}px)`;
        break;
      case "pop":
        style.opacity = String(clamp01(p * 2));
        style.transform = `scale(${0.8 + 0.2 * easeOutBack(p)})`;
        break;
      case "grow":
        style.transform = `scaleX(${e})`;
        break;
      case "draw": {
        const length = Number(el.dataset.length ?? 1000);
        style.strokeDasharray = String(length);
        style.strokeDashoffset = String(length * (1 - e));
        style.opacity = p > 0 ? "1" : "0";
        break;
      }
      case "count": {
        style.opacity = String(clamp01(p * 3));
        style.transform = `translateY(${(1 - e) * 24}px)`;
        const target = el.dataset.value ?? "";
        const match = /^(\D*)(\d+)(.*)$/.exec(target);
        el.textContent = match ? `${match[1]}${Math.round(Number(match[2]) * easeOut(clamp01((t - at) / 1.1)))}${match[3]}` : target;
        break;
      }
      default:
        style.opacity = String(e);
        style.transform = `translateY(${(1 - e) * 30}px)`;
    }
  });
}
