import { proxyNivaDeskFirebaseFunction } from "@/lib/chatgpt/proxyFirebaseFunction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  return proxyNivaDeskFirebaseFunction(request, "chatgptOAuthWorkspaces");
}

export { handle as GET, handle as POST, handle as OPTIONS, handle as HEAD };
