"use client";

// Admin Insights ▸ Browsers (1 Nov 2026): the kind badge and the kind bars, shared by the Browsers page and Live's
// "Browsers" card. Names and colours: lib/studioflow/adminBrowsers.ts.

import { kindInfo } from "@/lib/studioflow/adminBrowsers";

export function BrowserKindBadge({ kind }: { kind: string }) {
  const info = kindInfo(kind);
  return (
    <span className={`admin-browser-badge is-${info.key}`} title={info.hint}>
      <i style={{ background: info.color }} aria-hidden="true" />
      {info.short}
    </span>
  );
}

export function KindBars({ rows, unit }: { rows: { key: string; label: string; color: string; hint: string; value: number; share: number; shareLabel: string; people?: number }[]; unit: [string, string] }) {
  const max = Math.max(1, ...rows.map(row => row.value));
  return (
    <div className="admin-app-rows admin-browser-kinds">
      {rows.map(row => (
        <div key={row.key} className="admin-app-row admin-browser-kind-row" title={row.hint}>
          <span className="admin-app-name"><i style={{ background: row.color }} aria-hidden="true" />{row.label}</span>
          <span className="admin-app-bar" aria-hidden="true"><span style={{ width: `${(row.value / max) * 100}%`, background: row.color }} /></span>
          <strong className="admin-app-value">{row.shareLabel}</strong>
          <span className="admin-browser-kind-count">
            {row.value.toLocaleString()} {row.value === 1 ? unit[0] : unit[1]}
            {typeof row.people === "number" ? ` · ${row.people.toLocaleString()} ${row.people === 1 ? "person" : "people"}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
