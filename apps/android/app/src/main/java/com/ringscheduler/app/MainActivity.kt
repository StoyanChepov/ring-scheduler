package com.ringscheduler.app

import android.Manifest
import android.app.Activity
import android.app.NotificationManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import java.time.ZoneId
import java.time.format.DateTimeFormatter
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
        findViewById<Button>(R.id.stopButton).setOnClickListener { RingService.stop(this, RingService.STOPPED_ON_PHONE) }
        findViewById<Button>(R.id.copyTokenButton).setOnClickListener { copyToken() }
        findViewById<Button>(R.id.allowAlarmScreenButton).setOnClickListener {
            startActivity(
                Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName"))
            )
        }
        findViewById<Button>(R.id.logoutButton).setOnClickListener {
            session.logout()
            // A disconnected phone must not keep ringing on old schedules.
            AlarmScheduler.clear(this)
            render("Logged out.")
        }

        requestNotificationPermission()
        render(if (session.isLoggedIn) connectedMessage() else "Log in to connect this phone.")
        syncToken()
    }

    override fun onResume() {
        super.onResume()
        // Android 14+ lets users (and Play policy) switch off full-screen
        // alerts; without them a locked phone rings with its screen off.
        val canShowAlarmScreen = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
        findViewById<View>(R.id.allowAlarmScreenButton).visibility =
            if (canShowAlarmScreen) View.GONE else View.VISIBLE
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

                // Reuse this phone's device record when the same account logs back
                // in: it gets a fresh key (revoking the old one) and the current
                // push token.
                val existingDevice = session.deviceId.takeIf { session.email == auth.email }
                val credentials = existingDevice?.let { id ->
                    try {
                        val key = authed.issueDeviceKey(id)
                        ApiClient(url, key).updateOwnToken(token)
                        ApiClient.DeviceCredentials(id, key)
                    } catch (e: ApiException) {
                        // Deleted on the server: fall through and create a new one.
                        if (e.status != 404) throw e
                        null
                    }
                } ?: authed.createDevice(name, token)

                // The user's login token is not kept: from here on the phone
                // authenticates as itself, with the device key.
                session.serverUrl = url
                session.email = auth.email
                session.deviceId = credentials.deviceId
                session.deviceKey = credentials.deviceKey

                runOnUiThread { password.text.clear() }
                syncSchedules()
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
                val deviceKey = session.deviceKey

                if (deviceKey != null) {
                    ApiClient(session.serverUrl, deviceKey).updateOwnToken(token)
                    syncSchedules()
                }
            } catch (e: ApiException) {
                if (e.status == 401) {
                    // The key was replaced (logged in on another install) or the
                    // device was deleted; ask for the password again.
                    session.logout()
                    AlarmScheduler.clear(this)
                    runOnUiThread { render("This phone was disconnected. Log in again.") }
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
    // getToken() is deprecated in firebase-messaging 26 in favour of
    // register() + onRegistered(), but that API is opt-in: register() fails
    // unless the manifest sets firebase_messaging_installation_id_enabled,
    // which moves the app to a different registration scheme. Stay on
    // getToken() until that scheme is the default and the Admin SDK documents
    // sending to it.
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

    // On the background thread. A failed sync keeps the alarms already set.
    private fun syncSchedules() {
        val message = try {
            AlarmScheduler.sync(this)
            EventReporter.flush(this)
            connectedMessage()
        } catch (e: Exception) {
            Log.w(TAG, "Schedule sync failed", e)
            "${connectedMessage()}\n(Could not refresh schedules: ${describe(e)})"
        }
        runOnUiThread { render(message) }
    }

    private fun connectedMessage(): String {
        val lines = mutableListOf("Connected as ${session.email}")

        if (!AlarmScheduler.canSetExactAlarms(this)) {
            lines += "Alarms are blocked: allow \"Alarms & reminders\" for this app in Settings."
        }

        val next = AlarmScheduler.nextAlarm(this)
        lines += if (next == null) {
            "No alarms scheduled."
        } else {
            val (schedule, at) = next
            val whenText = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm")
                .format(at.atZone(ZoneId.systemDefault()))
            "Next alarm: $whenText" + (schedule.label?.let { " ($it)" } ?: "")
        }

        return lines.joinToString("\n")
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
        is java.net.ConnectException, is java.net.UnknownHostException ->
            "can't reach ${serverUrl.text}. Check the server address and your internet connection."
        else -> e.message ?: e.javaClass.simpleName
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
