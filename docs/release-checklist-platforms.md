# Release checklist — five platforms, per change (standing rule from 11 September 2026)

**The rule.** For any change that touches a user flow, a Mac check alone is not enough. Every such change is evaluated on
five platforms, each reported on its own line with its own evidence; a platform that is not affected is listed with the
reason it is not, never left out. The five:

1. macOS app
2. iOS app
3. Android app
4. iPhone Safari (mobile web)
5. Android Chrome (mobile web)

**Evidence types are not interchangeable.** Say which one it was:

| Type | What it proves | What it does not prove |
|---|---|---|
| build (xcodebuild / gradle) | compiles and links | anything at runtime |
| simulator / emulator flow | the flow works on a simulated device with a signed-in session (which account, which workspace) | hardware behaviour (keyboard, notch, performance, real push) |
| physical device test | the flow on real hardware (the Mac app on this Mac counts as physical for macOS) | other platforms |
| unit test | the pinned rule in code | the screen |
| distribution package | an App Store archive / signed AAB exists | that it was tested — it is a build artefact |

**What a phone check covers (not only the sign-in screen):** sign-in and workspace selection, navigation to the changed
screen, form fill and save, usability with the keyboard open (fields not hidden, buttons reachable), and that the saved
data is still there after the app is closed and reopened. For mobile web the same list on iPhone Safari and Android Chrome.

**Accounts.** Never the retention pilot workspace (`GuglEFKSEKNTq1xibFpJav3EWkY2`) while a pilot check is pending, never
the review account (`review@nivadesk.app`). Before another production test account is used, confirm it is ours (owner
address on a NivaDesk/EGGcraft domain) and which workspace it holds; otherwise run on the local emulators (both native apps
have an emulator switch: iOS `NIVADESK_USE_EMULATOR=1` + `NIVADESK_EMULATOR_TOKEN`, Android marker file
`nivadesk-emulator.txt` in the app's files dir) and list the account/session the operator has to provide.

**Do not repeat** a test that is already recorded as passed on the same source for the same platform; cite it.

## The per-change matrix (copy into the change's record)

| Platform | Affected? (why) | Evidence type | What was run (account / workspace / steps) | Result | Missing |
|---|---|---|---|---|---|
| macOS app | | | | | |
| iOS app | | | | | |
| Android app | | | | | |
| iPhone Safari | | | | | |
| Android Chrome | | | | | |

## Store release gate (in addition to the matrix)
* Source commit named; the real product diff since the last store build (merge/doc commits excluded).
* Every server path the build calls is live; gated features are not presented as available.
* Version numbers exceed the store's; signing identities/keys verified as present (values never printed).
* No upload, Submit or production deploy without the operator's explicit approval of the final package.
