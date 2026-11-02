// The public site's placeholder character (cream redesign, 2 Nov 2026): a
// studio owl in a NivaDesk-teal apron. Drawn here for the site, not taken from
// anywhere. The owner is drawing the real character; when it arrives, replace
// the body of this one component (keep the `pose` names or map them) and every
// placement on the site follows. It is decorative everywhere: aria-hidden, no
// text inside, so it never needs a translation.
//
// A pose is something the owl is doing; each pose brings its own face and the
// way the head is turned, and either can be overridden at the call site.

import type { ReactNode } from "react";

export type MascotPose =
  | "wave"
  | "parcel"
  | "clipboard"
  | "laptop"
  | "boxes"
  | "celebrate"
  | "magnifier"
  | "pencil"
  | "coffee"
  | "point"
  | "ponder";
export type MascotMood = "calm" | "happy" | "wink" | "surprised" | "thinking" | "focused";
export type MascotFacing = "front" | "left" | "right";

const INK = "var(--mascot-ink, #251d1a)";
const BODY = "var(--mascot-body, #fff5e8)";
const FACE = "var(--mascot-face, #fffdfa)";
const WING = "var(--mascot-wing, #eed0bf)";
const APRON = "var(--mascot-apron, #2f6f6d)";
const BEAK = "var(--mascot-beak, #c17b58)";
const SAND = "var(--mascot-sand, #f6d3a0)";
const MOUTH = "#6b2e1c";

const POSE_DEFAULTS: Record<MascotPose, { mood: MascotMood; facing: MascotFacing }> = {
  wave: { mood: "happy", facing: "front" },
  parcel: { mood: "calm", facing: "front" },
  clipboard: { mood: "thinking", facing: "left" },
  laptop: { mood: "focused", facing: "front" },
  boxes: { mood: "surprised", facing: "right" },
  celebrate: { mood: "happy", facing: "front" },
  magnifier: { mood: "surprised", facing: "left" },
  pencil: { mood: "focused", facing: "left" },
  coffee: { mood: "wink", facing: "front" },
  point: { mood: "happy", facing: "right" },
  ponder: { mood: "thinking", facing: "right" }
};

type EyeState = "open" | "closed" | "lid" | "wide";

function Eye({ cx, cy, r, state, gaze }: { cx: number; cy: number; r: number; state: EyeState; gaze: [number, number] }) {
  if (state === "closed") {
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={FACE} strokeWidth="2" />
        <path d={`M${cx - r * 0.62} ${cy + 3}Q${cx} ${cy - 9} ${cx + r * 0.62} ${cy + 3}`} strokeWidth="3.2" />
      </g>
    );
  }
  const wide = state === "wide";
  const er = wide ? r + 2 : r;
  const pr = (wide ? 4.6 : state === "lid" ? 6.2 : 7.5) * (r / 16);
  const px = cx + gaze[0];
  const py = cy + gaze[1];
  return (
    <g>
      <circle cx={cx} cy={cy} r={er} fill="#ffffff" />
      <circle cx={px} cy={py} r={pr} fill={INK} stroke="none" />
      <circle cx={px + pr * 0.35} cy={py - pr * 0.4} r={Math.max(1.4, pr * 0.32)} fill="#ffffff" stroke="none" />
      {state === "lid" ? <path d={`M${cx - er} ${cy - 1}A${er} ${er} 0 0 1 ${cx + er} ${cy - 1}Z`} fill="#f3e3cc" strokeWidth="2.4" /> : null}
    </g>
  );
}

