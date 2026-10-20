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

## Reaching the local API

The app's default server URL is `http://localhost:3000`. Forward it to the PC:

```
adb reverse tcp:3000 tcp:3000
```

Redo this after every reconnect. Debug builds allow plain HTTP; release builds
do not.

## Testing push without the dashboard

Copy the token from the app ("Copy push token", or `FCM token:` in Logcat) and
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

- If Android 14+ switches off full-screen alerts for the app, the main screen
  shows "Allow alarm screen"; without it a locked phone rings with the screen off.
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
