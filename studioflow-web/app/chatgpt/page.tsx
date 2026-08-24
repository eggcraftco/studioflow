import type { Metadata } from "next";
import { PublicChatGPTPage } from "@/components/PublicMarketing";
import { publicPageMetadata } from "@/lib/publicSite/metadata";

export const metadata: Metadata = publicPageMetadata("chatgpt");

export default function ChatGPTPage() {
  return <PublicChatGPTPage />;
}
