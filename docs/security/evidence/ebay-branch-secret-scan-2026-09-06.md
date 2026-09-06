# eBay branch — credential and personal-data scan, 6 September 2026

Run before the checkpoint push of `ebay-connector`, over the whole branch: 26 commits, 75 files,
11,410 added lines, diffed against the merge base with `macbook-save-before-macstudio-2026-06-01`.

## What was searched

Every added line was matched against thirteen patterns: eBay production and sandbox keyset ids, eBay
user and application tokens, AWS access keys, Google API keys, Slack tokens, Stripe keys, private-key
blocks, JSON web tokens, bearer and basic authorization literals, assignments to any name containing
secret, cert id, api key, access token, refresh token, password, verification token, hash key or
token key, URLs carrying inline credentials, and any hexadecimal or base64 run of forty characters or
more. The file list was checked separately for `.env`, `.pem`, `.p12`, `.key` and the secrets marker.
Fixtures and tests were checked for real e-mail addresses, telephone numbers and postal addresses.

## Result

| Check | Result |
|---|---|
| Keyset ids (App ID, Cert ID, sandbox or production) | none |
| Tokens, keys, JWTs, authorization literals | none |
| Private-key material | none — the notification test generates an EC P-256 pair at run time |
| Secret-shaped assignments | none; every credential is read through `defineSecret` or `process.env` |
| Files: `.env`, `.pem`, `.p12`, `.key`, `functions/.ebay-secrets-ready` | none committed (the marker is created by hand on the deploying machine) |
| Long hex or base64 runs | nine matches, eight of them documentation paths broken by slashes; the ninth is dealt with below |
| E-mail addresses in fixtures | `example.com` only |
| Telephone numbers in fixtures | `07700 900xxx` and `+44 7700 900000` — Ofcom's reserved fiction range |
| Postal addresses in fixtures | invented (`10 Analytical Way, London N1 1AA`) |

## The one value worth naming

`functions/test/qa/commerce-ebay-notification.test.js` and
`functions/test/e2e/ebay-account-deletion-emulator.test.js` carry
`username: "test_user"` / `userId: "ma8vp1jySJC"` / a base64 `eiasToken`. These are eBay's own
published sample values from the Marketplace Account Deletion documentation, not a captured buyer.
Both files now carry a comment saying so, and the connector never reads `eiasToken` at all.

## Verdict

**Clean.** Nothing in the branch is a credential, and nothing in it is a real person's data. The
three approval gates — RuName registration, secret wiring, notification destination and the first
real connection — remain closed, and no value belonging to any of them exists anywhere in this
repository.
