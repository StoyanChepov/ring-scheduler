package com.ringscheduler.app

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Receives the data messages sent by the API's FirebaseService. */
class RingMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        Log.i(TAG, "Push received: $data (priority ${message.priority})")

        try {
            when (data["type"]) {
                "RING_START" -> RingService.start(
                    this,
                    RingRequest(
                        source = RingRequest.COMMAND,
                        commandId = data["commandId"],
                        durationSeconds = data["durationSeconds"]?.toIntOrNull()
                            ?: RingService.DEFAULT_DURATION_SECONDS,
                    ),
                )
                "RING_STOP" -> RingService.stop(this, RingService.STOPPED_FROM_DASHBOARD)
                "SCHEDULES_CHANGED" -> syncSchedules()
                else -> Log.w(TAG, "Ignoring unknown message type ${data["type"]}")
            }
        } catch (e: IllegalStateException) {
            // Android only lets a background app start a foreground service while
            // handling a high-priority message. If FCM downgraded this one (it
            // does for apps that often receive high-priority pushes without
            // showing anything), the start is refused.
            Log.e(TAG, "Could not start ringing from the background", e)
        }
    }

    // onMessageReceived runs on a background thread, so the network call is fine.
    private fun syncSchedules() {
        try {
            AlarmScheduler.sync(this)
            EventReporter.flush(this)
        } catch (e: Exception) {
            // The cached alarms stay set; the app syncs again when it opens.
            Log.w(TAG, "Could not sync schedules", e)
        }
    }

    // Deprecated in firebase-messaging 26; see currentFcmToken() in MainActivity.
    @Deprecated("Replaced by onRegistered in firebase-messaging 26")
    override fun onNewToken(token: String) {
        Log.i(TAG, "New FCM token: $token")

        val session = Session(this)
        val deviceKey = session.deviceKey ?: return

        // Already on a background thread. If this fails (e.g. no network),
        // MainActivity sends the current token next time it opens.
        try {
            ApiClient(session.serverUrl, deviceKey).updateOwnToken(token)
        } catch (e: Exception) {
            Log.w(TAG, "Could not upload new FCM token", e)
        }
    }

    companion object {
        private const val TAG = "RingMessaging"
    }
}
