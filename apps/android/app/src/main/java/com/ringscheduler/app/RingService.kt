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
    private val stopRunnable = Runnable { stopRinging() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopRinging()
            return START_NOT_STICKY
        }

        val durationSeconds = intent?.getIntExtra(EXTRA_DURATION_SECONDS, DEFAULT_DURATION_SECONDS)
            ?: DEFAULT_DURATION_SECONDS

        startInForeground()
        startPlaying()

        // A new ring while already ringing restarts the countdown.
        handler.removeCallbacks(stopRunnable)
        handler.postDelayed(stopRunnable, durationSeconds * 1000L)

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

    private fun startPlaying() {
        if (player?.isPlaying == true) return

        releasePlayer()

        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

        player = MediaPlayer().apply {
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

        Log.i(TAG, "Ringing started")
    }

    private fun stopRinging() {
        handler.removeCallbacks(stopRunnable)
        releasePlayer()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
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
            Intent(this, RingService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE,
        )

        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
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
            .setContentIntent(openIntent)
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
        private const val DEFAULT_DURATION_SECONDS = 30

        fun start(context: Context, durationSeconds: Int?) {
            val intent = Intent(context, RingService::class.java)
                .putExtra(EXTRA_DURATION_SECONDS, durationSeconds ?: DEFAULT_DURATION_SECONDS)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            // startService, not stopService, so a stop that arrives before the
            // service is up still goes through stopRinging().
            context.startService(Intent(context, RingService::class.java).setAction(ACTION_STOP))
        }

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
