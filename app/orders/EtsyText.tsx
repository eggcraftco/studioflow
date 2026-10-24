"use client";

// ETSY-E2E night (24 Oct 2026): a buyer's text from Etsy with any upload link shown as "Photo attached ↗".
// The link opens the buyer's photo on Etsy's own host in a new tab; NivaDesk does not embed or keep the image.
import { etsyTextParts } from "@/lib/studioflow/etsyFirstImport";

export function EtsyText({ value, photoLabel }: { value: string; photoLabel: string }) {
  return (
    <>
      {etsyTextParts(value).map((part, i) =>
        "photo" in part ? (
          <a key={i} className="etsy-photo-link" href={part.photo} target="_blank" rel="noopener noreferrer">{photoLabel} ↗</a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  );
}

/** Photo links found in a note, rendered under it (the note itself is a button and cannot hold a link). */
export function EtsyNotePhotoLinks({ photos, photoLabel }: { photos: string[]; photoLabel: string }) {
  if (!photos.length) return null;
  return (
    <p className="etsy-note-photos">
      {photos.map((url, i) => (
        <a key={i} className="etsy-photo-link" href={url} target="_blank" rel="noopener noreferrer">{photoLabel}{photos.length > 1 ? ` ${i + 1}` : ""} ↗</a>
      ))}
    </p>
  );
}

export default EtsyText;
