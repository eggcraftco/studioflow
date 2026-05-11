Team Member Remove Sync Fix

Files:
- AuthViewModel.swift
- app/team/page.tsx
- lib/studioflow/teamActions.ts
- index.js

Deploy required:
- Firebase Functions index.js changed. Run npm install, node --check index.js, then firebase deploy --only functions.

Notes:
- Removing a member now also marks their accepted join request as removed, so the repair/sync system cannot re-add them automatically.
- App removes the member through the server callable when available, with direct Firestore fallback for older deployments.
- Web Team page now has a Remove action for non-owner members.

## Stripe Billing Scaffold

StudioFlow web billing is prepared as a test-mode scaffold only. Live payments are intentionally blocked unless the backend is explicitly configured.

Required Firebase Functions secrets:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Required Functions environment variables:

- `STRIPE_BILLING_ENABLED=false` by default; set to `true` only for test-mode checkout validation.
- `STRIPE_ALLOW_LIVE_BILLING=false`
- `STUDIOFLOW_WEB_APP_URL`
- `STRIPE_PRICE_LIFETIME_LITE`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_TEAM_MONTHLY`
- `STRIPE_PRICE_ADDON_100GB`
- `STRIPE_PRICE_ADDON_200GB`

Optional frontend variable:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Safety rules:

- Do not commit real Stripe secrets.
- Do not use live Stripe secret keys unless production billing is explicitly approved later.
- The server maps StudioFlow plan/add-on keys to Stripe Price IDs; the client never sends prices.
- Workspace owners/admins only can create checkout or Customer Portal sessions.
- Stripe webhooks update central workspace billing fields on `companies/{workspaceId}`.
- If a Pro/Team subscription is deleted, cancelled, unpaid, or expired, the workspace falls back to `demo`; export access remains preserved.
