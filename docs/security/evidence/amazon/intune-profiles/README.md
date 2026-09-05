# Defender for Endpoint macOS prerequisite profiles (as uploaded to Intune)

Unmodified copies of Microsoft's official templates from
`github.com/microsoft/mdatp-xplat`, path `macos/mobileconfig/profiles/`,
downloaded 2026-09-05 with the operator's approval and uploaded to Intune as
custom macOS configuration profiles (device channel, assigned to All devices).

| File | SHA-256 | What it grants |
|---|---|---|
| `fulldisk.mobileconfig` | `43a01c8c6ba40269c9bc31167982f89136ffd57ed9f401ee42998fc70237a969` | PPPC SystemPolicyAllFiles for `com.microsoft.wdav`, `com.microsoft.wdav.epsext`, `com.microsoft.dlp.daemon` (team `UBF8T346G9`) |
| `netfilter.mobileconfig` | `a3a9d5b6bd4ec3ec0c5753e339ae170395201d29b0b2957c88c69cad5341f733` | web content filter provider `com.microsoft.wdav.netext` (socket filter, inspector grade) |
| `background_services.mobileconfig` | `35b6bd05c3c8736c0a13f7dfe523e3454674592262f5cdd386b2875d3205d534` | managed login items for `com.microsoft.wdav`, `com.microsoft.dlp`, `com.microsoft.fresno` |
| `notif.mobileconfig` | `b48d4ab144f4d2ad14df2b0f295c0644bbe39f7f4fd0d97a41c2a0389969a4f9` | notifications allowed for `com.microsoft.wdav.tray` and `com.microsoft.autoupdate2` |

Company Portal installer (`CompanyPortal-Installer.pkg`, 85,659,163 bytes,
`go.microsoft.com/fwlink/?linkid=853070`): SHA-256
`08f18b9b1c0db678ef80b5e560bb29aa45074218b56685765a6d964eb3dda9f7`, signed
"Developer ID Installer: Microsoft Corporation (UBF8T346G9)", notarised,
timestamp 2026-08-28 18:11:39 UTC. Not stored in the repository.