function Face({ mood, facing, x }: { mood: MascotMood; facing: MascotFacing; x: number }) {
  const side = facing === "left" ? -1 : facing === "right" ? 1 : 0;
  const ex1 = 80 + x + (side === 1 ? 2 : 0);
  const ex2 = 120 + x - (side === -1 ? 2 : 0);
  const r1 = side === 1 ? 13.5 : 16;
  const r2 = side === -1 ? 13.5 : 16;
  const ey = 102;
  const look: [number, number] =
    mood === "thinking" ? [(side || 1) * 3, -5]
      : mood === "focused" ? [(side || 0) * 2, 5]
        : mood === "surprised" ? [side * 1.5, 0]
          : side ? [side * 3, 1] : [0, 2];
  const gaze1: [number, number] = side ? look : [look[0] + 2, look[1]];
  const gaze2: [number, number] = side ? look : [look[0] - 2, look[1]];
  const states: [EyeState, EyeState] =
    mood === "happy" ? ["closed", "closed"]
      : mood === "wink" ? ["open", "closed"]
        : mood === "surprised" ? ["wide", "wide"]
          : mood === "focused" ? ["lid", "lid"]
            : ["open", "open"];
  const bx = 100 + x;
  const brows =
    mood === "surprised" ? `M${ex1 - 14} 76q13-11 26-1M${ex2 - 12} 75q13-10 26 1`
      : mood === "happy" ? `M${ex1 - 14} 80q13-10 26 0M${ex2 - 12} 80q13-10 26 0`
        : mood === "wink" ? `M${ex1 - 14} 79q13-10 26 0M${ex2 - 12} 86q13-5 26-1`
          : mood === "thinking" ? `M${ex1 - 14} 78q13-10 26-3M${ex2 - 12} 84q13-2 26 1`
            : mood === "focused" ? `M${ex1 - 13} 82l25 5M${ex2 - 12} 87l25-5`
              : `M${ex1 - 14} 82q13-8 26 0M${ex2 - 12} 82q13-8 26 0`;
  const beak =
    mood === "happy" || mood === "wink" ? (
      <>
        <path d={`M${bx - 8} 114q8-4 16 0l-8 10z`} fill={BEAK} />
        <path d={`M${bx - 7} 124q7 11 14 0z`} fill={MOUTH} strokeWidth="2.4" />
      </>
    ) : mood === "surprised" ? (
      <>
        <path d={`M${bx - 6} 114q6-3 12 0l-6 8z`} fill={BEAK} />
        <ellipse cx={bx} cy={129} rx={4.5} ry={6} fill={MOUTH} strokeWidth="2.4" />
      </>
    ) : (
      <path d={`M${bx} 114l-7 10q7 12 14 0z`} fill={BEAK} />
    );
  const blush = mood === "happy" || mood === "wink" ? 0.95 : 0.7;
  return (
    <g>
      <path d={`M${bx} 76c-16-6-44-2-46 26-2 24 18 34 46 26 28 8 48-2 46-26-2-28-30-32-46-26z`} fill={FACE} />
      <path d={brows} strokeWidth="2.5" />
      <Eye cx={ex1} cy={ey} r={r1} state={states[0]} gaze={gaze1} />
      <Eye cx={ex2} cy={ey} r={r2} state={states[1]} gaze={gaze2} />
      {beak}
      <ellipse cx={62 + x} cy={120} rx={6} ry={3.5} fill="#f0b89b" stroke="none" opacity={blush} />
      <ellipse cx={138 + x} cy={120} rx={6} ry={3.5} fill="#f0b89b" stroke="none" opacity={blush} />
    </g>
  );
}

const WING_FAR_DOWN = "M46 116C25 134 22 176 40 199c12-12 16-48 10-80z";
const WING_FAR_UP = "M46 120c-20-20-32-48-24-70 14 12 26 40 28 68z";
const WING_NEAR_DOWN = "M154 120c20 16 24 56 6 79-12-12-16-48-10-80z";
const WING_NEAR_UP = "M154 120c20-20 32-48 24-70-14 12-26 40-28 68z";
const FEET = "M84 213l-7 10M88 215v11M92 213l7 10M110 213l-7 10M114 215v11M118 213l7 10";
const FEET_STRIDE = "M76 212l-11 6M80 214l-8 11M84 213l-1 12M116 211l7 9M121 212l11 6M124 209l13 1";

