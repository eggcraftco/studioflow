"use client";

// Short animated feature words shown above the sign-in card — a calm,
// NivaDesk-flavoured take on the minimal AI-app login screens.

import { useEffect, useState } from "react";

export function AuthFeatureRotator({ prefix, words }: { prefix: string; words: string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (words.length <= 1) return;
    const interval = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex(current => (current + 1) % words.length);
        setVisible(true);
      }, 260);
    }, 2100);
    return () => window.clearInterval(interval);
  }, [words.length]);

  return (
    <div className="auth-rotator" aria-live="polite">
      <span className="auth-rotator-prefix">{prefix}</span>
      <span className={visible ? "auth-rotator-word is-visible" : "auth-rotator-word"}>
        {words[index] ?? ""}
      </span>
    </div>
  );
}
