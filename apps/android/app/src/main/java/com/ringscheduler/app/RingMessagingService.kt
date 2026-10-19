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
                "RING_START" -> RingService.start(this, data["durationSeconds"]?.toIntOrNull())
                "RING_STOP" -> RingService.stop(this)
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

    // Deprecated in firebase-messaging 26 (see the TODO in MainActivity).
    @Deprecated("Replaced by onRegistered in firebase-messaging 26")
    override fun onNewToken(token: String) {
        Log.i(TAG, "New FCM token: $token")

        val session = Session(this)
        val accessToken = session.accessToken
        val deviceId = session.deviceId

        if (accessToken == null || deviceId == null) return

        // Already on a background thread. If this fails (e.g. the login token
        // expired), MainActivity sends the current token next time it opens.
        try {
            ApiClient(session.serverUrl, accessToken).updateToken(deviceId, token)
        } catch (e: Exception) {
            Log.w(TAG, "Could not upload new FCM token", e)
        }
    }

    companion object {
        private const val TAG = "RingMessaging"
    }
}
