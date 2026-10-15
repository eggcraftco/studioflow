# Web: "Login"/loading hang in a private window (15 Oct 2026)

Owner report: in a private window, after signing in, moving between menus shows the loading card
("Loading your workspace… / Checking your account access.") for a long time; a refresh opens at once.
Treated as a separate defect from the 14 Oct list-download delay (df63a7cd, live in ffe0d065).

Branch `web-login-hang-2026-10-15` off live main `ffe0d065`.

## Stages and how they are timed

Every stage leaves a local mark (`performance.mark("nv:…")` + a row in `window.__nvBoot`, nothing is sent):

| stage | marks | what it waits for |
|---|---|---|
| A — session | `auth:wait` → `auth:state` → (`auth:bootstrap-start/end`) → `auth:ready` | Firebase Auth restoring the session (an `accounts:lookup`, a token refresh when expired) and, on the first sign-in in a browser, `ensurePersonalWorkspace` |
| B — workspace / membership | `ws:start n` → `ws:end n ok/err`, `ws:access-watch cache/server` | `loadWorkspaceContext` (users doc, workspace doc, membership), accessWatch's first server snapshot |
| C — page data | `page:wait-start` → `page:wait-end` (LoadingScreen on/off), `page:stall-shown`, `fs:restart` | the screen's own reads |
| nav | `nav:click` → `nav:path` | route change (RSC fetch) |

## Isolated measurement

`demo-nivadesk-login15` (auth 9415, firestore 8415, web `next start` 3415) behind a TCP proxy (3515/9515/8515,
control 7515) that adds latency (30 ms one-way), injects the live `X-Content-Type-Options: nosniff`, and can
drop (offline), hang (dead path) or freeze only Firestore Write-stream connections. Rules = live 05dd212c.
1500 orders (~6.4 MB) + 400 customers. Engines: Chromium = chrome-headless-shell (separate binary, never
Chrome.app) in an incognito browser context; WebKit = WKWebView with a non-persistent data store (Safari's
private-window storage model). Tools: scratchpad `login/tools/` (`run.mjs`, `matrix.sh`, `proxy.mjs`,
`wkdrive.swift`, `sum.py`).

## Root cause per stage (evidence)

- **A — first sign-in waits for a write acknowledgement (both engines, deterministic).** A private window never
  has `nv_ws_ready_<uid>`, so `AuthProvider` blocks on `ensurePersonalWorkspace`, which awaited `setDoc` of a
  profile refresh (email / name / photo on `users/<uid>`, missing fields on the own workspace). A write resolves
  only on the server's acknowledgement: with the Write path dead the sign-in stayed on "Checking your account
  access." for the whole 75 s window; healed, it opened in ~1 s.
- **A — session restore waits on the auth endpoint.** Expired ID token + auth endpoint not answering: Firebase's
  own 30 s timeout, then the reads; the full-screen card stayed ~70 s (both engines).
