package com.ringscheduler.app

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import org.json.JSONArray
import java.time.Instant

/**
 * Keeps the phone's alarms in line with its schedules. The schedules are cached
 * on the phone, so alarms still ring offline and can be re-set after a reboot
 * without the network.
 */
object AlarmScheduler {
    private const val TAG = "AlarmScheduler"
    private const val PREFS = "schedules"
    private const val KEY_SCHEDULES = "schedules"
    private const val KEY_ARMED_IDS = "armedIds"

    /** Downloads the schedules and re-sets every alarm. Blocking: call off the main thread. */
    fun sync(context: Context): List<Schedule> {
        val session = Session(context)
        val deviceKey = session.deviceKey ?: return emptyList()

        val schedules = ApiClient(session.serverUrl, deviceKey).fetchSchedules()
        prefs(context).edit()
            .putString(KEY_SCHEDULES, Schedule.listToJson(schedules).toString())
            .apply()

        Log.i(TAG, "Synced ${schedules.size} schedule(s)")
        rescheduleAll(context)

        // After the alarms are set, so a slow download can't delay them. An
        // alarm whose ringtone isn't cached plays the default sound instead.
        RingtoneStore.sync(context, schedules.mapNotNull { it.ringtoneId }.toSet())
        return schedules
    }

    /** Forgets the schedules and cancels every alarm (on logout). */
    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_SCHEDULES).apply()
        rescheduleAll(context)
    }

    fun cachedSchedules(context: Context): List<Schedule> {
        val json = prefs(context).getString(KEY_SCHEDULES, null) ?: return emptyList()
        return runCatching { Schedule.listFromJson(JSONArray(json)) }.getOrElse {
            Log.w(TAG, "Ignoring unreadable schedule cache", it)
            emptyList()
        }
    }

    fun find(context: Context, scheduleId: String): Schedule? =
        cachedSchedules(context).firstOrNull { it.id == scheduleId }

    /** Sets the next alarm for every cached schedule and cancels the rest. */
    fun rescheduleAll(context: Context) {
        val alarmManager = context.getSystemService(AlarmManager::class.java)
        val now = Instant.now()

        // Cancel by ID, so an alarm for a schedule that was deleted or paused on
        // the server doesn't ring.
        val previouslyArmed = prefs(context).getStringSet(KEY_ARMED_IDS, emptySet()).orEmpty()
        previouslyArmed.forEach { alarmManager.cancel(firePendingIntent(context, it)) }

        if (!canSetExactAlarms(alarmManager)) {
            Log.w(TAG, "Exact alarms are not allowed; no alarms set")
            prefs(context).edit().putStringSet(KEY_ARMED_IDS, emptySet()).apply()
            return
        }

        val armed = mutableSetOf<String>()

        for (schedule in cachedSchedules(context)) {
            val trigger = schedule.nextTrigger(now) ?: continue

            // setAlarmClock is what clock apps use: exact, allowed in Doze and
            // battery saver, and shown as the alarm icon in the status bar.
            alarmManager.setAlarmClock(
                AlarmManager.AlarmClockInfo(trigger.toEpochMilli(), showPendingIntent(context)),
                firePendingIntent(context, schedule.id),
            )
            armed += schedule.id
            Log.i(TAG, "Alarm ${schedule.id} set for $trigger")
        }

        prefs(context).edit().putStringSet(KEY_ARMED_IDS, armed).apply()
    }

    /** The soonest alarm that is set, for showing on the main screen. */
    fun nextAlarm(context: Context): Pair<Schedule, Instant>? {
        val now = Instant.now()
        return cachedSchedules(context)
            .mapNotNull { schedule -> schedule.nextTrigger(now)?.let { schedule to it } }
            .minByOrNull { it.second }
    }

    fun canSetExactAlarms(context: Context): Boolean =
        canSetExactAlarms(context.getSystemService(AlarmManager::class.java))

    private fun canSetExactAlarms(alarmManager: AlarmManager): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()

    // The schedule ID goes in the data URI, not an extra: Android tells
    // PendingIntents apart by their data, so each schedule gets its own alarm.
    private fun firePendingIntent(context: Context, scheduleId: String): PendingIntent =
        PendingIntent.getBroadcast(
            context,
            0,
            Intent(context, AlarmReceiver::class.java)
                .setData(Uri.parse("ringscheduler://schedule/$scheduleId")),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

    // Opened when the user taps the alarm in the status bar or the clock widget.
    private fun showPendingIntent(context: Context): PendingIntent =
        PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
