import ChatGPTConnectClient, { type OAuthParams } from "./ChatGPTConnectClient";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function ChatGPTConnectPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const initialOAuthParams: OAuthParams = {
    client_id: firstValue(params.client_id),
    redirect_uri: firstValue(params.redirect_uri),
    state: firstValue(params.state),
    scope: firstValue(params.scope, "orders.read orders.write"),
    code_challenge: firstValue(params.code_challenge),
    code_challenge_method: firstValue(params.code_challenge_method),
    resource: firstValue(params.resource, "https://nivadesk.app/chatgptMcp")
  };

  return <ChatGPTConnectClient initialOAuthParams={initialOAuthParams} />;
}