// What the owl holds or does, drawn over the body. Wing tips that grip
// something are drawn here too, so they sit in front of the prop.
function Props({ pose, faceX }: { pose: MascotPose; faceX: number }): ReactNode {
  switch (pose) {
    case "wave":
      return <path d="M186 40l9-7M191 56l11-2M184 26l4-10" strokeWidth="2" />;
    case "parcel":
      return (
        <>
          <path d="M64 162h66v44H64z" fill={SAND} />
          <path d="M64 162l14-12h66l-14 12z" fill="#fbe3bd" />
          <path d="M130 162l14-12v42l-14 14z" fill="#e3b077" />
          <path d="M97 162v44M97 162l14-12" stroke={BEAK} strokeWidth="5" opacity="0.75" />
          <path d="M70 170h18v11H70z" fill="#ffffff" strokeWidth="1.8" />
          <path d="M56 168c-6 12-2 28 10 32 2-12 0-24-10-32z" fill={WING} />
        </>
      );
    case "clipboard":
      return (
        <>
          <g transform="rotate(8 151 170)">
            <path d="M128 140h46v62h-46z" fill={BEAK} />
            <path d="M133 148h36v48h-36z" fill="#ffffff" strokeWidth="2" />
            <path d="M143 135h16v9h-16z" fill={INK} />
            <path d="M138 158l3 3 6-6M150 158h14M138 171l3 3 6-6M150 171h14M140 184h4M150 184h14" strokeWidth="2" />
            <path d="M126 152c-10 6-12 22-4 32 6-8 8-22 4-32z" fill={WING} />
          </g>
          <circle cx="40" cy="58" r="2.6" strokeWidth="2" />
          <circle cx="30" cy="46" r="3.8" strokeWidth="2" />
          <circle cx="16" cy="30" r="5.6" strokeWidth="2" />
        </>
      );
    case "laptop":
      return (
        <>
          <rect x="52" y="146" width="96" height="52" rx="6" fill="#3a2e29" />
          <circle cx="100" cy="172" r="6.5" fill={APRON} stroke="none" />
          <path d="M42 198h116l-7 10H49z" fill="#e6dacb" />
          <ellipse cx="64" cy="197" rx="10" ry="6" fill={WING} />
          <ellipse cx="136" cy="197" rx="10" ry="6" fill={WING} />
          <path d="M56 184l-8-6M144 184l8-6M60 176l-5-8M140 176l5-8" strokeWidth="2" opacity="0.7" />
        </>
      );
    case "boxes":
      return (
        <>
          <path d="M6 150h20M0 166h24M8 182h16" strokeWidth="2.6" opacity="0.55" />
          <path d="M56 182h88v28H56z" fill={SAND} />
          <path d="M100 182v28" stroke={BEAK} strokeWidth="5" opacity="0.7" />
          <path d="M64 188h18v10H64z" fill="#ffffff" strokeWidth="1.6" />
          <path d="M64 158h72v24H64z" fill="#fbe3bd" />
          <path d="M100 158v24" stroke={BEAK} strokeWidth="4" opacity="0.6" />
          <g transform="rotate(-6 98 150)">
            <path d="M72 138h52v22H72z" fill={SAND} />
            <path d="M98 138v22" stroke={BEAK} strokeWidth="4" opacity="0.6" />
          </g>
          <ellipse cx="54" cy="196" rx="8" ry="11" fill={WING} />
          <ellipse cx="146" cy="196" rx="8" ry="11" fill={WING} />
        </>
      );
    case "celebrate":
      return (
        <>
          <path d="M28 40l10 4-4 9-10-4z" fill={SAND} strokeWidth="1.6" />
          <path d="M168 26l9 6-6 8-9-6z" fill={APRON} strokeWidth="1.6" />
          <circle cx="16" cy="96" r="4.5" fill={BEAK} strokeWidth="1.6" />
          <circle cx="190" cy="92" r="4" fill="#dce6d2" strokeWidth="1.6" />
          <path d="M60 14l8 2-2 8-8-2z" fill="#e3ddf0" strokeWidth="1.6" />
          <path d="M140 8l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill={SAND} strokeWidth="1.6" />
          <path d="M8 64q6-4 10 2t10 0M182 60q6-4 10 2t10 0" strokeWidth="2" />
        </>
      );
    case "magnifier": {
      const lx = 118 + faceX;
      const ly = 103;
      return (
        <>
          <path d={`M${lx + 15} ${ly + 15}L${lx + 36} ${ly + 44}`} strokeWidth="11" />
          <path d={`M${lx + 15} ${ly + 15}L${lx + 36} ${ly + 44}`} stroke={BEAK} strokeWidth="6" />
          <circle cx={lx} cy={ly} r="21" fill="rgba(214, 231, 239, 0.45)" strokeWidth="3.6" />
          <circle cx={lx - 1} cy={ly + 1} r="9.5" fill={INK} stroke="none" />
          <circle cx={lx + 3} cy={ly - 3} r="3" fill="#ffffff" stroke="none" />
          <path d={`M${lx - 12} ${ly - 8}q4-7 11-8`} stroke="#ffffff" strokeWidth="3" />
          <path d="M156 118c12 14 0 34-16 36-4-12 4-28 16-36z" fill={WING} />
        </>
      );
    }
    case "pencil":
      return (
        <>
          <g transform="rotate(-8 83 180)">
            <path d="M58 158h50v44H58z" fill="#ffffff" />
            <path d="M64 170h36M64 180h36M64 190h22" strokeWidth="1.8" opacity="0.6" />
          </g>
          <path d="M136 146l-26 36" strokeWidth="12" />
          <path d="M136 146l-26 36" stroke="#f2c94c" strokeWidth="7" />
          <path d="M113.6 184.6l-9.4 5.5 2.2-10.7z" fill="#fbe3bd" strokeWidth="2" />
          <circle cx="104.6" cy="189.6" r="1.6" fill={INK} stroke="none" />
          <circle cx="137.5" cy="144" r="5" fill="#eaa4a4" strokeWidth="2" />
          <ellipse cx="138" cy="156" rx="9" ry="7" fill={WING} />
          <ellipse cx="58" cy="184" rx="8" ry="10" fill={WING} />
        </>
      );
    case "coffee":
      return (
        <>
          <path d="M128 150c-4-6 4-10 0-16M139 150c-4-6 4-10 0-16" strokeWidth="2" opacity="0.6" />
          <path d="M149 164c11 0 11 16 0 16" strokeWidth="3.2" />
          <rect x="121" y="156" width="29" height="32" rx="5" fill="#fffdfa" />
          <path d="M121 166h29v7h-29z" fill={BEAK} strokeWidth="2" />
          <ellipse cx="123" cy="178" rx="8" ry="10" fill={WING} />
        </>
      );
    case "point":
      return (
        <>
          <path d="M150 120c18-10 36-14 50-14-2 9-16 17-46 24z" fill={WING} />
          <path d="M212 100l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill={SAND} strokeWidth="1.8" />
        </>
      );
    case "ponder":
      return (
        <>
          <path d="M156 122c-4 16-24 26-44 22 6-12 24-22 44-22z" fill={WING} />
          <circle cx="146" cy="56" r="3" strokeWidth="2" />
          <circle cx="157" cy="43" r="4.6" strokeWidth="2" />
          <ellipse cx="182" cy="20" rx="20" ry="16" fill={FACE} strokeWidth="2.4" />
          <path d="M176 14q0-7 6.5-7t6.5 6q0 4.5-5.5 6.5v3.5M183.5 30.5v.5" strokeWidth="2.8" />
        </>
      );
  }
}

