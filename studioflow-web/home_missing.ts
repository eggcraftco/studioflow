import { studioT } from "./lib/studioflow/language";
import fs from "fs"; import path from "path";
const files = ["app/home/page.tsx","components/home/HomeCardShell.tsx","components/home/HomeCardBodies.tsx","lib/studioflow/homeCards.ts"];
const keys = new Set<string>();
for (const f of files) {
  const s = fs.readFileSync(path.join(process.cwd(), f), "utf8");
  for (const m of s.matchAll(/t\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(m[1]);
  for (const m of s.matchAll(/(?:title|linkLabel|label|blurb|cta):\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(m[1]);
}
const bad = [...keys].filter(k => k.trim() && studioT(k, "Türkçe") === k);
fs.writeFileSync("/tmp/home_new.txt", bad.join("\n"));
console.log(`anahtar ${keys.size}, cevrilmemis ${bad.length}`);
bad.forEach(b => console.log("  -", b));
