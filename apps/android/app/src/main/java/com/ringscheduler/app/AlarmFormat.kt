package com.ringscheduler.app

import android.content.Context
import android.text.format.DateFormat
import java.time.DayOfWeek
import java.time.Duration
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/** How alarms read on the home screen. Times follow the phone's 12/24-hour setting. */
class AlarmFormat(private val context: Context, private val zone: ZoneId = ZoneId.systemDefault()) {

    private val locale = Locale.getDefault()
    private val timeFormat = DateTimeFormatter.ofPattern(
        if (DateFormat.is24HourFormat(context)) "HH:mm" else "h:mm a",
        locale,
    )
    private val dateFormat = DateTimeFormatter.ofPattern("EEE d MMM", locale)

    fun time(time: LocalTime): String = timeFormat.format(time)

    fun time(at: Instant): String = time(at.atZone(zone).toLocalTime())

    /** The time an alarm rings at, as shown in its row. */
    fun time(schedule: Schedule): String = when {
        schedule.timeOfDay != null -> time(schedule.timeOfDay)
        schedule.startAt != null -> time(schedule.startAt)
        else -> "--:--"
    }

    /** "Today · Sun 25 Oct", "Tomorrow · Mon 26 Oct", or just the date. */
    fun day(at: Instant, now: Instant = Instant.now()): String {
        val date = at.atZone(zone).toLocalDate()
        val today = now.atZone(zone).toLocalDate()
        val word = when (date) {
            today -> context.getString(R.string.today)
            today.plusDays(1) -> context.getString(R.string.tomorrow)
            else -> null
        }
        val dateText = dateFormat.format(date)
        return if (word == null) dateText else context.getString(R.string.separator, word, dateText)
    }

    /** "in 9 h 12 min" */
    fun countdown(at: Instant, now: Instant = Instant.now()): String {
        val minutes = Duration.between(now, at).toMinutes()
        return when {
            minutes < 1 -> context.getString(R.string.in_less_than_a_minute)
            minutes < 60 -> context.getString(R.string.in_minutes, minutes.toInt())
            minutes < 24 * 60 -> context.getString(R.string.in_hours_minutes, (minutes / 60).toInt(), (minutes % 60).toInt())
            else -> context.getString(R.string.in_days_hours, (minutes / (24 * 60)).toInt(), (minutes / 60 % 24).toInt())
        }
    }

    /** "Weekdays", "Mon, Wed, Fri", "Once · Sat 31 Oct". */
    fun repeat(schedule: Schedule, now: Instant = Instant.now()): String = when (schedule.kind) {
        Schedule.ONE_TIME -> {
            val at = schedule.startAt
            if (at == null || !at.isAfter(now)) context.getString(R.string.once_passed)
            else context.getString(R.string.once, day(at, now))
        }
        else -> when (schedule.daysOfWeek) {
            emptySet<Int>() -> context.getString(R.string.no_days)
            (1..7).toSet() -> context.getString(R.string.every_day)
            (1..5).toSet() -> context.getString(R.string.weekdays)
            setOf(6, 7) -> context.getString(R.string.weekends)
            else -> schedule.daysOfWeek.sorted().joinToString(", ") {
                DayOfWeek.of(it).getDisplayName(TextStyle.SHORT, locale)
            }
        }
    }

    /** "30 s", "2 min", "1 min 30 s". */
    fun duration(seconds: Int): String = when {
        seconds < 60 -> context.getString(R.string.seconds_short, seconds)
        seconds % 60 == 0 -> context.getString(R.string.minutes_short, seconds / 60)
        else -> context.getString(R.string.minutes_seconds_short, seconds / 60, seconds % 60)
    }
}
