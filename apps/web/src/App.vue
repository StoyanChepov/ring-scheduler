<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import AuthForm from './components/AuthForm.vue';
import DeviceSchedules from './components/DeviceSchedules.vue';
import { useAuth } from './composables/useAuth';
import { api } from './services/api';

type Device = {
  id: string;
  name: string;
  platform: string;
  fcmToken?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
};

const { user, isLoggedIn, isRestoring, restoreSession, logout } = useAuth();

const devices = ref<Device[]>([]);
const newDeviceName = ref('Mock Android Phone');
const ringSeconds = ref(30);
const isLoading = ref(false);
const message = ref('');
const messageIsError = ref(false);

type Delivery = {
  mode: 'mock' | 'fcm';
  delivered: boolean;
  message: string;
};

function showDelivery(delivery: Delivery | undefined, fallback: string) {
  message.value = delivery?.message ?? fallback;
  // A command can be saved but still fail to reach the device.
  messageIsError.value = delivery ? !delivery.delivered : false;
}

async function loadDevices() {
  isLoading.value = true;
  message.value = '';

  try {
    const response = await api.get<Device[]>('/devices');
    devices.value = response.data;
  } catch (error) {
    console.error(error);
    message.value = 'Failed to load devices.';
    messageIsError.value = true;
  } finally {
    isLoading.value = false;
  }
}

async function createDevice() {
  if (!newDeviceName.value.trim()) {
    message.value = 'Device name is required.';
    messageIsError.value = true;
    return;
  }

  isLoading.value = true;
  message.value = '';

  try {
    await api.post('/devices', {
      name: newDeviceName.value,
      platform: 'MOCK',
    });

    newDeviceName.value = '';
    message.value = 'Device created.';
    messageIsError.value = false;
    await loadDevices();
  } catch (error) {
    console.error(error);
    message.value = 'Failed to create device.';
    messageIsError.value = true;
  } finally {
    isLoading.value = false;
  }
}

async function ringDevice(device: Device) {
  isLoading.value = true;
  message.value = '';

  try {
    const response = await api.post(`/devices/${device.id}/ring`, {
      durationSeconds: Number(ringSeconds.value),
    });

    showDelivery(response.data?.delivery, `Ring command sent to ${device.name}.`);
  } catch (error) {
    console.error(error);
    message.value = `Failed to ring ${device.name}.`;
    messageIsError.value = true;
  } finally {
    isLoading.value = false;
  }
}

async function stopDevice(device: Device) {
  isLoading.value = true;
  message.value = '';

  try {
    const response = await api.post(`/devices/${device.id}/stop`);

    showDelivery(response.data?.delivery, `Stop command sent to ${device.name}.`);
  } catch (error) {
    console.error(error);
    message.value = `Failed to stop ${device.name}.`;
    messageIsError.value = true;
  } finally {
    isLoading.value = false;
  }
}

// Load the user's devices on login; drop them on logout so the next person
// to log in on this browser never sees stale data.
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    loadDevices();
  } else {
    devices.value = [];
    message.value = '';
  }
});

onMounted(restoreSession);
</script>

<template>
  <main class="page">
    <section class="hero">
      <p class="eyebrow">RingScheduler</p>
      <h1>Remote device ringing dashboard</h1>
      <p class="subtitle">
        Ring your devices now, or schedule alarms that ring even when the phone is offline.
      </p>
    </section>

    <p v-if="isRestoring" class="muted session-note">Restoring your session...</p>

    <AuthForm v-else-if="!isLoggedIn" />

    <template v-else>
    <section class="card user-bar">
      <span>Signed in as <strong>{{ user?.email }}</strong></span>
      <button class="secondary" @click="logout">Log out</button>
    </section>

    <section class="card">
      <h2>Add mock device</h2>

      <div class="form-row">
        <input
          v-model="newDeviceName"
          type="text"
          placeholder="Device name"
          @keyup.enter="createDevice"
        />

        <button :disabled="isLoading" @click="createDevice">
          Add device
        </button>
      </div>
    </section>

    <section class="card">
      <div class="section-header">
        <h2>Devices</h2>

        <button class="secondary" :disabled="isLoading" @click="loadDevices">
          Refresh
        </button>
      </div>

      <div class="duration-row">
        <label for="duration">Ring duration</label>
        <input
          id="duration"
          v-model="ringSeconds"
          type="number"
          min="1"
          max="300"
        />
        <span>seconds</span>
      </div>

      <p v-if="message" class="message" :class="{ error: messageIsError }">
        {{ message }}
      </p>

      <p v-if="isLoading" class="muted">
        Loading...
      </p>

      <p v-if="!isLoading && devices.length === 0" class="muted">
        No devices yet. Add your first mock device above.
      </p>

      <ul class="device-list">
        <li v-for="device in devices" :key="device.id" class="device-card">
          <div>
            <h3>{{ device.name }}</h3>
            <p>{{ device.platform }} · {{ device.id }}</p>
          </div>

          <div class="actions">
            <button :disabled="isLoading" @click="ringDevice(device)">
              Ring
            </button>

            <button class="danger" :disabled="isLoading" @click="stopDevice(device)">
              Stop
            </button>
          </div>

          <DeviceSchedules :device-id="device.id" :is-phone="device.platform === 'ANDROID'" />
        </li>
      </ul>
    </section>
    </template>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 48px 24px;
  background: #f5f7fb;
  color: #172033;
}

.hero {
  max-width: 900px;
  margin: 0 auto 24px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #52627a;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 42px;
  line-height: 1.1;
}

.subtitle {
  max-width: 680px;
  color: #52627a;
  font-size: 18px;
}

.card {
  max-width: 900px;
  margin: 0 auto 20px;
  padding: 24px;
  background: white;
  border: 1px solid #e1e6ef;
  border-radius: 18px;
  box-shadow: 0 12px 30px rgba(23, 32, 51, 0.06);
}

.session-note {
  max-width: 900px;
  margin: 0 auto;
}

.user-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.section-header,
.form-row,
.duration-row,
.device-card,
.actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.section-header,
.device-card {
  justify-content: space-between;
}

.form-row input {
  flex: 1;
}

input {
  padding: 12px 14px;
  border: 1px solid #cfd7e6;
  border-radius: 12px;
  font-size: 15px;
}

.duration-row {
  margin-bottom: 16px;
}

.duration-row input {
  width: 90px;
}

button {
  padding: 12px 16px;
  border: 0;
  border-radius: 12px;
  background: #172033;
  color: white;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button.secondary {
  background: #e8edf6;
  color: #172033;
}

button.danger {
  background: #b42318;
}

.message {
  padding: 12px 14px;
  background: #eef7ee;
  border: 1px solid #cde8cd;
  border-radius: 12px;
}

.message.error {
  background: #fdeceb;
  border-color: #f3c5c1;
  color: #b42318;
}

.muted {
  color: #68758a;
}

.device-list {
  display: grid;
  gap: 12px;
  padding: 0;
  list-style: none;
}

.device-card {
  flex-wrap: wrap;
  padding: 16px;
  border: 1px solid #e1e6ef;
  border-radius: 14px;
}

.device-card h3 {
  margin: 0 0 6px;
}

.device-card p {
  margin: 0;
  color: #68758a;
  font-size: 13px;
  word-break: break-all;
}
</style>