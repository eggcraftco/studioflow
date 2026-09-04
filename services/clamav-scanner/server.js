"use strict";

// The HTTP front for clamd.
//
// Two ways in:
//
//   POST /scan   {bucket, name, generation}   — scan an object by reference.
//                The scanner fetches the object from Cloud Storage itself and
//                streams it into clamd, so nothing about the file's size passes
//                through a Cloud Run request body (32 MiB cap) or through the
//                caller's memory. This is the one the trigger uses.
//
//   POST /       <raw bytes>                  — scan bytes. Kept for the staging
//                script and for proving the scanner works without a bucket.
//
// Two things this must never do. It must never answer "clean" because it could
// not reach clamd — an unreachable scanner is a 503, and the caller treats that
// as a held file. And it must never answer at all until clamd has its
// signatures loaded, because a scanner with an empty database finds nothing and
// calls everything clean.
//
// And one thing it never writes down: the object's name. A customer's filename
// is usually the name of a person, and this service's logs are a second place
// for it to end up. Errors are reported by class, not by path.
const http = require("http");
const net = require("net");
const { Readable } = require("stream");

const PORT = Number(process.env.PORT) || 8080;
// The official ClamAV image runs clamd on a unix socket, not TCP. Connecting to
// 127.0.0.1:3310 got a refusal on every attempt, so the startup probe never
// went green and the revision never took traffic — which is the failure mode
// working exactly as intended, just for the wrong reason.
const CLAMD_SOCKET = process.env.CLAMD_SOCKET || "/tmp/clamd.sock";
const CLAMD_HOST = process.env.CLAMD_HOST || "";
const CLAMD_PORT = Number(process.env.CLAMD_PORT) || 0;

/** The socket to clamd: the unix one this image provides, or TCP if configured. */
function connectToClamd() {
  return CLAMD_HOST && CLAMD_PORT
    ? net.createConnection({ host: CLAMD_HOST, port: CLAMD_PORT })
    : net.createConnection({ path: CLAMD_SOCKET });
}
// Matches the largest upload storage.rules accepts, so that no file a customer
// is allowed to upload is one the scanner refuses to look at. A refused file is
// a held file, and holding every large upload for ever is not a control, it is
// an outage. clamd's own StreamMaxLength is set above this in the Dockerfile.
const MAX_BYTES = Number(process.env.MAX_SCAN_BYTES) || 210 * 1024 * 1024;
const CLAMD_TIMEOUT_MS = Number(process.env.CLAMD_TIMEOUT_MS) || 240000;
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 240000;
const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

/**
 * Streams a readable into clamd's INSTREAM and resolves with clamd's reply.
 *
 * INSTREAM is length-prefixed chunks terminated by a zero-length one. The
 * byte counter is the cap: past it the stream is abandoned and the result is
 * too_large, whatever clamd would have said. That is what makes a gzip-encoded
 * object safe — Cloud Storage inflates it on the way out, and the counter sees
 * the inflated bytes.
 */
function scanStreamWithClamd(source, limit) {
  return new Promise((resolve, reject) => {
    const socket = connectToClamd();
    let reply = "";
    let total = 0;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (source && typeof source.destroy === "function") source.destroy();
      fn(value);
    };

    socket.setTimeout(CLAMD_TIMEOUT_MS, () => finish(reject, new Error("clamd_timeout")));
    socket.on("error", (error) => finish(reject, error));
    socket.on("data", (chunk) => { reply += chunk.toString("utf8"); });
    socket.on("end", () => finish(resolve, reply.trim()));
    // clamd may answer (and close) before the whole stream has been sent, e.g.
    // when its own limit trips. Treat that as a reply, not a broken pipe.
    socket.on("close", () => { if (reply) finish(resolve, reply.trim()); });

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      source.on("data", (chunk) => {
        total += chunk.length;
        if (total > limit) { finish(reject, new Error("too_large")); return; }
        const size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length, 0);
        // Back-pressure: pause the source while clamd's socket drains.
        if (!socket.write(Buffer.concat([size, chunk]))) {
          source.pause();
          socket.once("drain", () => source.resume());
        }
      });
      source.on("end", () => { if (!settled) socket.write(Buffer.from([0, 0, 0, 0])); });
      source.on("error", (error) => finish(reject, error));
    });
  });
}

/** Is clamd up and holding signatures? Used by readiness, not by scanning. */
function clamdReady() {
  return new Promise((resolve) => {
    const socket = connectToClamd();
    let reply = "";
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(5000, () => done(false));
    socket.on("error", () => done(false));
    socket.on("data", (chunk) => {
      reply += chunk.toString("utf8");
      if (reply.includes("PONG")) done(true);
    });
    socket.on("connect", () => socket.write("zPING\0"));
  });
}

/** Reads a request body into memory, refusing past `limit` without buffering it. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let total = 0;
    let overflowed = false;
    req.on("data", (chunk) => {
      // Past the cap we drain without keeping anything, so an oversized upload
      // still cannot exhaust this container's memory. What we must NOT do is
      // destroy the socket here: that kills the response along with the
      // request, and the caller sees a dropped connection instead of the
      // too_large verdict. The socket is closed by the handler, after it answers.
      if (overflowed) return;
      total += chunk.length;
      if (total > limit) {
        overflowed = true;
        chunks = [];
        reject(new Error("too_large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => { if (!overflowed) resolve(Buffer.concat(chunks)); });
    req.on("error", (error) => { if (!overflowed) reject(error); });
  });
}

// ── Cloud Storage, by reference ────────────────────────────────────────────

let cachedToken = { value: "", expiresAtMs: 0 };

/** The runtime service account's access token, from the metadata server, cached. */
async function accessToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAtMs - 60000) return cachedToken.value;
  const response = await fetch(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) throw new Error(`metadata_token_${response.status}`);
  const body = await response.json();
  cachedToken = { value: String(body.access_token || ""), expiresAtMs: Date.now() + (Number(body.expires_in) || 0) * 1000 };
  if (!cachedToken.value) throw new Error("metadata_token_empty");
  return cachedToken.value;
}

