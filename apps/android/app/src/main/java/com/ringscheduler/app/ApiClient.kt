package com.ringscheduler.app

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiException(val status: Int, message: String) : Exception(message)

/**
 * Blocking calls to the ring-scheduler API. Call from a background thread.
 *
 * [bearer] is the user's login token for the account calls, or the phone's
 * device key (`dk_...`) for the `/device` calls.
 */
class ApiClient(private val baseUrl: String, private val bearer: String? = null) {

    data class AuthResult(val accessToken: String, val email: String)

    data class DeviceCredentials(val deviceId: String, val deviceKey: String)

    fun login(email: String, password: String) = auth("login", email, password)

    fun register(email: String, password: String) = auth("register", email, password)

    // --- With the user's login -------------------------------------------

    fun createDevice(name: String, fcmToken: String): DeviceCredentials {
        val body = JSONObject()
            .put("name", name)
            .put("platform", "ANDROID")
            .put("fcmToken", fcmToken)

        val device = request("POST", "/devices", body)
        return DeviceCredentials(device.getString("id"), device.getString("deviceKey"))
    }

    /** A fresh key for an existing device; the old one stops working. */
    fun issueDeviceKey(deviceId: String): String =
        request("POST", "/devices/$deviceId/key", JSONObject()).getString("deviceKey")

    // --- With the device key ---------------------------------------------

    fun updateOwnToken(fcmToken: String) {
        request("PATCH", "/device/token", JSONObject().put("fcmToken", fcmToken))
    }

    /** Uploads queued history events; the API ignores any it already has. */
    fun reportEvents(events: JSONArray) {
        request("POST", "/device/events", JSONObject().put("events", events))
    }

    /** The active schedules this phone should set alarms for. */
    fun fetchSchedules(): List<Schedule> =
        Schedule.listFromJson(JSONArray(send("GET", "/device/schedules")))

    private fun auth(path: String, email: String, password: String): AuthResult {
        val body = JSONObject().put("email", email).put("password", password)
        val response = request("POST", "/auth/$path", body)

        return AuthResult(
            accessToken = response.getString("accessToken"),
            email = response.getJSONObject("user").getString("email"),
        )
    }

    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject {
        val text = send(method, path, body)
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    /** Returns the response body; throws ApiException for a non-2xx status. */
    private fun send(method: String, path: String, body: JSONObject? = null): String {
        val connection = URL(baseUrl + path).openConnection() as HttpURLConnection

        try {
            // Android's HttpURLConnection (unlike desktop Java's) accepts PATCH.
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            bearer?.let { connection.setRequestProperty("Authorization", "Bearer $it") }

            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()

            if (status !in 200..299) {
                throw ApiException(status, errorMessage(status, text))
            }

            return text
        } finally {
            connection.disconnect()
        }
    }

    // Nest returns { message: string | string[] } for errors.
    private fun errorMessage(status: Int, text: String): String {
        val message = runCatching {
            val json = JSONObject(text)
            json.optJSONArray("message")?.let { list ->
                (0 until list.length()).joinToString("; ") { list.getString(it) }
            } ?: json.optString("message")
        }.getOrNull()

        return if (message.isNullOrBlank()) "Server returned HTTP $status" else message
    }
}
