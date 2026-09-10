# Raw records — eBay sandbox rollout step 1 (10 September 2026)

Behind `../ebay-sandbox-rollout-2026-09-10.md`. No secret value, token or credential appears in any file (checked with a pattern scan before copying; the helper script contains only regexes).

| File | Bytes | SHA-256 | What it is |
|---|---:|---|---|
| `chain-worker-deploy.log` | 6,480 | `ab02f0c056bac9aae1bfcd9b9fbd70e03a807f5f56cc5bfba123b5c2074b4708` | the deploy chain (11:02:17Z → stopped 11:13Z): Cert ID write (metadata line only), six-version gate, marker, env names, pre-checks, the CLI output up to the reauthentication wall |
| `chain-worker-deploy.sh` | 5,914 | `e8e6093dc34baa431a317a40c889dd2e6f9a4938691d4883d99b54ed548e103a` | the chain script as run |
| `secret-from-clipboard.sh` | 1,362 | `9e444b1abd163d850a7fbe41d86bce07c64047c41a2bf0ad4b34c6c817bfa53c` | the clipboard → Secret Manager helper: shape regexes and length bounds only, never prints a value |
| `tests-ab.sh` | 3,801 | `fbc7326dd3e9bf87594e4fbae9e98f56db7ac2076a08aabb60a4f423a17a475d` | the test script as run in run 2 (run 1 differed only in the reserved id and labels) |
| `tests-run1-2026-09-10T1118Z.log` | 1,703 | `68cca8e0a170c13b754d077bf7f60d12ba0216d8007ecc2be5aa42ffa4108efa` | delivery tests, run 1: A → 403 (propagation), A-compute → 500 reserved-id |
| `tests-run2-2026-09-10T1121Z.log` | 1,892 | `4ea72acb601991f5b8115cc0c6ce54e759c9eb99b2b2dc5d43821a273b52be67` | delivery tests, run 2: A2 and A2-compute → 500 + connection_missing, Firestore side-effect check zero |
