package com.ringscheduler.app

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private lateinit var session: Session
    private val background = Executors.newSingleThreadExecutor()

    private lateinit var status: TextView
    private lateinit var loginForm: View
    private lateinit var connectedPanel: View
    private lateinit var serverUrl: EditText
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var deviceName: EditText
    private lateinit var tokenView: TextView

    private var fcmToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        session = Session(this)

        // Android 15+ draws the app behind the status bar.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            findViewById<View>(R.id.root).setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        }

        status = findViewById(R.id.status)
        loginForm = findViewById(R.id.loginForm)
        connectedPanel = findViewById(R.id.connectedPanel)
        serverUrl = findViewById(R.id.serverUrl)
        email = findViewById(R.id.email)
        password = findViewById(R.id.password)
        deviceName = findViewById(R.id.deviceName)
        tokenView = findViewById(R.id.tokenView)

        serverUrl.setText(session.serverUrl)
        email.setText(session.email.orEmpty())
        deviceName.setText("${Build.MANUFACTURER} ${Build.MODEL}")

        findViewById<Button>(R.id.loginButton).setOnClickListener { authenticate(register = false) }
        findViewById<Button>(R.id.registerButton).setOnClickListener { authenticate(register = true) }
        findViewById<Button>(R.id.stopButton).setOnClickListener { RingService.stop(this) }
        findViewById<Button>(R.id.copyTokenButton).setOnClickListener { copyToken() }
        findViewById<Button>(R.id.logoutButton).setOnClickListener {
            session.logout()
            render("Logged out.")
        }

        requestNotificationPermission()
        render(if (session.isLoggedIn) "Connected as ${session.email}" else "Log in to connect this phone.")
        syncToken()
    }

    override fun onDestroy() {
        background.shutdown()
        super.onDestroy()
    }

    private fun authenticate(register: Boolean) {
        val url = serverUrl.text.toString().trim().trimEnd('/')
        val emailText = email.text.toString().trim()
        val passwordText = password.text.toString()
        val name = deviceName.text.toString().trim().ifEmpty { Build.MODEL }

        render(if (register) "Registering…" else "Logging in…")

        background.execute {
            try {
                val token = currentFcmToken()
                val api = ApiClient(url)
                val auth = if (register) api.register(emailText, passwordText) else api.login(emailText, passwordText)
                val authed = ApiClient(url, auth.accessToken)

                // Reuse this phone's device record when the same account logs back in.
                val existingDevice = session.deviceId.takeIf { session.email == auth.email }
                val deviceId = existingDevice?.let { id ->
                    try {
                        authed.updateToken(id, token)
                        id
                    } catch (e: ApiException) {
                        // Deleted on the server: fall through and create a new one.
                        if (e.status != 404) throw e
                        null
                    }
                } ?: authed.createDevice(name, token)

                session.serverUrl = url
                session.email = auth.email
                session.accessToken = auth.accessToken
                session.deviceId = deviceId

                runOnUiThread {
                    password.text.clear()
                    render("Connected as ${auth.email}")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Login failed", e)
                runOnUiThread { render("Failed: ${describe(e)}") }
            }
        }
    }

    /** Shows the current FCM token and, if logged in, makes sure the server has it. */
    private fun syncToken() {
        background.execute {
            try {
                val token = currentFcmToken()
                val accessToken = session.accessToken
                val deviceId = session.deviceId

                if (accessToken != null && deviceId != null) {
                    ApiClient(session.serverUrl, accessToken).updateToken(deviceId, token)
                }
            } catch (e: ApiException) {
                if (e.status == 401) {
                    // Login tokens expire; ask for the password again.
                    session.logout()
                    runOnUiThread { render("Your login expired. Log in again.") }
                } else {
                    runOnUiThread { render("Could not reach the server: ${describe(e)}") }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Token sync failed", e)
                runOnUiThread { render("Could not sync push token: ${describe(e)}") }
            }
        }
    }

    // Called on the background thread; blocks until Firebase returns the token.
    // TODO: getToken() is deprecated in firebase-messaging 26 in favour of
    // register() + FirebaseMessagingService.onRegistered(); migrate once the
    // basic flow is verified on a device.
    @Suppress("DEPRECATION")
    private fun currentFcmToken(): String {
        val token = Tasks.await(FirebaseMessaging.getInstance().token)
        Log.i(TAG, "FCM token: $token")
        fcmToken = token
        runOnUiThread { tokenView.text = "Push token:\n$token" }
        return token
    }

    private fun copyToken() {
        val token = fcmToken ?: return
        getSystemService(ClipboardManager::class.java)
            .setPrimaryClip(ClipData.newPlainText("FCM token", token))
        Toast.makeText(this, "Push token copied", Toast.LENGTH_SHORT).show()
    }

    private fun render(message: String) {
        status.text = message
        val loggedIn = session.isLoggedIn
        loginForm.visibility = if (loggedIn) View.GONE else View.VISIBLE
        connectedPanel.visibility = if (loggedIn) View.VISIBLE else View.GONE
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
        }
    }

    private fun describe(e: Exception): String = when (e) {
        is ApiException -> e.message ?: "HTTP ${e.status}"
        is java.net.ConnectException -> "can't connect to ${serverUrl.text}. Is the API running and adb reverse set up?"
        else -> e.message ?: e.javaClass.simpleName
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
