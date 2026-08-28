# NivaDesk — Store Metadata

App: **NivaDesk** · Bundle ID: `uk.co.eggcraft.studioflow` · Vendor: EGGCRAFT LIMITED
Current version: 0.1.3 (Android versionCode 4)

This folder holds ready-to-paste store listing copy for the App Store and Google
Play. Primary locale is **en-US**. All 12 app languages are provided: en-US, tr,
de-DE, fr-FR, it, es-ES, pt-PT, ru, ja, zh-Hans, ar-SA, hi (App Store) and the
matching Play locales (de-DE, fr-FR, it-IT, es-ES, pt-PT, ru-RU, ja-JP, zh-CN,
ar, hi-IN). Translated from the en-US masters — keep them in sync when the
English copy changes.

## Character limits (hard limits enforced by the stores)

### Apple App Store Connect
| Field | Limit | File |
|---|---|---|
| App Name | 30 | `app-store/<loc>/name.txt` |
| Subtitle | 30 | `app-store/<loc>/subtitle.txt` |
| Promotional Text | 170 | `app-store/<loc>/promotional_text.txt` |
| Description | 4000 | `app-store/<loc>/description.txt` |
| Keywords (comma-separated, no spaces) | 100 | `app-store/<loc>/keywords.txt` |
| What's New | 4000 | `app-store/<loc>/release_notes.txt` |

### Google Play Console
| Field | Limit | File |
|---|---|---|
| Title | 30 | `google-play/<loc>/title.txt` |
| Short description | 80 | `google-play/<loc>/short_description.txt` |
| Full description | 4000 | `google-play/<loc>/full_description.txt` |

Run `scripts/check-limits.sh` (in this folder) to verify every file is within its
limit before pasting.

## Screenshot plan

Capture on the largest required device per store, then downscale.

Apple required sizes: 6.7" iPhone (1290×2796) and 12.9" iPad (2048×2732).
Google Play: phone (min 1080px short edge), plus a 7"/10" tablet set.

Suggested 6-shot story (same order on both stores), with caption overlays:

1. **Orders board** — "Every order, every stage — at a glance"
2. **Order detail / workflow steps** — "Workflow steps tuned to your craft"
3. **Financials card** — "Know your real profit after fees & tax"
4. **Schedule & Alerts** — "Reminders that keep promises on time"
5. **Client Files & tasks** — "Files, photos and to-dos on every order"
6. **Team Access / roles** — "Your whole team, the right access"

Caption copy for all 6, localized to en-US and tr, lives in
`screenshots/captions.<loc>.txt`. Localize to other languages from these.

Notes:
- Use real-looking but non-sensitive demo data (the in-app Free Demo workspace is ideal).
- Keep the status bar clean (full battery, no carrier name, 9:41 on iOS).
- Dark-mode variants are optional but on-brand (premium silver NivaDesk logo).
