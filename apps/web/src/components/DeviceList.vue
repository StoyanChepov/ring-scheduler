<script setup lang="ts">
import { APK_URL } from '../links';
import { lastSeen, useDevices } from '../composables/useDevices';

const emit = defineEmits<{ open: [deviceId: string] }>();

const { devices, isLoading, hasLoaded, error, load } = useDevices();
</script>

<template>
  <section class="card">
    <div class="card-header">
      <h2>Your devices</h2>
      <button class="secondary" :disabled="isLoading" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <p v-else-if="!hasLoaded" class="muted">Loading…</p>

    <div v-else-if="devices.length === 0" class="empty stack">
      <p>No phones connected yet.</p>
      <p class="muted small">
        Install the Android app on a phone and log in with this account. It
        will show up here.
      </p>
      <p><a class="button" :href="APK_URL">Get the Android app</a></p>
    </div>

    <ul v-else class="device-list">
      <li v-for="device in devices" :key="device.id">
        <button class="device" type="button" @click="emit('open', device.id)">
          <span class="icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path
                fill="currentColor"
                d="M16 1H8a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3zm1 19a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16zm-5-3a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z"
              />
            </svg>
          </span>
          <span class="text">
            <strong>{{ device.name }}</strong>
            <span class="muted small">
              {{ device.platform === 'ANDROID' ? 'Android phone' : 'Test device' }}
              · {{ lastSeen(device) }}
            </span>
          </span>
          <span class="chevron" aria-hidden="true">›</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.device-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.device {
  display: flex;
  gap: 14px;
  align-items: center;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-weight: 400;
  text-align: left;
}

.device:hover {
  border-color: var(--border-strong);
  background: var(--surface-muted);
}

.icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--subtle);
}

.text {
  display: grid;
  flex: 1;
  min-width: 0;
}

.text strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--text-muted);
  font-size: 24px;
  line-height: 1;
}

.empty {
  justify-items: start;
}
</style>
