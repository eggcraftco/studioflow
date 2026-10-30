"use client";

// The consent return for this workspace's own cloud storage. The address is the
// redirect URI registered with the provider, so it is a page of its own; the
// work is shared in components/StorageOAuthReturn.tsx.
import { StorageOAuthReturn } from "@/components/StorageOAuthReturn";

export default function StorageCallbackPage() {
  return <StorageOAuthReturn provider="gdrive" />;
}
