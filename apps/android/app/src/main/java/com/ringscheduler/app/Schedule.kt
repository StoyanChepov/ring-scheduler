package com.ringscheduler.app

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

/** One alarm, as sent by `GET /device/schedules`. */
data class Schedule(
    val id: String,
    val kind: String,
    /** ONE_TIME only. */
    val startAt: Instant?,
    /** WEEKLY only: local time on the phone. */
    val timeOfDay: LocalTime?,
    /** WEEKLY only: 1 = Monday ... 7 = Sunday, as java.time numbers them. */
    val daysOfWeek: Set<Int>,
    val durationSeconds: Int,
    val label: String?,
) {
    /**
     * When this alarm should next ring after [now], or null if it never will
     * again (a one-time alarm that has passed). Weekly alarms follow the
     * phone's current time zone, like a normal alarm clock.
     */
    fun nextTrigger(now: Instant, zone: ZoneId = ZoneId.systemDefault()): Instant? {
        return when (kind) {
            ONE_TIME -> startAt?.takeIf { it.isAfter(now) }
            WEEKLY -> {
                val time = timeOfDay ?: return null
                val today = now.atZone(zone).toLocalDate()

                // Today plus the next 7 days always contains the next occurrence,
                // even when the only matching day is today and its time has passed.
                (0L..7L).asSequence()
                    .map { today.plusDays(it) }
                    .filter { it.dayOfWeek.value in daysOfWeek }
                    .map { ZonedDateTime.of(it, time, zone).toInstant() }
                    .firstOrNull { it.isAfter(now) }
            }
            else -> null
        }
    }

    fun toJson(): JSONObject = JSONObject()
        .put("id", id)
        .put("kind", kind)
        .put("startAt", startAt?.toString() ?: JSONObject.NULL)
        .put("timeOfDay", timeOfDay?.toString() ?: JSONObject.NULL)
        .put("daysOfWeek", JSONArray(daysOfWeek.sorted()))
        .put("durationSeconds", durationSeconds)
        .put("label", label ?: JSONObject.NULL)

    companion object {
        const val ONE_TIME = "ONE_TIME"
        const val WEEKLY = "WEEKLY"

        fun fromJson(json: JSONObject): Schedule {
            val days = json.optJSONArray("daysOfWeek") ?: JSONArray()
            return Schedule(
                id = json.getString("id"),
                kind = json.getString("kind"),
                startAt = json.optStringOrNull("startAt")?.let(Instant::parse),
                timeOfDay = json.optStringOrNull("timeOfDay")?.let(LocalTime::parse),
                daysOfWeek = (0 until days.length()).map { days.getInt(it) }.toSet(),
                durationSeconds = json.getInt("durationSeconds"),
                label = json.optStringOrNull("label"),
            )
        }

        fun listFromJson(array: JSONArray): List<Schedule> =
            (0 until array.length()).map { fromJson(array.getJSONObject(it)) }

        fun listToJson(schedules: List<Schedule>): JSONArray =
            JSONArray().apply { schedules.forEach { put(it.toJson()) } }

        // optString turns JSON null into the string "null".
        private fun JSONObject.optStringOrNull(key: String): String? =
            if (isNull(key)) null else optString(key)
    }
}
