// A build wrapper that exists to answer one question: where does the deploy die?
//
// Three deployments in a row failed on Hostinger after about eight minutes and
// fifteen to twenty-four seconds, with ZERO build-log lines — while the same
// commit builds from a fresh clone in about two minutes locally, and passes
// even with a 1 GB heap cap. Zero lines is the part that matters: it means we
// cannot tell whether `next build` ever started.
//
// So this prints before it does anything. If the deployment log shows
// NEXT_BUILD_START, the pipeline reached the build command and the problem is
// the build or what comes after it. If it shows nothing at all, the pipeline
// never got here and the checkout or the install is where it dies — which
// would clear the application code entirely.
//
// It runs the real `next build`, so a deploy that succeeds is a real deploy.
// That is deliberate: a no-op probe would answer the same question, but if it
// succeeded it would publish an empty .next over a working site.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { getHeapStatistics } from "node:v8";
import { cpus } from "node:os";

const started = Date.now();
const stamp = () => new Date().toISOString();
const elapsed = () => `${Math.round((Date.now() - started) / 1000)}s`;

console.log("NEXT_BUILD_START", JSON.stringify({
  time: stamp(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cwd: process.cwd(),
  heapLimitMb: Math.round(getHeapStatistics().heap_size_limit / 1048576),
  cpus: cpus().length,
  nodeOptions: process.env.NODE_OPTIONS || ""
}));

/** The child's resident memory, which is what an OOM killer actually watches.
 *  The wrapper's own footprint says nothing useful. */
function childRssMb(pid) {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
    return match ? Math.round(Number(match[1]) / 1024) : null;
  } catch {
    return null;   // not Linux, or the process is gone
  }
}

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: process.env
});

// Every 20 seconds, so a build killed at eight minutes leaves about two dozen
// data points showing whether memory was climbing or the process simply stopped.
const heartbeat = setInterval(() => {
  console.log("NEXT_BUILD_HEARTBEAT", JSON.stringify({
    at: elapsed(),
    childRssMb: childRssMb(child.pid),
    wrapperRssMb: Math.round(process.memoryUsage().rss / 1048576)
  }));
}, 20_000);

child.on("error", (error) => {
  clearInterval(heartbeat);
  console.log("NEXT_BUILD_SPAWN_FAILED", JSON.stringify({ at: elapsed(), message: String(error?.message || error) }));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  clearInterval(heartbeat);
  // A signal here is the whole answer: SIGKILL means something outside the
  // process ended it, which is an OOM killer or a watchdog, not a build error.
  console.log("NEXT_BUILD_EXIT", JSON.stringify({ at: elapsed(), code, signal }));
  process.exit(code ?? (signal ? 1 : 0));
});
