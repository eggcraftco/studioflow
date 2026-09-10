# eBay sandbox RuName — registered 6 September 2026

Created in the eBay developer portal under the operator's explicit approval, on the **sandbox**
keyset only. Nothing else in the portal was touched: no production keyset, no Cert ID, no
notification destination, no OAuth connection.

## What exists now

| Field | Value |
|---|---|
| Environment | Sandbox |
| Keyset (App ID / Client ID) | `EGGCRAFT-NivaDesk-SBX-05fd51f72-0f019961` |
| **RuName (eBay Redirect URL name)** | `EGGCRAFT_LIMITE-EGGCRAFT-NivaDe-nerasfwi` |
| Display title | `NivaDesk` |
| Auth accepted URL | `https://nivadesk.app/ebay/callback` |
| Auth declined URL | `https://nivadesk.app/settings?section=ebay&ebay=cancelled` |
| Privacy policy URL | `https://nivadesk.app/privacy` |
| OAuth enabled | yes |

The RuName is an identifier, not a credential: it is sent in the clear as the `redirect_uri` of every
authorize URL. It is the value the server reads as `NIVADESK_EBAY_RUNAME` while
`NIVADESK_EBAY_ENVIRONMENT` is `sandbox`. The production keyset will have a different one.

## Verified after saving

The page was reloaded and the row re-read: display title `NivaDesk`, OAuth enabled, and the three
URLs exactly as above — the accepted URL 34 characters, the declined URL 57, the privacy URL 28, none
truncated by the form.

## Two notes for whoever reads this next

- **Application branding is off**, so the Auth'n'Auth / OAuth radio under "Your eBay Sign-in
  Branding" has no effect on our flow. The connector builds its own authorize URL and passes the
  RuName as `redirect_uri`; the OAuth sign-in URL exists for this RuName either way.
- **The accepted URL is not live yet.** `nivadesk.app/ebay/callback` exists only on the
  `ebay-connector` branch, so a real consent attempt would land on a 404 until the web deploy in
  `docs/ebay-web-callback-deploy-plan.md` is done. eBay does not fetch the URL at registration time,
  which is why registering first is safe.

## Gates still closed

Production RuName, Cert ID and secret wiring, the notification destination, and the first real
sandbox OAuth connection. Each needs its own approval.
