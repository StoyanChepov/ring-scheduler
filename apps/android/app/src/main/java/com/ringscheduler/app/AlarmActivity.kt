package com.ringscheduler.app

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button

/**
 * Shown over the lock screen while ringing, so a phone that rings with its
 * screen off lights up with a way to stop it. Opened by the ringing
 * notification's full-screen intent.
 */
class AlarmActivity : Activity() {

    private val stoppedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) = finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContentView(R.layout.activity_alarm)
        findViewById<Button>(R.id.stopButton).setOnClickListener {
            RingService.stop(this, RingService.STOPPED_ON_PHONE)
            finish()
        }

        // Close when ringing ends some other way: timeout, RING_STOP, notification.
        val filter = IntentFilter(RingService.ACTION_RINGING_STOPPED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(stoppedReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(stoppedReceiver, filter)
        }
    }

    override fun onResume() {
        super.onResume()
        // Reopened from recents or the notification after ringing ended.
        if (!RingService.isRinging) finish()
    }

    override fun onDestroy() {
        unregisterReceiver(stoppedReceiver)
        super.onDestroy()
    }
}