export function PublicMascot({
  pose = "wave",
  mood,
  facing,
  className
}: {
  pose?: MascotPose;
  mood?: MascotMood;
  facing?: MascotFacing;
  className?: string;
}) {
  const defaults = POSE_DEFAULTS[pose];
  const face = mood ?? defaults.mood;
  const turn = facing ?? defaults.facing;
  const faceX = turn === "left" ? -9 : turn === "right" ? 9 : 0;
  const nearUp = pose === "wave" || pose === "celebrate";
  const nearInFront = pose === "point" || pose === "ponder" || pose === "magnifier";
  const hop = pose === "celebrate" ? -8 : 0;
  // A turned head also tips a little that way; it reads as a turn at small sizes.
  const tilt = turn === "left" ? "rotate(-5 100 112)" : turn === "right" ? "rotate(5 100 112)" : undefined;
  return (
    <svg
      className={`public-mascot${className ? ` ${className}` : ""}`}
      data-pose={pose}
      data-mood={face}
      viewBox="-20 -18 240 264"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="100" cy="229" rx={hop ? 44 : 54} ry="7" fill="rgba(37, 29, 26, 0.12)" />
      <g transform={hop ? `translate(0 ${hop})` : undefined} fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d={pose === "boxes" ? FEET_STRIDE : FEET} stroke={BEAK} strokeWidth="3.4" />
        <path d={pose === "celebrate" ? WING_FAR_UP : WING_FAR_DOWN} fill={WING} />
        {nearInFront ? null : <path d={nearUp ? WING_NEAR_UP : WING_NEAR_DOWN} fill={WING} />}
        <path transform={tilt} d={`M${64 + faceX * 0.6} 78L${51 + faceX * 0.6} 43l33 23zM${136 + faceX * 0.6} 78l13-35-33 23z`} fill={BODY} />
        <path d="M100 56c48 0 68 40 66 90-2 48-28 70-66 70s-64-22-66-70c-2-50 18-90 66-90z" fill={BODY} />
        <path d="M101.5 57.5c47 1 66 41 64 89" strokeWidth="1.2" opacity="0.35" />
        <path d={`M${86 + faceX * 0.5} 137l4 4 4-4M${106 + faceX * 0.5} 137l4 4 4-4`} strokeWidth="2" />
        <path d="M70 152c2-18 58-18 60 0" stroke={APRON} strokeWidth="3.5" />
        <path d="M68 152h64l-4 52q-28 10-56 0z" fill={APRON} />
        <path d="M86 176h28v13q-14 6-28 0z" fill="rgba(255, 255, 255, 0.14)" strokeWidth="2" />
        <path d="M108 172l5-15" stroke={SAND} strokeWidth="4" />
        <path d="M113 157l1.6-4.6" strokeWidth="2" />
        <g transform={tilt}>
          <Face mood={face} facing={turn} x={faceX} />
        </g>
        <Props pose={pose} faceX={faceX} />
      </g>
    </svg>
  );
}
