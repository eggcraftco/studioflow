// The /f/ file viewer and PDFs (8 Nov 2026, real-device finding L1: iPhone Safari showed page 1 only, cropped, and
// Android Chrome showed a placeholder with the raw storage path, because the viewer put the PDF in an <iframe>).
// A PDF now comes from the file host itself, at the top level, as application/pdf + Content-Disposition: inline, so
// the browser's own viewer shows every page and the address bar keeps the file host.
//
// app/f/[...slug]/route.ts, compiled with the tree's own TypeScript, driven with a pretend fetch (Storage and the
// nvViewSharedFile function), for both link kinds:
//   - the path-masked link /f/<path>.pdf?b=&t= and the short link /f/<id>.pdf (also /f/<id> with no extension when the
//     mapping says it is a PDF): the bytes inline, the right headers (type, inline name, no-store, noindex, nosniff), no
//     HTML and no storage address in the response; a Range request is passed on and a 206 comes back as one;
//   - unchanged: images / video keep the HTML viewer, ?dl=1 still downloads (attachment), a non-PDF short link asks
//     the function for its HTML in one call, an expired short link gets the function's own page, a branded host's
//     error page carries no NivaDesk name, a Storage failure is an error page, not a broken PDF.
//
//   npm run test:file-viewer-pdf
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return ""; } };
let checks = 0;
let failures = 0;
function expect(name: string, ok: unknown, detail = "") {
  checks += 1;
  if (ok) console.log(`ok   ${name}`);
  else { failures += 1; console.log(`FAIL ${name}${detail ? `  <- ${detail}` : ""}`); }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "file-viewer-pdf-"));
let route: { GET?: (req: unknown, ctx: unknown) => Promise<Response> } | null = null;
const source = read("app/f/[...slug]/route.ts");
if (source) {
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/^import \{ NextRequest \} from "next\/server";\s*$/m, "");
  fs.writeFileSync(path.join(tmp, "route.mjs"), js);
  route = await import(pathToFileURL(path.join(tmp, "route.mjs")).href);
}
expect("app/f/[...slug]/route.ts compiles and loads", route?.GET);

