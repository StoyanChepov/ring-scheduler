# Ring Scheduler — Android app

Logs in to the API, registers the phone as an `ANDROID` device with its FCM
token, and rings when the API sends a `RING_START` push (until the duration
ends, a `RING_STOP` arrives, or Stop is tapped).

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
- Login tokens expire after an hour; after that the app cannot upload a
  rotated FCM token until someone logs in again.
- Uses `FirebaseMessaging.getToken()`/`onNewToken()`, deprecated in
  firebase-messaging 26 in favour of `register()`/`onRegistered()`.
- On Honor/Huawei phones, set Settings → Battery → App launch → Ring Scheduler
  to manual with all three toggles on, or background rings may be delayed.
