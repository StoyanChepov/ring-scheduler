package com.ringscheduler.app

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/** Where a ring came from, so its history can say which alarm it was. */
data class RingRequest(
    val source: String,
    val scheduleId: String? = null,
    val commandId: String? = null,
    val durationSeconds: Int,
) {
    companion object {
        const val SCHEDULE = "SCHEDULE"
        const val COMMAND = "COMMAND"
    }
}

/**
 * Tells the API what actually happened on the phone (rang, finished, was
 * stopped, failed). Events are queued on disk first, so they survive having
 * no network and the app being killed, and are sent whenever possible. Each
 * has its own ID, so sending one twice is harmless.
 */
object EventReporter {
    private const val TAG = "EventReporter"
    private const val PREFS = "events"
    private const val KEY_QUEUE = "queue"
    private const val MAX_QUEUED = 100
    private const val BATCH = 50

    const val STARTED = "STARTED"
    const val FINISHED = "FINISHED"
    const val STOPPED = "STOPPED"
    const val FAILED = "FAILED"

    private val lock = Any()

    /** Queues an event and tries to send the queue in the background. */
    fun record(context: Context, type: String, request: RingRequest, detail: String? = null) {
        val event = JSONObject()
            .put("id", UUID.randomUUID().toString())
            .put("type", type)
            .put("source", request.source)
            .put("occurredAt", Instant.now().toString())
        request.scheduleId?.let { event.put("scheduleId", it) }
        request.commandId?.let { event.put("commandId", it) }
        detail?.let { event.put("detail", it.take(200)) }

        synchronized(lock) {
            val queue = readQueue(context)
            queue.put(event)
            // Keep the newest if the phone has been offline for a long time.
            while (queue.length() > MAX_QUEUED) queue.remove(0)
            writeQueue(context, queue)
        }

        Log.i(TAG, "Recorded $type (${request.source})")
        Thread { flush(context.applicationContext) }.start()
    }

    /** Sends queued events. Blocking: call off the main thread. */
    fun flush(context: Context) {
        val session = Session(context)
        val deviceKey = session.deviceKey ?: return

        // One upload at a time; a flush that finds one running just leaves it to it.
        if (!flushing.compareAndSet(false, true)) return

        try {
            // The lock is held only to read and write the queue, never during
            // the upload, so record() (called on the main thread) can't stall.
            val batch = synchronized(lock) {
                val queue = readQueue(context)
                JSONArray().apply {
                    for (i in 0 until minOf(queue.length(), BATCH)) put(queue.getJSONObject(i))
                }
            }
            if (batch.length() == 0) return

            try {
                ApiClient(session.serverUrl, deviceKey).reportEvents(batch)
            } catch (e: ApiException) {
                // The device was disconnected: these events have nowhere to go.
                if (e.status == 401) synchronized(lock) { writeQueue(context, JSONArray()) }
                Log.w(TAG, "Could not send events", e)
                return
            } catch (e: Exception) {
                // No network: they stay queued for next time.
                Log.w(TAG, "Could not send events", e)
                return
            }

            // Remove by ID: events recorded during the upload stay queued.
            val sent = (0 until batch.length()).map { batch.getJSONObject(it).getString("id") }.toSet()
            synchronized(lock) {
                val queue = readQueue(context)
                val remaining = JSONArray()
                for (i in 0 until queue.length()) {
                    val event = queue.getJSONObject(i)
                    if (event.getString("id") !in sent) remaining.put(event)
                }
                writeQueue(context, remaining)
            }
            Log.i(TAG, "Sent ${batch.length()} event(s)")
        } finally {
            flushing.set(false)
        }
    }

    private val flushing = AtomicBoolean(false)

    private fun readQueue(context: Context): JSONArray {
        val json = prefs(context).getString(KEY_QUEUE, null) ?: return JSONArray()
        return runCatching { JSONArray(json) }.getOrDefault(JSONArray())
    }

    private fun writeQueue(context: Context, queue: JSONArray) {
        prefs(context).edit().putString(KEY_QUEUE, queue.toString()).apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
