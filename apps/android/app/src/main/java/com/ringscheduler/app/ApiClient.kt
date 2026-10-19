package com.ringscheduler.app

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiException(val status: Int, message: String) : Exception(message)

/**
 * Blocking calls to the ring-scheduler API. Call from a background thread.
 */
class ApiClient(private val baseUrl: String, private val accessToken: String? = null) {

    data class AuthResult(val accessToken: String, val email: String)

    fun login(email: String, password: String) = auth("login", email, password)

    fun register(email: String, password: String) = auth("register", email, password)

    /** Returns the new device's ID. */
    fun createDevice(name: String, fcmToken: String): String {
        val body = JSONObject()
            .put("name", name)
            .put("platform", "ANDROID")
            .put("fcmToken", fcmToken)

        return request("POST", "/devices", body).getString("id")
    }

    fun updateToken(deviceId: String, fcmToken: String) {
        request("PATCH", "/devices/$deviceId/token", JSONObject().put("fcmToken", fcmToken))
    }

    private fun auth(path: String, email: String, password: String): AuthResult {
        val body = JSONObject().put("email", email).put("password", password)
        val response = request("POST", "/auth/$path", body)

        return AuthResult(
            accessToken = response.getString("accessToken"),
            email = response.getJSONObject("user").getString("email"),
        )
    }

    private fun request(method: String, path: String, body: JSONObject): JSONObject {
        val connection = URL(baseUrl + path).openConnection() as HttpURLConnection

        try {
            // Android's HttpURLConnection (unlike desktop Java's) accepts PATCH.
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            accessToken?.let { connection.setRequestProperty("Authorization", "Bearer $it") }

            connection.outputStream.use { it.write(body.toString().toByteArray()) }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()

            if (status !in 200..299) {
                throw ApiException(status, errorMessage(status, text))
            }

            return if (text.isBlank()) JSONObject() else JSONObject(text)
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
