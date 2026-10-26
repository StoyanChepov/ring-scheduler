package com.ringscheduler.app

import android.Manifest
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.format.DateUtils
import android.util.Log
import android.view.MenuItem
import android.view.View
import android.view.WindowInsets
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.divider.MaterialDivider
import com.google.android.material.snackbar.Snackbar
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors

/** The home screen: the next alarm, every alarm on this phone, and anything stopping them. */
class MainActivity : AppCompatActivity() {

    private lateinit var session: Session
    private val background = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())

    private lateinit var root: View
    private lateinit var exactAlarmWarning: View
    private lateinit var alarmScreenWarning: View
    private lateinit var notificationsWarning: View
    private lateinit var ringingCard: View
    private lateinit var nextTime: TextView
    private lateinit var nextDay: TextView
    private lateinit var nextDetail: TextView
    private lateinit var alarmList: LinearLayout
    private lateinit var emptyAlarms: View
    private lateinit var footer: TextView

    @Volatile
    private var fcmToken: String? = null
    private var receiverRegistered = false

    // Ringing started or stopped, or a push changed (or signed out) the alarms.
    private val changesReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (session.isLoggedIn) renderHome() else openLogin(getString(R.string.disconnected))
        }
    }

    // Keeps "in 9 h 12 min" and "Synced 5 minutes ago" current.
    private val ticker = object : Runnable {
        override fun run() {
            renderHome()
            handler.postDelayed(this, 30_000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = Session(this)
        if (!session.isLoggedIn) {
            openLogin(null)
            return
        }
        setContentView(R.layout.activity_main)

        // Android 15+ draws the app behind the status bar.
        root = findViewById(R.id.root)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            root.setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        }

        exactAlarmWarning = findViewById(R.id.exactAlarmWarning)
        alarmScreenWarning = findViewById(R.id.alarmScreenWarning)
        notificationsWarning = findViewById(R.id.notificationsWarning)
        ringingCard = findViewById(R.id.ringingCard)
        nextTime = findViewById(R.id.nextTime)
        nextDay = findViewById(R.id.nextDay)
        nextDetail = findViewById(R.id.nextDetail)
        alarmList = findViewById(R.id.alarmList)
        emptyAlarms = findViewById(R.id.emptyAlarms)
        footer = findViewById(R.id.footer)

        findViewById<MaterialToolbar>(R.id.toolbar).apply {
            subtitle = session.email
            setOnMenuItemClickListener(::onMenuItem)
        }
        findViewById<Button>(R.id.stopButton).setOnClickListener { RingService.stop(this, RingService.STOPPED_ON_PHONE) }
        findViewById<Button>(R.id.openWebButton).setOnClickListener { openWebApp() }

        setUpWarning(exactAlarmWarning, R.string.warning_exact_title, R.string.warning_exact_text, R.string.open_settings) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            }
        }
        setUpWarning(alarmScreenWarning, R.string.warning_screen_title, R.string.warning_screen_text, R.string.allow) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$packageName")))
            }
        }
        setUpWarning(notificationsWarning, R.string.warning_notifications_title, R.string.warning_notifications_text, R.string.allow) {
            startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }

        requestNotificationPermission()
        sync(userTriggered = false)
    }

    override fun onResume() {
        super.onResume()
        // Signed out in the background (a sync was refused) while the app was away.
        if (!session.isLoggedIn) {
            openLogin(getString(R.string.disconnected))
            return
        }

        val filter = IntentFilter().apply {
            addAction(RingService.ACTION_RINGING_STARTED)
            addAction(RingService.ACTION_RINGING_STOPPED)
            addAction(AlarmScheduler.ACTION_SCHEDULES_UPDATED)
        }
        ContextCompat.registerReceiver(this, changesReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        receiverRegistered = true
        // Also picks up permissions changed in Settings while the app was away.
        handler.post(ticker)
    }

    override fun onPause() {
        if (receiverRegistered) {
            unregisterReceiver(changesReceiver)
            receiverRegistered = false
        }
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    override fun onDestroy() {
        background.shutdown()
        super.onDestroy()
    }

    private fun onMenuItem(item: MenuItem): Boolean {
        when (item.itemId) {
            R.id.action_sync -> sync(userTriggered = true)
            R.id.action_copy_token -> copyToken()
            R.id.action_logout -> confirmLogout()
            else -> return false
        }
        return true
    }

    /** Makes sure the server has this phone's push token, then downloads its alarms. */
    private fun sync(userTriggered: Boolean) {
        background.execute {
            val error = try {
                val token = LoginActivity.currentFcmToken().also { fcmToken = it }
                val deviceKey = session.deviceKey ?: return@execute
                ApiClient(session.serverUrl, deviceKey).updateOwnToken(token)
                // A failed sync keeps the alarms already set.
                AlarmScheduler.sync(this)
                EventReporter.flush(this)
                null
            } catch (e: ApiException) {
                Log.w(TAG, "Sync failed", e)
                if (e.status == 401) {
                    // The key was replaced (logged in on another install) or the
                    // device was deleted; ask for the password again.
                    session.logout()
                    AlarmScheduler.clear(this)
                    runOnUiThread { openLogin(getString(R.string.disconnected)) }
                    return@execute
                }
                describeError(this, e)
            } catch (e: Exception) {
                Log.w(TAG, "Sync failed", e)
                describeError(this, e)
            }

            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                renderHome()
                when {
                    error != null -> Snackbar.make(root, getString(R.string.sync_failed, error), Snackbar.LENGTH_LONG).show()
                    userTriggered -> Snackbar.make(root, R.string.synced, Snackbar.LENGTH_SHORT).show()
                }
            }
        }
    }

    /** Redraws everything from what the phone has cached; no network. */
    private fun renderHome() {
        val now = Instant.now()
        val format = AlarmFormat(this)

        exactAlarmWarning.showIf(!AlarmScheduler.canSetExactAlarms(this))
        alarmScreenWarning.showIf(!canShowAlarmScreen())
        notificationsWarning.showIf(!getSystemService(NotificationManager::class.java).areNotificationsEnabled())
        ringingCard.showIf(RingService.isRinging)

        val next = AlarmScheduler.nextAlarm(this)
        if (next == null) {
            nextTime.visibility = View.GONE
            nextDay.setText(R.string.no_alarms_title)
            nextDetail.setText(R.string.no_alarms_text)
        } else {
            val (schedule, at) = next
            nextTime.visibility = View.VISIBLE
            nextTime.text = format.time(at)
            nextDay.text = format.day(at, now)
            val countdown = format.countdown(at, now)
            nextDetail.text = schedule.label?.takeIf { it.isNotBlank() }
                ?.let { getString(R.string.separator, it, countdown) } ?: countdown
        }

        // Soonest first; alarms that won't ring again go last, dimmed.
        val schedules = AlarmScheduler.cachedSchedules(this)
            .map { it to it.nextTrigger(now) }
            .sortedWith(compareBy(nullsLast<Instant>()) { it.second })
        val rowInset = (20 * resources.displayMetrics.density).toInt()

        alarmList.removeAllViews()
        schedules.forEachIndexed { index, (schedule, nextTrigger) ->
            if (index > 0) {
                alarmList.addView(MaterialDivider(this).apply {
                    dividerInsetStart = rowInset
                    dividerInsetEnd = rowInset
                })
            }
            val row = layoutInflater.inflate(R.layout.item_alarm, alarmList, false)
            row.findViewById<TextView>(R.id.alarmTime).text = format.time(schedule)
            row.findViewById<TextView>(R.id.alarmLabel).text =
                schedule.label?.takeIf { it.isNotBlank() } ?: getString(R.string.untitled_alarm)
            row.findViewById<TextView>(R.id.alarmDetail).text = getString(
                R.string.separator,
                format.repeat(schedule, now),
                getString(R.string.rings_for, format.duration(schedule.durationSeconds)),
            )
            if (nextTrigger == null) row.alpha = 0.5f
            alarmList.addView(row)
        }
        emptyAlarms.showIf(schedules.isEmpty())

        footer.text = getString(R.string.separator, syncedText(now), getString(R.string.version, BuildConfig.VERSION_NAME))
    }

    private fun syncedText(now: Instant): String {
        val last = AlarmScheduler.lastSyncedAt(this) ?: return getString(R.string.never_synced)
        if (Duration.between(last, now) < Duration.ofMinutes(1)) return getString(R.string.synced_just_now)
        val ago = DateUtils.getRelativeTimeSpanString(last.toEpochMilli(), now.toEpochMilli(), DateUtils.MINUTE_IN_MILLIS)
        return getString(R.string.synced_ago, ago)
    }

    private fun setUpWarning(card: View, title: Int, text: Int, action: Int, onAction: () -> Unit) {
        card.findViewById<TextView>(R.id.warningTitle).setText(title)
        card.findViewById<TextView>(R.id.warningText).setText(text)
        card.findViewById<Button>(R.id.warningAction).apply {
            setText(action)
            setOnClickListener { onAction() }
        }
    }

    // Android 14+ lets users (and Play policy) switch off full-screen
    // alerts; without them a locked phone rings with its screen off.
    private fun canShowAlarmScreen(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
            getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

    private fun copyToken() {
        val token = fcmToken
        if (token == null) {
            Toast.makeText(this, R.string.push_token_not_ready, Toast.LENGTH_SHORT).show()
            return
        }
        getSystemService(ClipboardManager::class.java)
            .setPrimaryClip(ClipData.newPlainText("FCM token", token))
        Toast.makeText(this, R.string.push_token_copied, Toast.LENGTH_SHORT).show()
    }

    private fun confirmLogout() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.log_out_title)
            .setMessage(R.string.log_out_message)
            .setNegativeButton(R.string.cancel, null)
            .setPositiveButton(R.string.log_out) { _, _ ->
                session.logout()
                // A disconnected phone must not keep ringing on old schedules.
                AlarmScheduler.clear(this)
                openLogin(getString(R.string.logged_out))
            }
            .show()
    }

    private fun openWebApp() {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.WEB_URL)))
        } catch (e: ActivityNotFoundException) {
            Log.w(TAG, "No browser", e)
        }
    }

    private fun openLogin(notice: String?) {
        if (isFinishing) return
        startActivity(LoginActivity.intent(this, notice))
        finish()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
        }
    }

    private fun View.showIf(show: Boolean) {
        visibility = if (show) View.VISIBLE else View.GONE
    }

    companion object {
        private const val TAG = "MainActivity"
    }
}
