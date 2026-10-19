package com.ringscheduler.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Android forgets all alarms on reboot, and an alarm set for "07:30" is wrong
 * after the clock or time zone changes. Each of those re-sets them from the
 * cached schedules, with no network needed.
 */
class RescheduleReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "Re-setting alarms after ${intent.action}")
        AlarmScheduler.rescheduleAll(context)
    }

    companion object {
        private const val TAG = "RescheduleReceiver"
    }
}