/**
 * Opens the object as a stream, pinned to one generation.
 *
 * Returns {status: "gone"} for a generation that no longer exists — an
 * overwrite or a delete since the event fired — and a stream otherwise. The
 * Content-Length check refuses an obviously oversized object before a byte is
 * read; the counter in scanStreamWithClamd catches the ones that lie.
 */
async function openObject({ bucket, name, generation }) {
  const token = await accessToken();
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`
    + `?alt=media&generation=${encodeURIComponent(generation)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
  if (response.status === 404) { clearTimeout(timer); return { status: "gone" }; }
  if (!response.ok) { clearTimeout(timer); throw new Error(`fetch_${response.status}`); }
  const declared = Number(response.headers.get("content-length")) || 0;
  if (declared > MAX_BYTES) { clearTimeout(timer); controller.abort(); return { status: "too_large" }; }
  const stream = Readable.fromWeb(response.body);
  stream.on("close", () => clearTimeout(timer));
  return { status: "open", stream, declared };
}

// ── HTTP ───────────────────────────────────────────────────────────────────

const send = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
};

/** clamd's reply, as a verdict body. */
function verdictFromReply(reply) {
  if (/size limit exceeded/i.test(reply)) return { code: 200, body: { status: "too_large" } };
  if (/\bOK\b/.test(reply) && !/FOUND/.test(reply)) return { code: 200, body: { status: "clean" } };
  const found = reply.match(/stream:\s*(.+?)\s+FOUND/);
  if (found) return { code: 200, body: { status: "infected", signature: found[1].slice(0, 120) } };
  // clamd answered something neither OK nor FOUND — an error string, a
  // truncated reply. Not a pass.
  return { code: 503, body: { status: "scanner_error", detail: reply.slice(0, 200) } };
}

function verdictFromFailure(error) {
  const message = String((error && error.message) || error);
  if (message === "too_large") return { code: 200, body: { status: "too_large" } };
  // Unreachable, timed out, socket died. 503 so the caller retries and, if it
  // keeps failing, holds the file. The detail is the error's class, never
  // anything that could name the object.
  return { code: 503, body: { status: "scanner_unavailable", detail: message.replace(/[^A-Za-z0-9_ ]/g, "").slice(0, 80) } };
}

async function handleScanByReference(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8") || "{}");
  } catch {
    return send(res, 400, { status: "bad_request" });
  }
  const bucket = String(body.bucket || "").trim();
  const name = String(body.name || "");
  const generation = String(body.generation || "").replace(/[^0-9]/g, "");
  if (!bucket || !name || !generation) return send(res, 400, { status: "bad_request" });

  let opened;
  try {
    opened = await openObject({ bucket, name, generation });
  } catch (error) {
    const message = String((error && error.message) || error);
    // A fetch the scanner could not make is not a verdict on the file.
    return send(res, 503, { status: "fetch_failed", detail: message.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) });
  }
  if (opened.status !== "open") return send(res, 200, { status: opened.status });
  if (opened.declared === 0) { opened.stream.destroy(); return send(res, 200, { status: "clean", note: "empty file" }); }

  try {
    const reply = await scanStreamWithClamd(opened.stream, MAX_BYTES);
    const { code, body: verdict } = verdictFromReply(reply);
    return send(res, code, verdict);
  } catch (error) {
    const { code, body: verdict } = verdictFromFailure(error);
    return send(res, code, verdict);
  }
}

async function handleScanBytes(req, res) {
  let bytes;
  try {
    bytes = await readBody(req, MAX_BYTES);
  } catch (error) {
    if (String(error.message) === "too_large") {
      // 200, not 413: the caller reads the verdict out of the body, and a
      // non-2xx would collapse "too big to scan" into "scanner broken".
      // Hang up once the answer is on the wire so the rest of the upload stops.
      res.on("finish", () => req.destroy());
      return send(res, 200, { status: "too_large" });
    }
    return send(res, 503, { status: "read_failed" });
  }
  if (!bytes.length) return send(res, 200, { status: "clean", note: "empty file" });
  try {
    const reply = await scanStreamWithClamd(Readable.from([bytes]), MAX_BYTES);
    const { code, body } = verdictFromReply(reply);
    return send(res, code, body);
  } catch (error) {
    const { code, body } = verdictFromFailure(error);
    return send(res, code, body);
  }
}

http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/healthz" || req.url === "/")) {
    const ready = await clamdReady();
    // Not ready is a 503 on purpose: Cloud Run then keeps traffic away from a
    // scanner that would find nothing.
    return send(res, ready ? 200 : 503, { status: ready ? "ready" : "starting" });
  }
  if (req.method !== "POST") return send(res, 405, { status: "method_not_allowed" });
  if (req.url === "/scan") return handleScanByReference(req, res);
  if (req.url === "/") return handleScanBytes(req, res);
  return send(res, 404, { status: "not_found" });
}).listen(PORT, () => console.log(`clamav-scanner listening on ${PORT}`));
