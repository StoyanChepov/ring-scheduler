<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { api } from './services/api';

type Device = {
  id: string;
  name: string;
  platform: string;
  fcmToken?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
};

const devices = ref<Device[]>([]);
const newDeviceName = ref('Mock Android Phone');
const ringSeconds = ref(30);
const isLoading = ref(false);
const message = ref('');

async function loadDevices() {
  isLoading.value = true;
  message.value = '';

  try {
    const response = await api.get<Device[]>('/devices');
    devices.value = response.data;
  } catch (error) {
    console.error(error);
    message.value = 'Failed to load devices.';
  } finally {
    isLoading.value = false;
  }
}

async function createDevice() {
  if (!newDeviceName.value.trim()) {
    message.value = 'Device name is required.';
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
    await loadDevices();
  } catch (error) {
    console.error(error);
    message.value = 'Failed to create device.';
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

    message.value =
      response.data?.mockDelivery?.message ?? `Ring command sent to ${device.name}.`;
  } catch (error) {
    console.error(error);
    message.value = `Failed to ring ${device.name}.`;
  } finally {
    isLoading.value = false;
  }
}

async function stopDevice(device: Device) {
  isLoading.value = true;
  message.value = '';

  try {
    const response = await api.post(`/devices/${device.id}/stop`);

    message.value =
      response.data?.mockDelivery?.message ?? `Stop command sent to ${device.name}.`;
  } catch (error) {
    console.error(error);
    message.value = `Failed to stop ${device.name}.`;
  } finally {
    isLoading.value = false;
  }
}

onMounted(loadDevices);
</script>

<template>
  <main class="page">
    <section class="hero">
      <p class="eyebrow">RingScheduler</p>
      <h1>Remote device ringing dashboard</h1>
      <p class="subtitle">
        Create mock devices, send ring commands, and stop them from the web UI.
      </p>
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

      <p v-if="message" class="message">
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
        </li>
      </ul>
    </section>
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