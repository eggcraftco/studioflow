// The public site's placeholder character (cream redesign, 2 Nov 2026): a
// studio owl in a NivaDesk-teal apron. Drawn here for the site, not taken from
// anywhere. The owner is drawing the real character; when it arrives, replace
// the body of this one component (keep the `pose` names or map them) and every
// placement on the site follows. It is decorative everywhere: aria-hidden, no
// text inside, so it never needs a translation.

export type MascotPose = "wave" | "parcel" | "clipboard";

const INK = "var(--mascot-ink, #251d1a)";
const BODY = "var(--mascot-body, #fff5e8)";
const FACE = "var(--mascot-face, #fffdfa)";
const WING = "var(--mascot-wing, #eed0bf)";
const APRON = "var(--mascot-apron, #2f6f6d)";
const BEAK = "var(--mascot-beak, #c17b58)";
const SAND = "var(--mascot-sand, #f6d3a0)";

export function PublicMascot({ pose = "wave", className }: { pose?: MascotPose; className?: string }) {
  return (
    <svg
      className={`public-mascot${className ? ` ${className}` : ""}`}
      data-pose={pose}
      viewBox="0 0 200 240"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="100" cy="229" rx="54" ry="7" fill="rgba(37, 29, 26, 0.12)" />
      <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* feet */}
        <path d="M84 213l-7 10M88 215v11M92 213l7 10M110 213l-7 10M114 215v11M118 213l7 10" stroke={BEAK} strokeWidth="3.4" />
        {/* far wing */}
        <path d="M46 116C25 134 22 176 40 199c12-12 16-48 10-80z" fill={WING} />
        {pose === "wave" ? (
          <>
            <path d="M154 120c20-20 32-48 24-70-14 12-26 40-28 68z" fill={WING} />
            <path d="M186 40l9-7M191 56l11-2M184 26l4-10" strokeWidth="2" />
          </>
        ) : (
          <path d="M154 120c20 16 24 56 6 79-12-12-16-48-10-80z" fill={WING} />
        )}
        {/* ear tufts and body */}
        <path d="M64 78L51 43l33 23zM136 78l13-35-33 23z" fill={BODY} />
        <path d="M100 56c48 0 68 40 66 90-2 48-28 70-66 70s-64-22-66-70c-2-50 18-90 66-90z" fill={BODY} />
        <path d="M101.5 57.5c47 1 66 41 64 89" strokeWidth="1.2" opacity="0.35" />
        {/* face disc, brows, eyes, beak */}
        <path d="M100 76c-16-6-44-2-46 26-2 24 18 34 46 26 28 8 48-2 46-26-2-28-30-32-46-26z" fill={FACE} />
        <path d="M66 82q13-8 26 0M108 82q13-8 26 0" strokeWidth="2.5" />
        <circle cx="80" cy="102" r="16" fill="#ffffff" />
        <circle cx="120" cy="102" r="16" fill="#ffffff" />
        <circle cx="82" cy="104" r="7.5" fill={INK} stroke="none" />
        <circle cx="118" cy="104" r="7.5" fill={INK} stroke="none" />
        <circle cx="84.6" cy="101" r="2.4" fill="#ffffff" stroke="none" />
        <circle cx="120.6" cy="101" r="2.4" fill="#ffffff" stroke="none" />
        <path d="M100 114l-7 10q7 12 14 0z" fill={BEAK} />
        <ellipse cx="62" cy="120" rx="6" ry="3.5" fill="#f0b89b" stroke="none" opacity="0.75" />
        <ellipse cx="138" cy="120" rx="6" ry="3.5" fill="#f0b89b" stroke="none" opacity="0.75" />
        <path d="M86 137l4 4 4-4M106 137l4 4 4-4" strokeWidth="2" />
        {/* apron */}
        <path d="M70 152c2-18 58-18 60 0" stroke={APRON} strokeWidth="3.5" />
        <path d="M68 152h64l-4 52q-28 10-56 0z" fill={APRON} />
        <path d="M86 176h28v13q-14 6-28 0z" fill="rgba(255, 255, 255, 0.14)" strokeWidth="2" />
        <path d="M108 172l5-15" stroke={SAND} strokeWidth="4" />
        <path d="M113 157l1.6-4.6" strokeWidth="2" />
        {pose === "parcel" ? (
          <>
            <path d="M64 162h66v44H64z" fill={SAND} />
            <path d="M64 162l14-12h66l-14 12z" fill="#fbe3bd" />
            <path d="M130 162l14-12v42l-14 14z" fill="#e3b077" />
            <path d="M97 162v44M97 162l14-12" stroke={BEAK} strokeWidth="5" opacity="0.75" />
            <path d="M70 170h18v11H70z" fill="#ffffff" strokeWidth="1.8" />
            <path d="M56 168c-6 12-2 28 10 32 2-12 0-24-10-32z" fill={WING} />
          </>
        ) : null}
        {pose === "clipboard" ? (
          <g transform="rotate(8 151 170)">
            <path d="M128 140h46v62h-46z" fill={BEAK} />
            <path d="M133 148h36v48h-36z" fill="#ffffff" strokeWidth="2" />
            <path d="M143 135h16v9h-16z" fill={INK} />
            <path d="M138 158l3 3 6-6M150 158h14M138 171l3 3 6-6M150 171h14M140 184h4M150 184h14" strokeWidth="2" />
            <path d="M126 152c-10 6-12 22-4 32 6-8 8-22 4-32z" fill={WING} />
          </g>
        ) : null}
      </g>
    </svg>
  );
}
