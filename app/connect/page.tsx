// /connect — the neutral address of the assistant consent page (claude-endpoint-r3). The authorization endpoint sends
// a Claude connection here; ChatGPT keeps /chatgpt/connect. Same page, same component.
export const dynamic = "force-dynamic";
export { default } from "../chatgpt/connect/page";
