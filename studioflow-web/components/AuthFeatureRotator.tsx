"use client";

// Typewriter feature words above the sign-in card — letters type in with a
// tiny vibration tick on supported phones, hold, then rewind-delete at 2x
// speed. The caret is a small rounded square like the app's order cards,
// changing colour/size per word. Mirrors the native iPhone/Android login.

import { useEffect, useRef, useState } from "react";

const TICK_MS = 45;
const HOLD_TICKS = 55; // ~2.5s after a word finishes typing
const PAUSE_TICKS = 20; // ~0.9s quiet gap after erase

const CARET_COLORS = ["#61a6fa", "#73cc8c", "#fab866", "#ed8ca6", "#a98cf2", "#6bc7cc"];
const CARET_SIZES = [14, 17, 15, 18, 14.5, 16];

function vibrate(ms: number) {
  try {
    // Android browsers support this; iOS Safari ignores it silently.
    navigator.vibrate?.(ms);
  } catch {
    // best effort
  }
}

export function AuthFeatureRotator({ words }: { prefix?: string; words: string[] }) {
  // All animation counters live in refs (mutated by a single interval); one
  // state tick per frame triggers the re-render.
  const wordIndexRef = useRef(0);
  const charCountRef = useRef(0);
  const phaseRef = useRef<"typing" | "holding" | "deleting" | "pausing">("typing");
  const ticksRef = useRef(0);
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (!words.length) return;
    const interval = window.setInterval(() => {
      const word = words[wordIndexRef.current % words.length] ?? "";
      switch (phaseRef.current) {
        case "typing":
          if (charCountRef.current < word.length) {
            charCountRef.current += 1;
            vibrate(4);
          } else {
            phaseRef.current = "holding";
            ticksRef.current = 0;
          }
          break;
        case "holding":
          ticksRef.current += 1;
          if (ticksRef.current >= HOLD_TICKS) phaseRef.current = "deleting";
          break;
        case "deleting":
          if (charCountRef.current > 0) {
            charCountRef.current = Math.max(charCountRef.current - 2, 0);
            vibrate(3);
          } else {
            phaseRef.current = "pausing";
            ticksRef.current = 0;
          }
          break;
        case "pausing":
          ticksRef.current += 1;
          if (ticksRef.current >= PAUSE_TICKS) {
            phaseRef.current = "typing";
            wordIndexRef.current = (wordIndexRef.current + 1) % words.length;
          }
          break;
      }
      setFrame(frame => frame + 1);
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [words.length, words]);

  const wordIndex = wordIndexRef.current;
  const word = words[wordIndex % Math.max(words.length, 1)] ?? "";
  const typed = word.slice(0, charCountRef.current);
  const caretColor = CARET_COLORS[wordIndex % CARET_COLORS.length];
  const caretSize = CARET_SIZES[wordIndex % CARET_SIZES.length];
  const isHolding = phaseRef.current === "holding";

  const caret = (hidden = false) => (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: caretSize,
        height: caretSize,
        borderRadius: 4.5,
        background: caretColor,
        opacity: hidden ? 0 : isHolding ? 0.7 : 0.9,
        animation: isHolding ? "auth-caret-blink 1.45s ease-in-out infinite" : "none",
        transition: "background 0.3s ease, width 0.3s ease, height 0.3s ease",
        flex: "0 0 auto"
      }}
    />
  );

  return (
    <div
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        margin: "6px 0 18px",
        minHeight: 38
      }}
    >
      {typed.length === 0 ? (
        caret()
      ) : (
        <>
          {caret(true)}
          <span
            style={{
              fontSize: 27,
              fontWeight: 850,
              background: "linear-gradient(100deg, #0a84ff, #8a5cf6 55%, #d65bd6)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              whiteSpace: "nowrap"
            }}
          >
            {typed}
          </span>
          {caret()}
        </>
      )}
    </div>
  );
}