- **C — a read stream that stops answering (isolated stack).** After a 4 s connection drop the Listen backchannel
  came back without data (requests out, nothing in); every later screen stayed on the loading card 60 s+ until a
  refresh. Window "online" (Firestore's own stream restart, reads keep waiting for the server) healed it in 1.4 s.
  In WebKit the stream also went quiet for ~30 s without any drop (no bytes, no new connections, no main-thread
  gaps) — on the emulator's HTTP/1.1 channel; production speaks HTTP/2, so this part is not proven live.
- **B** was never the long stage: 2–20 ms per menu (its docs are kept current by AuthProvider's listeners), except
  where it queued behind the stalled stream above.

## Fix

1. `LoadingScreen` (every wait shows it): at 6 s one quiet Firestore stream restart (`window` "online"; at most
   every 20 s, never while the browser says offline); at 12 s **Retry** (fresh load = the refresh that worked) and
   **Sign in again** (push unregister, sign-out, cache clear — each on a 2.5–3 s budget — then `/login`). Offline
   says so. 12 languages (`bootRecoveryTranslations.ts`).
2. `ensurePersonalWorkspace` waits only for a write the screens need (no user doc / no workspace pointer / no
   workspace); profile refreshes run in the background.
3. The stage marks above, and `scripts/nv-login-timings.js` for a live check.

## Timings, isolated stack (before = ffe0d065 + marks, after = this branch)

Time until the screen is usable, or until the Retry / Sign in again panel is on screen. "≥60 s" = the run's
limit, still loading. Private context per run; 30 ms one-way latency; machine shared with other builds.

| scenario | Chromium before | Chromium after | WebKit before | WebKit after |
|---|---|---|---|---|
| sign-in → Home (first sign-in in the window) | 0.8–1.0 s | 0.8 s | 0.9–1.5 s (once 30.7 s: B 29.8 s) | 0.8–1.0 s |
| 10 menus without refresh | 0.05–2.4 s | 0.05–1.9 s | 0.07–1.9 s; first Orders ≥60 s in 3 of 11 runs | same; a stall ends in the panel at 12.2 s |
| deep URL /orders/ord5 · full load /schedule | 0.8 · 1.7 s | 0.7 · 1.5 s | 1.9 s · ≥60 s | 1.1 s · panel 12.6 s |
| new tab /customers | 0.7 s | 0.7 s | ≥60 s (stall) | 1.2 s |
| back after 330 s hidden/frozen (3 menus) | 1.5 · 2.1 · 0.1 s | 1.0 · 0.9 · 0.1 s | 1.3 · 1.7 · 0.1 s | 1.0 · 0.9 · 0.1 s |
| ID token expired (menus · reload) | 0.5–0.7 · 1.2 s | 0.5 · 1.2 s | 0.9–2.3 · 2.1 s | 0.6–1.2 · 1.8 s |
| account disabled + token expired | login form 0.4 s | 0.4 s | 0.4 s | 0.4 s |
| token expired + auth endpoint dead (reload) | 70.8 s card (A 30.3 s, B 9.7 s) | panel 12.2 s | 70.7 s card | panel 12.2 s |
| 4 s connection drop, next two menus | ≥60 s · ≥60 s | 7.1 s · 0.7 s | ≥60 s · ≥60 s | panel 12.2 s |
| Firestore dead 25 s / 75 s | 0.2–0.8 s (cache) | same | 0.4–0.9 s | same |
| write path dead at first sign-in | ≥75 s card | 0.8 s | ≥75 s card | 0.8 s |
| panel buttons, read path dead | — | Retry reloads 0.15 s; Sign in again → login form 0.21 s | — | 0.37 s; 0.18 s |

Stage B (workspace + membership) stayed 2–500 ms in every run except when it queued behind a stalled stream.

## Live check (owner) — `scripts/nv-login-timings.js`

Reads only the page's own timeline and the screen; sends and stores nothing; prints URLs without query strings.

**Chrome (gizli pencere):**
1. Yeni Gizli pencere (⌘⇧N) → `https://nivadesk.app/login` — henüz giriş yapma.
2. ⌥⌘J ile Console. Chrome yapıştırmayı engellerse `allow pasting` yazıp Enter.
3. `scripts/nv-login-timings.js` dosyasının tamamını yapıştır → Enter ("recording" yazmalı).
4. Kendin giriş yap. Sonra menüler: Orders → Customers → Notes → Dashboard → Schedule → Settings → Orders.
   Bekleme uzarsa yenileme yapma, en çok 60 sn bekle.
5. Console'a `nvReport()` → Enter. Tablolar basılır, rapor panoya kopyalanır; panodakini mesajla gönder.
6. İsteğe bağlı: ⌘R ile yenile, snippet'i yeniden yapıştır, iki menü gez, `nvReport()` (yenileme sonrası kıyas).

**Safari (özel pencere):**
1. Bir kez: Safari ▸ Ayarlar ▸ Gelişmiş ▸ "Web geliştiricileri için özellikleri göster".
2. Dosya ▸ Yeni Özel Pencere (⇧⌘N) → `https://nivadesk.app/login`.
3. Geliştir ▸ JavaScript Konsolunu Göster (⌥⌘C) → snippet'i yapıştır → Enter. Sonra 4–6 aynı.

Reading the result: long `loading(...)` rows with short `stage B` rows and slow `net firestore-read request`
rows = stage C (stream); a long `stage A: signed in -> app may open` = stage A; `net auth` / `net token-refresh`
rows of 30 s = the auth endpoint. Once this branch is live the table also shows `fs:restart` and the Retry panel.
