package com.ringscheduler.app

import android.content.Context
import android.util.Log
import java.io.File

/**
 * The user's uploaded ringtones, cached in the app's private storage so
 * scheduled alarms can play them with no network.
 */
object RingtoneStore {
    private const val TAG = "RingtoneStore"

    private fun dir(context: Context) = File(context.filesDir, "ringtones").apply { mkdirs() }

    /** The cached file, or null if it hasn't been downloaded. */
    fun fileFor(context: Context, ringtoneId: String): File? =
        File(dir(context), ringtoneId).takeIf { it.isFile && it.length() > 0 }

    /**
     * Downloads a ringtone unless it is already cached. Blocking: call off the
     * main thread. Returns false if it could not be fetched.
     */
    fun ensure(context: Context, ringtoneId: String, timeoutMs: Int = 10_000): Boolean {
        if (fileFor(context, ringtoneId) != null) return true

        val session = Session(context)
        val deviceKey = session.deviceKey ?: return false

        return try {
            val bytes = ApiClient(session.serverUrl, deviceKey, timeoutMs).downloadRingtone(ringtoneId)
            // Write to a temporary name first, so a half-written file is never played.
            val target = File(dir(context), ringtoneId)
            val partial = File(dir(context), "$ringtoneId.part")
            partial.writeBytes(bytes)
            partial.renameTo(target)
        } catch (e: Exception) {
            Log.w(TAG, "Could not download ringtone $ringtoneId", e)
            false
        }
    }

    /** Downloads the ringtones in use and deletes the rest. */
    fun sync(context: Context, inUse: Set<String>) {
        inUse.forEach { ensure(context, it) }

        dir(context).listFiles()
            ?.filter { it.name.removeSuffix(".part") !in inUse }
            ?.forEach { it.delete() }
    }
}
