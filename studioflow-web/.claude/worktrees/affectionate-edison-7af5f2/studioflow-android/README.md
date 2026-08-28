# StudioFlow Android

Native Android port of the StudioFlow iPhone/iPad/Mac app.

## Stack

- Kotlin
- Jetpack Compose + Material 3
- Firebase Auth
- Cloud Firestore
- Firebase Functions, region `europe-west2`
- Firebase Storage

## Required local setup

This machine does not currently have Android Studio, Android SDK, Gradle or a Java runtime installed. Install Android Studio first, then open this folder:

```text
/Users/gunesgocmen/Desktop/finance/EGGcraft/studioflow-android
```

In Firebase Console, add an Android app to project `eggcraft-studio` with package:

```text
uk.co.eggcraft.studioflow
```

Firebase Android app is already registered as `StudioFlow Android`:

```text
1:477037475099:android:3c9298418e394e19038fbe
```

The local config is placed here and intentionally ignored by git:

```text
studioflow-android/app/google-services.json
```

Until Android Studio installs/configures JDK 17 + Android SDK, Gradle sync/build is expected to fail.

## First milestone

The first Android slice intentionally mirrors the iPhone app shell:

- Native login screen
- Workspace loading from the same Firebase account
- Live Firestore order list
- iPhone-style compact order cards
- Shared role/access defaults ready for Team Access parity

Next milestones should add order detail cards one group at a time, matching the iPhone layout and permissions.
