"use client";

// A small emoji chooser for the composer: a curated grid of common emoji,
// searched by name, inserted at the caret. No library, no network, no
// tracking: the list is the file, and a name is the only thing searched.

import { useEffect, useMemo, useRef, useState } from "react";

/** ~60 of the emoji a workshop writes to a customer with, each with the words a person searches by (English; the search is by these keys). */
export const CURATED_EMOJI: ReadonlyArray<readonly [string, string]> = [
  ["\u{1F60A}", "smile happy"], ["\u{1F600}", "grin"], ["\u{1F602}", "laugh joy tears"], ["\u{1F609}", "wink"], ["\u{1F60D}", "heart eyes love"],
  ["\u{1F970}", "smiling hearts love"], ["\u{1F60E}", "sunglasses cool"], ["\u{1F914}", "thinking"], ["\u{1F642}", "slight smile"], ["\u{1F643}", "upside down"],
  ["\u{1F62E}", "wow surprised"], ["\u{1F622}", "sad cry"], ["\u{1F62D}", "crying"], ["\u{1F614}", "pensive sorry"], ["\u{1F633}", "flushed"],
  ["\u{1F644}", "eye roll"], ["\u{1F60C}", "relieved"], ["\u{1F973}", "party celebrate"], ["\u{1F92D}", "oops hand over mouth"], ["\u{1F60B}", "yum delicious"],
  ["\u{1F44D}", "thumbs up ok yes good"], ["\u{1F44E}", "thumbs down no"], ["\u{1F44F}", "clap applause"], ["\u{1F64F}", "thanks pray please"], ["\u{1F91D}", "handshake deal"],
  ["\u{1F44B}", "wave hello hi bye"], ["\u{1F44C}", "ok perfect"], ["✌️", "victory peace"], ["\u{1F4AA}", "strong muscle"], ["\u{1F91E}", "fingers crossed luck"],
  ["❤️", "heart love red"], ["\u{1F499}", "blue heart"], ["\u{1F49B}", "yellow heart"], ["\u{1F49A}", "green heart"], ["\u{1F49C}", "purple heart"],
  ["\u{1F525}", "fire hot"], ["✨", "sparkles new shiny"], ["⭐", "star"], ["\u{1F389}", "party popper congratulations"], ["\u{1F381}", "gift present"],
  ["\u{1F48D}", "ring engagement jewellery"], ["\u{1F48E}", "gem diamond stone"], ["⌚", "watch time"], ["\u{1F4FF}", "beads necklace"], ["\u{1F451}", "crown"],
  ["\u{1F4E6}", "package parcel box"], ["\u{1F69A}", "delivery truck shipping"], ["\u{1F4EC}", "mailbox post"], ["\u{1F4CD}", "location pin"], ["\u{1F4C5}", "calendar date"],
  ["⏰", "alarm clock reminder"], ["\u{1F4F7}", "camera photo"], ["\u{1F4DD}", "memo note"], ["\u{1F9FE}", "receipt invoice"], ["\u{1F4B3}", "card payment"],
  ["✅", "check done yes"], ["❌", "cross no wrong"], ["⚠️", "warning attention"], ["❓", "question"], ["\u{1F4A1}", "idea lightbulb"],
  ["☀️", "sun sunny"], ["\u{1F327}️", "rain"], ["☕", "coffee tea"], ["\u{1F370}", "cake birthday"], ["\u{1F33B}", "flower sunflower"]
];

export function EmojiPicker({
  onPick,
  onClose,
  t
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  t: (text: string) => string;
}) {
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    input.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return CURATED_EMOJI;
    return CURATED_EMOJI.filter(([, names]) => names.includes(needle));
  }, [query]);

  return (
    <div className="inbox-emoji" ref={box} role="dialog" aria-label={t("Add emoji")}>
      <input
        ref={input}
        type="search"
        className="inbox-emoji-search"
        value={query}
        placeholder={t("Search emoji")}
        aria-label={t("Search emoji")}
        onChange={(event) => setQuery(event.target.value)}
      />
      {shown.length === 0 ? (
        <p className="inbox-emoji-empty">{t("No emoji matches that name.")}</p>
      ) : (
        <div className="inbox-emoji-grid" role="listbox">
          {shown.map(([emoji, names]) => (
            <button
              key={emoji}
              type="button"
              className="inbox-emoji-cell"
              role="option"
              aria-selected={false}
              title={names.split(" ")[0]}
              onClick={() => onPick(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
