import { useId, type ReactNode } from "react";
import styles from "./NavoFace.module.css";

export const NAVO_FACE_STATES = [
  "brand",
  "calm",
  "watching",
  "thinking",
  "acting",
  "waiting",
  "concerned",
  "needs",
  "celebrating",
] as const;
export type NavoFaceState = (typeof NAVO_FACE_STATES)[number];

const EYE = "#7DD3FC";

const ANTENNA: Partial<Record<NavoFaceState, string>> = {
  calm: "#34D399",
  celebrating: "#34D399",
  concerned: "#F59E0B",
  needs: "#F05A4F",
  waiting: "#94A3B8",
};

const LABELS: Record<NavoFaceState, string> = {
  brand: "Navo",
  calm: "Navo, all on track",
  watching: "Navo is watching",
  thinking: "Navo is thinking",
  acting: "Navo is acting",
  waiting: "Navo is waiting on a team",
  concerned: "Navo sees a risk",
  needs: "Navo needs your input",
  celebrating: "Navo is celebrating",
};

function Stroke({ d, width = 3.2 }: { d: string; width?: number }) {
  return <path d={d} stroke={EYE} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
}

function Dot({ cx, cy, r = 3.4 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} fill={EYE} />;
}

function Star({ x, y, r, fill = EYE }: { x: number; y: number; r: number; fill?: string }) {
  return (
    <path
      d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`}
      fill={fill}
    />
  );
}

function features(state: NavoFaceState): ReactNode {
  switch (state) {
    case "brand":
      return (
        <>
          <path d="M25 41V27l14 14V27" stroke="#fff" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Star x={45} y={24} r={3.6} />
        </>
      );
    case "calm":
      return (
        <>
          <Stroke d="M20 35q4-5 8 0" />
          <Stroke d="M36 35q4-5 8 0" />
        </>
      );
    case "watching":
      return (
        <g className={styles.blink}>
          <Dot cx={25} cy={33} />
          <Dot cx={39} cy={33} />
        </g>
      );
    case "thinking":
      return (
        <>
          <Dot cx={27} cy={31} r={3} />
          <Dot cx={41} cy={31} r={3} />
          <Stroke d="M37 25.5l7-1.6" width={2.4} />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={55 + i * 3.6}
              cy={11 - i * 3.2}
              r={1.5 + i * 0.35}
              fill="#38BDF8"
              className={styles.think}
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </>
      );
    case "acting":
      return (
        <>
          <ellipse cx={25} cy={32} rx={3.4} ry={2.6} fill={EYE} />
          <ellipse cx={39} cy={32} rx={3.4} ry={2.6} fill={EYE} />
          <rect x={20} y={42} width={24} height={2.4} rx={1.2} fill="rgba(125,211,252,.25)" />
          <rect x={20} y={42} width={9} height={2.4} rx={1.2} fill={EYE} className={styles.scan} />
        </>
      );
    case "waiting":
      return (
        <>
          <Stroke d="M21 34h7" />
          <Stroke d="M36 34h7" />
        </>
      );
    case "needs":
      return (
        <>
          <g className={styles.blink}>
            <Dot cx={25} cy={32} r={4.2} />
            <Dot cx={39} cy={32} r={4.2} />
          </g>
          <Stroke d="M30 42h4" />
        </>
      );
    case "concerned":
      return (
        <>
          <Dot cx={25} cy={34} r={3.2} />
          <Dot cx={39} cy={34} r={3.2} />
          <Stroke d="M20 27.5l7 1.8" width={2.4} />
          <Stroke d="M44 27.5l-7 1.8" width={2.4} />
        </>
      );
    case "celebrating":
      return (
        <>
          <Stroke d="M20 34q4-6 8 0" />
          <Stroke d="M36 34q4-6 8 0" />
          <Stroke d="M28 40q4 3 8 0" width={2.6} />
          {(
            [
              ["M4 19l3 3", "#38BDF8"],
              ["M60 19l-3 3", "#F59E0B"],
              ["M2 37h4", "#F472B6"],
              ["M62 37h-4", "#34D399"],
            ] as const
          ).map(([d, c]) => (
            <path key={d} d={d} stroke={c} strokeWidth={2.4} strokeLinecap="round" />
          ))}
          <Star x={11} y={9} r={3} fill="#F59E0B" />
          <Star x={54} y={8} r={2.6} fill="#38BDF8" />
        </>
      );
  }
}

const GLOW: Partial<Record<NavoFaceState, string>> = {
  acting: styles.glowSignal,
  thinking: styles.glowSignal,
  needs: styles.glowNeeds,
};

export interface NavoFaceProps {
  state?: NavoFaceState;
  size?: number;
  /** Set when the face sits next to text that already says what Navo is doing. */
  decorative?: boolean;
}

/** Navo's identity: a small white screen-face robot whose expression tracks what the agent is doing. */
export function NavoFace({ state = "brand", size = 48, decorative = false }: NavoFaceProps) {
  const gradientId = useId();
  const bob = state === "acting" || state === "celebrating";
  const className = [styles.face, GLOW[state] ?? styles.glowRest, bob ? styles.bob : ""].join(" ");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : LABELS[state]}
      data-state={state}
    >
      <defs>
        <linearGradient id={gradientId} x1={0} y1={0} x2={0} y2={1}>
          <stop offset={0} stopColor="#FFFFFF" />
          <stop offset={1} stopColor="#DCE4F4" />
        </linearGradient>
      </defs>
      <path d="M32 14V8" stroke="#B8C3D9" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={32} cy={6} r={3.4} fill={ANTENNA[state] ?? "#38BDF8"} className={state === "needs" ? styles.ping : undefined} />
      <rect x={7} y={14} width={50} height={43} rx={16} fill={`url(#${gradientId})`} stroke="#CCD5E6" strokeWidth={1} />
      <rect x={12} y={19} width={40} height={32} rx={11} fill="#0B1530" />
      {features(state)}
    </svg>
  );
}
