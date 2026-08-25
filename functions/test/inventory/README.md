# Inventory tests

Two kinds, both runnable from `functions/`.

**Pure money rules — no emulator needed.**

```
node test/inventory/money-rules.test.js
node test/inventory/reservations.test.js
node test/inventory/spreadsheet.test.js
node test/inventory/opening-roundtrip.test.js
```

`spreadsheet.test.js` covers reading a pasted list: tab, comma and semicolon
delimiters, quoted fields with commas and newlines inside them, and numbers in
both `£1,250.50` and `1.250,50` form. That code lives on the server precisely so
there is one of it — written once per platform, a name like `Strap, brown` would
have three chances to break on one client only.

`opening-roundtrip.test.js` guards the shape of what the preview returns: the
rows a person approves go straight back to the import, so a "display shape"
would quietly write counted items with zero stock.

These load `inventory.js` against a fake Firestore. Fast, but a fake cannot
enforce everything a real one does: the read-before-write rule and nested-map
merge semantics both slipped past it, which is why the tests below exist.

**End to end against the Firebase emulators.**

```
# repo root, with a JDK on PATH
firebase emulators:start --only auth,firestore,functions --project eggcraft-studio

# then, from functions/
node test/inventory/seed-emulator.js > test/inventory/seed-out.json
node test/inventory/e2e.mjs
node test/inventory/opening-stock.mjs
node test/inventory/bank-match.test.js
```

These sign in as a test workspace with a custom token — no password anywhere —
and call the running functions over HTTP exactly as a client does. Each run
expects a clean database:

```
curl -X DELETE "http://127.0.0.1:8080/emulator/v1/projects/eggcraft-studio/databases/(default)/documents"
curl -X DELETE "http://127.0.0.1:9099/emulator/v1/projects/eggcraft-studio/accounts"
```

**Seeing the screens.** The web app connects to the emulators with
`npm run dev:emulator` (or `build:emulator` + `start:emulator`) and only when
served from localhost. The Apple app connects when launched with
`NIVADESK_USE_EMULATOR=1` in a DEBUG build; Android when a
`nivadesk-emulator.txt` marker (host on line 1, custom token on line 2) sits in
its files directory, again DEBUG only.
