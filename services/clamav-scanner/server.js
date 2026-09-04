"use strict";

// The HTTP front for clamd.
//
// POST a file's bytes, get {status: "clean" | "infected" | "too_large", …}.
//
// Two things this must never do. It must never answer "clean" because it could
// not reach clamd — an unreachable scanner is a 503, and the caller treats that
// as a held file. And it must never answer at all until clamd has its
// signatures loaded, because a scanner with an empty database finds nothing and
// calls everything clean.
const http = require("http");
const net = require("net");

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
const MAX_BYTES = Number(process.env.MAX_SCAN_BYTES) || 25 * 1024 * 1024;
const CLAMD_TIMEOUT_MS = Number(process.env.CLAMD_TIMEOUT_MS) || 90000;

/** clamd's INSTREAM: length-prefixed chunks, terminated by a zero-length one. */
function scanWithClamd(buffer) {
  return new Promise((resolve, reject) => {
    const socket = connectToClamd();
    let reply = "";
    const fail = (error) => { socket.destroy(); reject(error); };

    socket.setTimeout(CLAMD_TIMEOUT_MS, () => fail(new Error("clamd_timeout")));
    socket.on("error", fail);
    socket.on("data", (chunk) => { reply += chunk.toString("utf8"); });
    socket.on("end", () => resolve(reply.trim()));

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      const CHUNK = 64 * 1024;
      for (let offset = 0; offset < buffer.length; offset += CHUNK) {
        const slice = buffer.subarray(offset, Math.min(offset + CHUNK, buffer.length));
        const size = Buffer.alloc(4);
        size.writeUInt32BE(slice.length, 0);
        socket.write(size);
        socket.write(slice);
      }
      socket.write(Buffer.from([0, 0, 0, 0]));
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

const send = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
};

http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/healthz" || req.url === "/")) {
    const ready = await clamdReady();
    // Not ready is a 503 on purpose: Cloud Run then keeps traffic away from a
    // scanner that would find nothing.
    return send(res, ready ? 200 : 503, { status: ready ? "ready" : "starting" });
  }
  if (req.method !== "POST") return send(res, 405, { status: "method_not_allowed" });

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
    const reply = await scanWithClamd(bytes);
    if (/\bOK\b/.test(reply) && !/FOUND/.test(reply)) return send(res, 200, { status: "clean" });
    const found = reply.match(/stream:\s*(.+?)\s+FOUND/);
    if (found) return send(res, 200, { status: "infected", signature: found[1] });
    // clamd answered something neither OK nor FOUND — an error string, a
    // truncated reply. Not a pass.
    return send(res, 503, { status: "scanner_error", detail: reply.slice(0, 200) });
  } catch (error) {
    // Unreachable, timed out, socket died. 503 so the caller retries and, if it
    // keeps failing, holds the file.
    return send(res, 503, { status: "scanner_unavailable", detail: String(error.message).slice(0, 120) });
  }
}).listen(PORT, () => console.log(`clamav-scanner listening on ${PORT}`));
