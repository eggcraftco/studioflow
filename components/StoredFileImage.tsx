"use client";

// An <img> for a stored file whose address is asked of Storage at the moment it
// is drawn (lib/studioflow/storageFileUrl.ts, security audit #19 A1). While the
// answer is on its way, or when Storage refuses, the placeholder is drawn
// instead — never the stored token URL of a file that has a storage path.
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { useResolvedFileUrl } from "@/lib/studioflow/storageFileUrl";

export function StoredFileImage({
  storagePath,
  fallbackUrl,
  alt,
  className,
  style,
  placeholder = null,
  onClick
}: {
  storagePath?: string;
  fallbackUrl?: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: ReactNode;
  onClick?: (event: MouseEvent<HTMLImageElement>) => void;
}) {
  const resolved = useResolvedFileUrl(storagePath, fallbackUrl);
  if (resolved.status !== "ready") return <>{placeholder}</>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved.url} alt={alt} className={className} style={style} onClick={onClick} />;
}