const PDF = Buffer.from("%PDF-1.4\n% three pages\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const STORAGE = "https://firebasestorage.googleapis.com/";
const FN = "https://europe-west2-eggcraft-studio.cloudfunctions.net/nvViewSharedFile";
type Call = { url: string; range: string | null };
let calls: Call[] = [];
let storageStatus = 200;
let meta: Record<string, unknown> | null = { ok: true, bucket: "eggcraft-studio.appspot.com", path: "companies/ws1/client_files/o1/Catalogue 2026.pdf", token: "tok-1", fileName: "Catalogue 2026.pdf" };
let metaStatus = 200;
globalThis.fetch = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
  const url = String(input);
  const range = init?.headers?.range ?? null;
  calls.push({ url, range });
  if (url.startsWith(STORAGE)) {
    if (storageStatus !== 200) return new Response("no", { status: storageStatus });
    if (range) return new Response(PDF.subarray(0, 10), { status: 206, headers: { "content-type": "application/pdf", "content-range": `bytes 0-9/${PDF.length}`, "content-length": "10", "accept-ranges": "bytes" } });
    return new Response(PDF, { status: 200, headers: { "content-type": "application/octet-stream", "content-length": String(PDF.length), "accept-ranges": "bytes" } });
  }
  if (url.startsWith(FN)) {
    if (url.includes("meta=1")) {
      return new Response(JSON.stringify(meta ?? { ok: false }), { status: metaStatus, headers: { "content-type": "application/json" } });
    }
    return new Response(`<!doctype html><html><body>viewer for ${new URL(url).searchParams.get("id")}</body></html>`, { status: meta ? 200 : 404, headers: { "content-type": "text/html" } });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

async function get(pathAndQuery: string, headers: Record<string, string> = {}) {
  calls = [];
  const nextUrl = new URL(`https://nivadesk.app${pathAndQuery}`);
  const slug = nextUrl.pathname.replace(/^\/f\//, "").split("/").filter(Boolean);
  const res = await route!.GET!({ headers: new Headers(headers), nextUrl }, { params: Promise.resolve({ slug }) });
  const body = Buffer.from(await res.arrayBuffer());
  return { res, body, text: body.toString("utf8"), calls };
}
const MASKED = "/f/companies/ws1/client_files/o1/Catalogue%202026.pdf?b=eggcraft-studio.appspot.com&t=tok-1";

if (route?.GET) {
  // ---- path-masked link
  let r = await get(MASKED, { "x-nivadesk-client-host": "files.eggcraft.co.uk" });
  expect("masked PDF: 200", r.res.status === 200, String(r.res.status));
  expect("masked PDF: application/pdf (not the HTML viewer)", r.res.headers.get("content-type") === "application/pdf", r.res.headers.get("content-type") ?? "");
  expect("masked PDF: the bytes themselves", r.body.equals(PDF), r.text.slice(0, 80));
  expect("masked PDF: no <iframe>, no storage address in the response", !r.text.includes("<iframe") && !r.text.includes("firebasestorage"));
  expect("masked PDF: inline under its own name", r.res.headers.get("content-disposition") === `inline; filename="Catalogue 2026.pdf"; filename*=UTF-8''Catalogue%202026.pdf`, r.res.headers.get("content-disposition") ?? "");
  expect("masked PDF: no-store, noindex, nosniff", /no-store/.test(r.res.headers.get("cache-control") ?? "") && r.res.headers.get("x-robots-tag") === "noindex, nofollow" && r.res.headers.get("x-content-type-options") === "nosniff");
  expect("masked PDF: the bytes were fetched by the server from Storage", r.calls.length === 1 && r.calls[0].url === "https://firebasestorage.googleapis.com/v0/b/eggcraft-studio.appspot.com/o/companies%2Fws1%2Fclient_files%2Fo1%2FCatalogue%202026.pdf?alt=media&token=tok-1", JSON.stringify(r.calls));
  expect("masked PDF: length passed on", r.res.headers.get("content-length") === String(PDF.length));
  r = await get(MASKED, { range: "bytes=0-9" });
  expect("masked PDF: a Range request is passed on and answered 206", r.calls[0]?.range === "bytes=0-9" && r.res.status === 206 && r.res.headers.get("content-range") === `bytes 0-9/${PDF.length}` && r.body.length === 10, `${r.res.status} ${JSON.stringify(r.calls)}`);
  r = await get(MASKED.replace("Catalogue%202026.pdf", "Fiyat%20listesi%20%C3%87.pdf"));
  expect("masked PDF: a non-ASCII name keeps its UTF-8 form", r.res.headers.get("content-disposition") === `inline; filename="Fiyat listesi _.pdf"; filename*=UTF-8''Fiyat%20listesi%20%C3%87.pdf`, r.res.headers.get("content-disposition") ?? "");
  r = await get(MASKED.replace("Catalogue%202026.pdf", "bad%22name%0D.pdf"));
  expect("masked PDF: quotes and line breaks cannot reach the header", !/["\r\n]/.test((r.res.headers.get("content-disposition") ?? "").split("filename=")[1]?.slice(1, -1).split('";')[0] ?? "x") && !/\r|\n/.test(r.res.headers.get("content-disposition") ?? ""), r.res.headers.get("content-disposition") ?? "");
  storageStatus = 403;
  r = await get(MASKED, { "x-nivadesk-client-host": "files.eggcraft.co.uk" });
  expect("masked PDF: Storage refuses → an error page, not a broken PDF", r.res.status === 400 && (r.res.headers.get("content-type") ?? "").startsWith("text/html") && r.text.includes("Could not load this file right now."));
  expect("masked PDF: a branded host's error page has no NivaDesk name", !r.text.includes("NivaDesk"));
  storageStatus = 200;
  r = await get(`${MASKED}&dl=1`);
  expect("masked PDF ?dl=1: still a download (attachment)", /^attachment;/.test(r.res.headers.get("content-disposition") ?? ""), r.res.headers.get("content-disposition") ?? "");
  r = await get("/f/companies/ws1/client_files/o1/ring.png?b=eggcraft-studio.appspot.com&t=tok-1");
  expect("masked image: still the HTML viewer (img + Download)", (r.res.headers.get("content-type") ?? "").startsWith("text/html") && r.text.includes("<img ") && r.text.includes("dl=1") && r.calls.length === 0);
  r = await get("/f/companies/ws1/client_files/o1/clip.mp4?b=eggcraft-studio.appspot.com&t=tok-1");
  expect("masked video: still the HTML viewer", r.text.includes("<video ") && r.calls.length === 0);

  // ---- short link
  r = await get("/f/aB9xK2.pdf", { "x-nivadesk-client-host": "files.eggcraft.co.uk" });
  expect("short PDF: application/pdf inline, the bytes", r.res.status === 200 && r.res.headers.get("content-type") === "application/pdf" && r.body.equals(PDF) && /^inline;/.test(r.res.headers.get("content-disposition") ?? ""), `${r.res.status} ${r.res.headers.get("content-type")}`);
  expect("short PDF: the mapping was asked (meta=1), then Storage — never the viewer HTML", r.calls.length === 2 && r.calls[0].url === `${FN}?id=aB9xK2&meta=1` && r.calls[1].url.startsWith(STORAGE), JSON.stringify(r.calls.map(c => c.url)));
  expect("short PDF: no storage address in the response", !r.text.includes("firebasestorage"));
  r = await get("/f/aB9xK2");
  expect("short link with no extension, mapping says PDF: inline", r.res.headers.get("content-type") === "application/pdf" && r.body.equals(PDF));
  r = await get("/f/aB9xK2.pdf", { range: "bytes=0-9" });
  expect("short PDF: Range passed on, 206", r.res.status === 206 && r.calls[1]?.range === "bytes=0-9");
  r = await get("/f/aB9xK2.png");
  expect("short image link: one call, the function's viewer HTML as before", r.calls.length === 1 && r.calls[0].url === `${FN}?id=aB9xK2` && (r.res.headers.get("content-type") ?? "").startsWith("text/html") && r.text.includes("viewer for aB9xK2"), JSON.stringify(r.calls.map(c => c.url)));
  r = await get("/f/aB9xK2.png", { "x-nivadesk-client-host": "files.eggcraft.co.uk" });
  expect("short image link on a branded host: brand=0 still passed", r.calls[0]?.url === `${FN}?id=aB9xK2&brand=0`);
  const savedMeta = meta;
  meta = { ...savedMeta!, fileName: "photo.jpg", path: "companies/ws1/client_files/o1/photo.jpg" };
  r = await get("/f/aB9xK2");
  expect("short link with no extension, mapping says image: the viewer HTML", (r.res.headers.get("content-type") ?? "").startsWith("text/html") && r.calls.at(-1)?.url === `${FN}?id=aB9xK2`);
  meta = null; metaStatus = 404;
  r = await get("/f/aB9xK2.pdf");
  expect("short PDF that has expired: the function's own page (404), nothing streamed", r.res.status === 404 && !r.calls.some(c => c.url.startsWith(STORAGE)) && (r.res.headers.get("content-type") ?? "").startsWith("text/html"), `${r.res.status} ${JSON.stringify(r.calls.map(c => c.url))}`);
  meta = savedMeta; metaStatus = 200;
  r = await get("/f/aB9xK2.pdf?dl=1");
  expect("short PDF ?dl=1: still a download (attachment)", /^attachment;/.test(r.res.headers.get("content-disposition") ?? ""));
}

// ---- source: no PDF iframe left in the viewer
const code = source.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
expect("the route no longer puts a PDF in an <iframe>", source.length > 0 && !/<iframe/.test(code));
expect("the route exports only GET and its config (Next.js route rule)", source.length > 0 && [...code.matchAll(/^export\s+(?:async\s+)?(?:const|function)\s+(\w+)/gm)].map(m => m[1]).sort().join(",") === "GET,dynamic,runtime");

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nfile-viewer-pdf: ${checks - failures}/${checks} passed${failures ? `, ${failures} FAILED` : ""}`);
process.exit(failures ? 1 : 0);
