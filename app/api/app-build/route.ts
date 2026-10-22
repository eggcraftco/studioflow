// The build the server is running (GN-06). An open tab compares it with the
// build it loaded (lib/studioflow/webBuild.ts) to offer — never force — a
// reload after a web release. No sign-in, nothing about any workspace: the
// value is the build stamp already present in every public script.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_NV_BUILD_ID || "" },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
