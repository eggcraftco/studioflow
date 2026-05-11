# StudioFlow by EGGcraft - Project Context

StudioFlow is a SwiftUI app for iPhone, iPad and Mac, plus a Next.js web portal, backed by Firebase Auth, Firestore, Firebase Storage and Firebase Cloud Functions.

## Current structure

- `EGGcraft/`: SwiftUI app source
- `functions/`: Firebase Cloud Functions
- `studioflow-web/`: Next.js web portal

## Current baseline

Preserve all existing features. Make small, targeted changes only. Do not rewrite unrelated files or replace whole folders.

## Membership plans

Plans:
- Free/Demo
- Lifetime Lite
- Pro Monthly
- Team Monthly

Rules:
- If Pro/Team subscription expires or is cancelled, the workspace falls back to Free/Demo.
- Even in Free/Demo, users must be able to view/export/download their existing orders so they are not locked out of their own data.
- Future storage add-ons should support 100 GB and 200 GB.
- Plan & Access and Team Access are separate main Settings sections.
- Workspace Logo is upload/replace only. No manual logo URL entry.

## App features to preserve

- Schedule timeline is active.
- Apple Reminders remains only inside Order Detail > Schedule & Alerts.
- History / Log is restored, scrolls internally, and does not grow by itself.
- Card locking, moving, colours and card profile system are preserved.
- Order Customize menu is simplified in dashboard style.
- Workspace Blocks icons match card title icon style.
- Communication includes Address and syncs to the server.
- Smart / Recent are separated. Smart keeps active orders above inactive ones and sorts active orders by fewest remaining days first.
- Timeline & Delivery shows Created Date, Delivery Due and remaining time clearly.
- Simple Apple Calendar Add / Update / Remove system exists.
- Each team user can save their own card layout, colours, visibility and sizes.
- Team card profile live sync exists. New members can start with the Owner card layout and can Stop Sync.
- User avatar system exists. Google login shows Google photo by default and users can change it.
- Workspace logo upload uses Upload Safety.

## Client Files

Client Files exists inside Order Detail.

It supports:
- PDF
- JPG
- PNG
- HEIC
- HEIF
- WEBP
- PSD
- PSB

Features:
- Upload File
- Gallery
- Camera
- Files
- Share Sheet
- Drag & Drop
- Upload Safety
- MB limit
- Metadata
- Audit log
- Offline upload queue
- Make Offline
- Preview
- Download
- Use image in Preview Card

Share Sheet extension exists with App Group:
- `group.uk.co.eggcraft.studioflow`

Share Sheet currently uses TRUEPREDICATE for testing. Automatic app opening / order picker still needs debugging.

## Offline Mode

- Online/offline status tracking exists.
- Orders/customers local cache exists.
- Offline edits are kept as pending sync.
- Cloud/sync icon states are connected.
- Client Files offline upload queue exists.

## To Do

To Do exists inside Order.

Features:
- Add task
- Done checkbox
- Assign
- Due date
- Priority
- Filters
- Reorder by long press drag
- Task menu: Move Up / Down / Top / Bottom
- Add Reminder to Apple Reminders with task title
- PDF export

Rules:
- Completed tasks are not struck through.
- To Do assign is Team-only.
- To Do role permissions and History / Log connection must be preserved.

## Android current state

- Native Android project lives in `studioflow-android`.
- Phone keeps the iPhone-style single-column flow.
- Tablet and desktop/wide windows use adaptive layouts:
  - Persistent left navigation
  - Settings split view
  - Orders master-detail
  - Mac-style multi-column order detail board
- Android order detail uses the shared backend patch paths for details, finance, todo, workTime, client files and schedule reminders.
- Schedule & Alerts reads `customFields.__scheduleAlertItemsV1` and can add, complete, snooze and delete reminders through the shared `schedule` patch path.

## Membership / plan access rules

- Demo / Free can see Financial Info but only Paid and Cost are open.
- Demo / Free advanced finance fields are locked:
  - Remaining
  - Full Payment
  - Payment Method
  - Platform Fee
  - Shipping Cost
  - VAT / Tax
  - Final Profit
- Lite / Pro / Team have full Financial Info access.
- Client Files upload, Share Sheet import and offline file queue are Pro / Team features.
- Team Access, role management and shared team features are Team-only.
- Export/download existing data must remain available in Free/Demo.

## Team Access

- Plan & Access and Team Access are separate Settings sections.
- Request Access should be visible consistently on Mac, iPhone and iPad.
- Team Access join request approve/remove works in app and web.
- Removing a member must also prevent accepted join request repair from re-adding that user.
- Web Team page supports approve/decline, role update and remove member.

## Web portal

The web portal uses:
- Next.js
- Firebase Auth
- Firestore
- Firebase Storage
- Firebase Functions

Current web portal features:
- Login works with the same Firebase Auth users.
- Dashboard reads workspace/order/customer counts.
- Orders list exists.
- Read-only order detail exists.
- Export page exists.
- Plan & Billing page exists.
- Team page exists.
- Team page supports approve/decline, role update and remove member.
- Export must remain available in Free/Demo.

## Development rules

Before editing:
1. Inspect the relevant files.
2. Make the smallest targeted patch.
3. Do not delete unrelated pages, folders or features.
4. If changing shared plan logic, check Swift app, Next.js web portal and Firebase Functions impact.
5. Return changed file list and exact summary.

When a change affects multiple platforms, group changes as:
- App
- Web
- Backend

Never replace whole folders unless explicitly asked. Prefer editing only the specific files required for the requested change.
