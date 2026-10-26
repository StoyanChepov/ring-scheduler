package com.ringscheduler.app

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.util.Patterns
import android.view.View
import android.view.WindowInsets
import android.view.inputmethod.EditorInfo
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.gms.tasks.Tasks
import com.google.android.material.button.MaterialButtonToggleGroup
import com.google.android.material.progressindicator.CircularProgressIndicator
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.Executors

/** Connects this phone to an account: logs in (or registers) and registers the device. */
class LoginActivity : AppCompatActivity() {

    private lateinit var session: Session
    private val background = Executors.newSingleThreadExecutor()

    private lateinit var modeToggle: MaterialButtonToggleGroup
    private lateinit var serverLayout: TextInputLayout
    private lateinit var serverUrl: TextInputEditText
    private lateinit var emailLayout: TextInputLayout
    private lateinit var email: TextInputEditText
    private lateinit var passwordLayout: TextInputLayout
    private lateinit var password: TextInputEditText
    private lateinit var confirmLayout: TextInputLayout
    private lateinit var confirmPassword: TextInputEditText
    private lateinit var submit: Button
    private lateinit var progress: CircularProgressIndicator
    private lateinit var errorText: TextView

    private var register = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)
        session = Session(this)

        // Android 15+ draws the app behind the system bars and no longer
        // resizes it for the keyboard, so pad for both.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            findViewById<View>(R.id.root).setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        }

        modeToggle = findViewById(R.id.modeToggle)
        serverLayout = findViewById(R.id.serverLayout)
        serverUrl = findViewById(R.id.serverUrl)
        emailLayout = findViewById(R.id.emailLayout)
        email = findViewById(R.id.email)
        passwordLayout = findViewById(R.id.passwordLayout)
        password = findViewById(R.id.password)
        confirmLayout = findViewById(R.id.confirmLayout)
        confirmPassword = findViewById(R.id.confirmPassword)
        submit = findViewById(R.id.submit)
        progress = findViewById(R.id.progress)
        errorText = findViewById(R.id.errorText)

        if (BuildConfig.DEBUG) {
            serverLayout.visibility = View.VISIBLE
            serverUrl.setText(session.serverUrl)
        }
        email.setText(session.email.orEmpty())

        intent.getStringExtra(EXTRA_NOTICE)?.let { notice ->
            findViewById<TextView>(R.id.notice).apply {
                text = notice
                visibility = View.VISIBLE
            }
        }

        modeToggle.addOnButtonCheckedListener { _, checkedId, isChecked ->
            if (isChecked) setRegister(checkedId == R.id.registerMode)
        }
        submit.setOnClickListener { submit() }
        val submitOnDone = TextView.OnEditorActionListener { _, actionId, _ ->
            (actionId == EditorInfo.IME_ACTION_DONE).also { if (it) submit() }
        }
        password.setOnEditorActionListener(submitOnDone)
        confirmPassword.setOnEditorActionListener(submitOnDone)

        setRegister(false)
    }

    override fun onDestroy() {
        background.shutdown()
        super.onDestroy()
    }

    private fun setRegister(register: Boolean) {
        this.register = register
        confirmLayout.visibility = if (register) View.VISIBLE else View.GONE
        passwordLayout.helperText = if (register) getString(R.string.password_rule) else null
        password.imeOptions = if (register) EditorInfo.IME_ACTION_NEXT else EditorInfo.IME_ACTION_DONE
        submit.setText(if (register) R.string.create_account else R.string.log_in)
        listOf(emailLayout, passwordLayout, confirmLayout).forEach { it.error = null }
        errorText.visibility = View.GONE
    }

    private fun submit() {
        if (progress.visibility == View.VISIBLE || !validate()) return

        val url = if (BuildConfig.DEBUG) serverUrl.text.toString().trim().trimEnd('/') else Session.DEFAULT_SERVER_URL
        val emailText = email.text.toString().trim()
        val passwordText = password.text.toString()
        val register = register

        setBusy(true)
        background.execute {
            try {
                authenticate(url, emailText, passwordText, register)
                runOnUiThread {
                    startActivity(Intent(this, MainActivity::class.java))
                    finish()
                }
            } catch (e: Exception) {
                Log.w(TAG, "Login failed", e)
                runOnUiThread {
                    setBusy(false)
                    errorText.text = describeError(this, e)
                    errorText.visibility = View.VISIBLE
                }
            }
        }
    }

    /** Field errors shown before anything is sent; false if there are any. */
    private fun validate(): Boolean {
        val emailText = email.text.toString().trim()
        val passwordText = password.text.toString()

        if (BuildConfig.DEBUG) {
            serverLayout.error =
                if (serverUrl.text.isNullOrBlank()) getString(R.string.error_server_required) else null
        }
        emailLayout.error = when {
            emailText.isEmpty() -> getString(R.string.error_email_required)
            !Patterns.EMAIL_ADDRESS.matcher(emailText).matches() -> getString(R.string.error_email_invalid)
            else -> null
        }
        passwordLayout.error = when {
            passwordText.isEmpty() -> getString(R.string.error_password_required)
            // The API's rule for new passwords.
            register && passwordText.length < 8 -> getString(R.string.error_password_short)
            else -> null
        }
        confirmLayout.error =
            if (register && confirmPassword.text.toString() != passwordText) getString(R.string.error_password_mismatch)
            else null

        errorText.visibility = View.GONE
        return listOf(serverLayout, emailLayout, passwordLayout, confirmLayout).all { it.error == null }
    }

    private fun setBusy(busy: Boolean) {
        progress.visibility = if (busy) View.VISIBLE else View.GONE
        submit.isEnabled = !busy
        submit.text = if (busy) "" else getString(if (register) R.string.create_account else R.string.log_in)
        modeToggle.isEnabled = !busy
        listOf(serverUrl, email, password, confirmPassword).forEach { it.isEnabled = !busy }
    }

    // On the background thread.
    private fun authenticate(url: String, emailText: String, passwordText: String, register: Boolean) {
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
        } ?: authed.createDevice(deviceName(), token)

        // The user's login token is not kept: from here on the phone
        // authenticates as itself, with the device key.
        session.serverUrl = url
        session.email = auth.email
        session.deviceId = credentials.deviceId
        session.deviceKey = credentials.deviceKey
    }

    companion object {
        private const val TAG = "LoginActivity"
        private const val EXTRA_NOTICE = "notice"

        /** Opens the login screen, optionally saying why (logged out, disconnected). */
        fun intent(context: Context, notice: String? = null): Intent =
            Intent(context, LoginActivity::class.java).putExtra(EXTRA_NOTICE, notice)

        // Shown in the web app's device list, where it can be renamed.
        // Some phones already start the model with the brand ("HONOR X5c").
        private fun deviceName(): String {
            val brand = Build.MANUFACTURER.replaceFirstChar { it.titlecase() }
            return if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) Build.MODEL
            else "$brand ${Build.MODEL}"
        }

        // Call on a background thread; blocks until Firebase returns the token.
        // getToken() is deprecated in firebase-messaging 26 in favour of
        // register() + onRegistered(), but that API is opt-in: register() fails
        // unless the manifest sets firebase_messaging_installation_id_enabled,
        // which moves the app to a different registration scheme. Stay on
        // getToken() until that scheme is the default and the Admin SDK documents
        // sending to it.
        @Suppress("DEPRECATION")
        fun currentFcmToken(): String {
            val token = Tasks.await(FirebaseMessaging.getInstance().token)
            Log.i(TAG, "FCM token: $token")
            return token
        }
    }
}
