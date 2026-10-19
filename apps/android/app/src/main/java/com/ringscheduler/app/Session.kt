package com.ringscheduler.app

import android.content.Context

/** What the app remembers between launches: where the API is and who is logged in. */
class Session(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    var serverUrl: String
        get() = prefs.getString("serverUrl", null) ?: DEFAULT_SERVER_URL
        set(value) = prefs.edit().putString("serverUrl", value.trimEnd('/')).apply()

    var accessToken: String?
        get() = prefs.getString("accessToken", null)
        set(value) = prefs.edit().putString("accessToken", value).apply()

    var email: String?
        get() = prefs.getString("email", null)
        set(value) = prefs.edit().putString("email", value).apply()

    var deviceId: String?
        get() = prefs.getString("deviceId", null)
        set(value) = prefs.edit().putString("deviceId", value).apply()

    val isLoggedIn: Boolean
        get() = accessToken != null && deviceId != null

    /** Keeps the server URL and device ID so logging back in reuses the same device. */
    fun logout() {
        prefs.edit().remove("accessToken").apply()
    }

    companion object {
        // With `adb reverse tcp:3000 tcp:3000`, localhost on the phone is the PC.
        const val DEFAULT_SERVER_URL = "http://localhost:3000"
    }
}
