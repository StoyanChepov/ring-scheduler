# Ring Scheduler — Android app

Logs in to the API, registers the phone as an `ANDROID` device with its FCM
token, and rings when the API sends a `RING_START` push (until the duration
ends, a `RING_STOP` arrives, or Stop is tapped).

Scheduled alarms ring from the phone itself: the API sends a
`SCHEDULES_CHANGED` push, the app downloads its schedules
(`GET /device/schedules`), caches them and sets exact alarms with
`AlarmManager.setAlarmClock`. They ring offline, in Doze, and are set again
after a reboot or a time zone change.

## Authentication

Login uses the account's email and password once. The app then registers (or
re-keys) the device and keeps only its **device key** (`dk_...`), which does
not expire. Logging in again on the phone issues a new key and revokes the old
one. The user's one-hour login token is never stored on the phone.

## Setup

1. Install Android Studio (includes the JDK, SDK and adb).
2. Firebase console → project `ring-scheduler` → Add app → Android, package
   `com.ringscheduler.app`. Download `google-services.json` into `app/`
   (git-ignored).
3. Open `apps/android` in Android Studio and run on a phone with Google Play
   services. An emulator needs a "Google Play" system image.

## Release build (for sharing)

Release builds always use the deployed API (`https://ring-scheduler.vercel.app`),
only allow HTTPS and have no server field on the login screen. They are
signed with the key in `keystore/`, whose passwords are in
`keystore.properties`; both are git-ignored. **Back them up**: an installed
app can only be updated by an APK signed with the same key.

### Publishing a release

Merge to `main`, then tag the version and push the tag:

```
git tag v1.2.0
git push origin v1.2.0
```

The [Android release](../../.github/workflows/android-release.yml) workflow
builds the signed APK with version `1.2.0` (versionCode `10200`: major ×
10000 + minor × 100 + patch, so every higher version installs over the last)
and publishes a GitHub release with it attached as `ring-scheduler.apk`. The
website's "Get the Android app" button always points at the latest release's
`ring-scheduler.apk`.

One-time setup: add these repository secrets (GitHub → Settings → Secrets and
variables → Actions). In PowerShell, from `apps/android`, base64 a file with
`[Convert]::ToBase64String([IO.File]::ReadAllBytes("keystore\ring-scheduler-release.jks"))`.

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `keystore/ring-scheduler-release.jks`, base64 |
| `ANDROID_KEYSTORE_PASSWORD` | `storePassword` from `keystore.properties` |
| `ANDROID_KEY_ALIAS` | `keyAlias` |
| `ANDROID_KEY_PASSWORD` | `keyPassword` |
| `GOOGLE_SERVICES_JSON_BASE64` | `app/google-services.json`, base64 |

### Building one locally

```
./gradlew assembleRelease -PappVersion=1.2.0
# -> app/build/outputs/apk/release/ring-scheduler-release.apk
```

Without `-PappVersion` the build is version `1.0.1`.

A phone that has the debug build must uninstall it before installing the
release build (different signing keys).

## Reaching the local API

Debug builds show a "Server" field on the login screen, filled with
`http://localhost:3000`. Forward that port to the PC:

```
adb reverse tcp:3000 tcp:3000
```

Redo this after every reconnect. Debug builds allow plain HTTP; release builds
do not.

## Testing push without the dashboard

Copy the token from the app (⋮ menu → "Copy push token", or `FCM token:` in Logcat) and
from `apps/api` run:

```
pnpm push:test <token>
```

## Wireless debugging (no USB cable)

Developer options → Wireless debugging → "Pair device with pairing code", then:

```
adb pair <ip>:<pairing-port> <code>
adb connect <ip>:<port shown on the Wireless debugging screen>
```

## Known limitations

- If Android 14+ switches off full-screen alerts for the app, the home screen
  shows an "Alarm screen is off" card; without it a locked phone rings with the
  screen off.
- Alarms are read-only on the phone: they are added and edited in the web app,
  which the home screen links to.
- Uses `FirebaseMessaging.getToken()`/`onNewToken()`, deprecated in
  firebase-messaging 26. The replacement (`register()`/`onRegistered()`) is
  opt-in behind a manifest flag that changes the registration scheme, so the
  app stays on the old API for now.
- Weekly alarms follow the phone's current time zone; one-time alarms are a
  fixed moment.
- Schedule changes reach the phone by push. If that push is lost, the phone
  picks the change up the next time the app is opened.
- On Honor/Huawei phones, set Settings → Battery → App launch → Ring Scheduler
  to manual with all three toggles on, or background rings may be delayed.
