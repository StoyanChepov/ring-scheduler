package com.ringscheduler.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.util.Log

/**
 * Plays the alarm sound in a foreground service, so it keeps ringing with the
 * screen off or the app closed, until the duration ends or someone stops it.
 */
class RingService : Service() {

    private var player: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private val stopRunnable = Runnable { stopRinging(EventReporter.FINISHED, null) }

    /** The ring that is playing, for its history events. */
    private var current: RingRequest? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopRinging(EventReporter.STOPPED, intent.getStringExtra(EXTRA_STOPPED_BY))
            return START_NOT_STICKY
        }

        val request = intent?.let(::requestFrom)
            ?: RingRequest(RingRequest.COMMAND, durationSeconds = DEFAULT_DURATION_SECONDS)

        // Must come first: Android kills a foreground service that doesn't
        // call startForeground() promptly.
        startInForeground()

        // A new ring while already ringing takes over (and restarts the countdown).
        current?.let { EventReporter.record(this, EventReporter.STOPPED, it, "Replaced by another ring") }
        current = request

        val note = try {
            startPlaying(request.ringtoneId)
        } catch (e: Exception) {
            Log.e(TAG, "Could not play the alarm sound", e)
            stopRinging(EventReporter.FAILED, "Could not play the alarm sound: ${e.message}")
            return START_NOT_STICKY
        }
        EventReporter.record(this, EventReporter.STARTED, request, note)

        handler.removeCallbacks(stopRunnable)
        handler.postDelayed(stopRunnable, request.durationSeconds * 1000L)

        // If Android kills the service, don't restart it and ring again later.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        handler.removeCallbacks(stopRunnable)
        releasePlayer()
        super.onDestroy()
    }

    private fun startInForeground() {
        val notification = buildNotification()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    /**
     * Plays the uploaded ringtone, or the phone's alarm sound. Returns a note
     * for the history when the ringtone had to be replaced by the default.
     */
    private fun startPlaying(ringtoneId: String?): String? {
        releasePlayer()

        val custom = ringtoneId?.let { RingtoneStore.fileFor(this, it) }

        if (custom != null) {
            try {
                player = createPlayer(Uri.fromFile(custom))
                return null.also { markRinging() }
            } catch (e: Exception) {
                Log.w(TAG, "Ringtone $ringtoneId could not be played", e)
                releasePlayer()
            }
        }

        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        player = createPlayer(uri)
        markRinging()

        return when {
            ringtoneId == null -> null
            custom == null -> "Ringtone not downloaded yet; played the default alarm sound"
            else -> "Ringtone could not be played; played the default alarm sound"
        }
    }

    private fun markRinging() {
        isRinging = true
        sendBroadcast(Intent(ACTION_RINGING_STARTED).setPackage(packageName))
        Log.i(TAG, "Ringing started")
    }

    private fun createPlayer(uri: Uri): MediaPlayer =
        MediaPlayer().apply {
            // The alarm stream plays even when the phone is on silent.
            setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            setWakeMode(applicationContext, PowerManager.PARTIAL_WAKE_LOCK)
            setDataSource(applicationContext, uri)
            isLooping = true
            prepare()
            start()
        }

    /** Ends ringing and records how it ended (if something was ringing). */
    private fun stopRinging(eventType: String, detail: String?) {
        current?.let { EventReporter.record(this, eventType, it, detail) }
        current = null

        handler.removeCallbacks(stopRunnable)
        releasePlayer()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()

        isRinging = false
        sendBroadcast(Intent(ACTION_RINGING_STOPPED).setPackage(packageName))
        Log.i(TAG, "Ringing stopped")
    }

    private fun releasePlayer() {
        player?.run {
            runCatching { stop() }
            release()
        }
        player = null
    }

    private fun buildNotification(): Notification {
        createChannel(this)

        val stopIntent = PendingIntent.getService(
            this,
            0,
            stopIntent(this, STOPPED_ON_PHONE),
            PendingIntent.FLAG_IMMUTABLE,
        )

        val alarmIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )

        val stopAction = Notification.Action.Builder(
            null,
            getString(R.string.stop),
            stopIntent,
        ).build()

        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_ring)
            .setContentTitle(getString(R.string.ring_notification_title))
            .setContentText(getString(R.string.ring_notification_text))
            .setCategory(Notification.CATEGORY_ALARM)
            .setContentIntent(alarmIntent)
            // Screen off or locked: Android opens AlarmActivity straight away.
            // Phone in use: shown as a heads-up banner instead.
            .setFullScreenIntent(alarmIntent, true)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .addAction(stopAction)
            .build()
    }

    companion object {
        private const val TAG = "RingService"
        private const val CHANNEL_ID = "ringing"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_STOP = "com.ringscheduler.app.STOP"
        private const val EXTRA_DURATION_SECONDS = "durationSeconds"
        private const val EXTRA_SOURCE = "source"
        private const val EXTRA_SCHEDULE_ID = "scheduleId"
        private const val EXTRA_COMMAND_ID = "commandId"
        private const val EXTRA_RINGTONE_ID = "ringtoneId"
        private const val EXTRA_STOPPED_BY = "stoppedBy"
        const val DEFAULT_DURATION_SECONDS = 30

        /** Who stopped a ring, as shown in its history. */
        const val STOPPED_ON_PHONE = "Stopped on the phone"
        const val STOPPED_FROM_DASHBOARD = "Stopped from the dashboard"

        /** Sent (to this app only) whenever ringing ends, so AlarmActivity can close. */
        const val ACTION_RINGING_STOPPED = "com.ringscheduler.app.RINGING_STOPPED"

        /** Sent (to this app only) when ringing starts, so the home screen can offer Stop. */
        const val ACTION_RINGING_STARTED = "com.ringscheduler.app.RINGING_STARTED"

        @Volatile
        var isRinging = false
            private set

        /**
         * Starts ringing. If Android refuses to start the service from the
         * background, that is recorded as a failed ring and rethrown.
         */
        fun start(context: Context, request: RingRequest) {
            val intent = Intent(context, RingService::class.java)
                .putExtra(EXTRA_DURATION_SECONDS, request.durationSeconds)
                .putExtra(EXTRA_SOURCE, request.source)
                .putExtra(EXTRA_SCHEDULE_ID, request.scheduleId)
                .putExtra(EXTRA_COMMAND_ID, request.commandId)
                .putExtra(EXTRA_RINGTONE_ID, request.ringtoneId)

            try {
                context.startForegroundService(intent)
            } catch (e: IllegalStateException) {
                EventReporter.record(
                    context,
                    EventReporter.FAILED,
                    request,
                    "Android did not allow ringing from the background",
                )
                throw e
            }
        }

        fun stop(context: Context, stoppedBy: String) {
            // startService, not stopService, so a stop that arrives before the
            // service is up still goes through stopRinging().
            context.startService(stopIntent(context, stoppedBy))
        }

        private fun stopIntent(context: Context, stoppedBy: String) =
            Intent(context, RingService::class.java)
                .setAction(ACTION_STOP)
                .putExtra(EXTRA_STOPPED_BY, stoppedBy)

        private fun requestFrom(intent: Intent) = RingRequest(
            source = intent.getStringExtra(EXTRA_SOURCE) ?: RingRequest.COMMAND,
            scheduleId = intent.getStringExtra(EXTRA_SCHEDULE_ID),
            commandId = intent.getStringExtra(EXTRA_COMMAND_ID),
            durationSeconds = intent.getIntExtra(EXTRA_DURATION_SECONDS, DEFAULT_DURATION_SECONDS),
            ringtoneId = intent.getStringExtra(EXTRA_RINGTONE_ID),
        )

        private fun createChannel(context: Context) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.ring_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                // The service plays the sound itself.
                setSound(null, null)
            }

            context.getSystemService(NotificationManager::class.java)
                .createNotificationChannel(channel)
        }
    }
}
