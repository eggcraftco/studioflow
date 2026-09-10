# Raw records — eBay sandbox step 2, the sixteen functions (10 September 2026)

Behind `../ebay-sandbox-backend-2026-09-10.md`. Pattern-scanned before copying: no secret, token, credential or personal data (log bodies are HTTP status lines and the sweep's own log text).

| File | Bytes | SHA-256 | What it is |
|---|---:|---|---|
| `chain-16-deploy.log` | 7,703 | `2d95ae56f6cae865c204ac5b25f0f500b02333778a0f3cec0dc83e1e8abf59f4` | pre-checks + the CLI output for the sixteen (11:43:25Z → 11:45:54Z) + read-back |
| `chain-16-deploy.sh` | 2,355 | `03133c0be38e327f03f4a0326f6f120e00dde2a91be402aac0aebfb4167d457b` | the deploy chain as run |
| `firestore-rules-live-f7e615d0.rules` | 55,157 | `3bf0822fbade6a242ddfd98513a5e75b72c90c628272489027700c97ef12b59f` | the live Firestore ruleset f7e615d0 (released 2026-09-04T15:04:56Z), read through the Rules API |
| `firestore-rules-live-vs-head.diff` | 3,803 | `cbb261713c3f4f8ccba56a950aec56b6f0e30e856970f1ea84c5705c3b41562a` | unified diff live → HEAD firestore.rules (+45/−0: 36 eBay lines + the 9-line fileScans block) |
| `reconcileebayconnections-first-run-1200Z.json` | 2,738 | `fc15aeb40bbe6570845623b97bab76601797e203990bf562a3629a2ae9d44fd8` | the two log entries of the 15-minute sweep first run: HTTP 200 from Cloud Scheduler and "connector off" |
| `verify-16-run1.log` | 5,237 | `11bb3985747e2eb1b5446f6cd67803973ca9f7387ae4b6d1f370f32682e93728` | services table, scheduler jobs, refusal probes, logs (11:46–11:47Z) |
| `verify-16.sh` | 4,548 | `05e8ee56f0f2af16a2d39606cecd3d0cdb38d274c94078a381fcd57241381f77` | the verification script |
| `watch-sweeps.log` | 3,593 | `5aad90d34b8d268e300716e1da979b69a0ae77928eff1d48cab5febc56ddbec9` | polls 11:49–11:55Z incl. the deletion sweep first run (its stop condition also counted the operator probe — harmless) |
| `watch-sweeps.sh` | 1,782 | `b2a3b099df65745d9d363580702f2eb8a819432814ecd18427957b1d152eb2d8` | the first scheduler watch |
