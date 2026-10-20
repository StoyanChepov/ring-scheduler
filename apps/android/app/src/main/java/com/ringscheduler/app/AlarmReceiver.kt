package com.ringscheduler.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Fired by AlarmManager when a scheduled alarm is due. */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val scheduleId = intent.data?.lastPathSegment ?: return
        val schedule = AlarmScheduler.find(context, scheduleId)

        if (schedule == null) {
            // Removed since the alarm was set; just tidy up.
            Log.i(TAG, "Alarm $scheduleId fired but the schedule is gone")
        } else {
            Log.i(TAG, "Alarm ${schedule.id} fired (${schedule.label ?: schedule.kind})")
            // An exact alarm is allowed to start a foreground service from the
            // background, so this works with the app closed and the screen off.
            try {
                RingService.start(
                    context,
                    RingRequest(
                        source = RingRequest.SCHEDULE,
                        scheduleId = schedule.id,
                        durationSeconds = schedule.durationSeconds,
                    ),
                )
            } catch (e: IllegalStateException) {
                // Already recorded as a failed ring; still set the next alarm.
                Log.e(TAG, "Could not start ringing", e)
            }
        }

        // Sets the next occurrence of a weekly alarm; a one-time alarm is over.
        AlarmScheduler.rescheduleAll(context)
    }

    companion object {
        private const val TAG = "AlarmReceiver"
    }
}
