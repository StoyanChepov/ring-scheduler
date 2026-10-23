<script setup lang="ts">
import { ref } from 'vue';
import { lastSeen, type Device } from '../composables/useDevices';
import { useRingtones } from '../composables/useRingtones';
import { api } from '../services/api';
import DeviceActivity from './DeviceActivity.vue';
import DeviceSchedules from './DeviceSchedules.vue';
import RingtonesCard from './RingtonesCard.vue';

const props = defineProps<{ device: Device }>();
const emit = defineEmits<{ back: [] }>();

const { ringtones } = useRingtones();

const ringSeconds = ref(30);
// '' means the phone's own alarm sound.
const ringRingtoneId = ref('');
const isSending = ref(false);
const message = ref('');
const messageIsError = ref(false);
const activity = ref<InstanceType<typeof DeviceActivity> | null>(null);

type Delivery = { delivered: boolean; message: string };

async function send(action: 'ring' | 'stop') {
  isSending.value = true;
  message.value = '';

  try {
    const body =
      action === 'ring'
        ? {
            durationSeconds: Number(ringSeconds.value),
            ...(ringRingtoneId.value && { ringtoneId: ringRingtoneId.value }),
          }
        : undefined;
    const response = await api.post<{ delivery?: Delivery }>(
      `/devices/${props.device.id}/${action}`,
      body,
    );
    const delivery = response.data.delivery;

    message.value = delivery?.message ?? 'Sent.';
    // A command can be saved but still fail to reach the phone.
    messageIsError.value = delivery ? !delivery.delivered : false;

    // The phone reports back within a few seconds.
    setTimeout(() => activity.value?.load(), 4_000);
  } catch (error) {
    console.error(error);
    message.value = action === 'ring' ? 'Failed to ring the phone.' : 'Failed to stop it.';
    messageIsError.value = true;
  } finally {
    isSending.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <div>
      <button class="link back" type="button" @click="emit('back')">‹ All devices</button>
      <h1>{{ device.name }}</h1>
      <p class="muted small">
        {{ device.platform === 'ANDROID' ? 'Android phone' : 'Test device' }}
        · {{ lastSeen(device) }}
      </p>
    </div>

    <section class="card">
      <div class="card-header">
        <h2>Ring now</h2>
      </div>

      <div class="ring-form">
        <label class="field">
          Duration (seconds)
          <input v-model="ringSeconds" type="number" min="1" max="300" />
        </label>

        <label class="field">
          Sound
          <select v-model="ringRingtoneId">
            <option value="">Phone's alarm sound</option>
            <option v-for="tone in ringtones" :key="tone.id" :value="tone.id">
              {{ tone.name }}
            </option>
          </select>
        </label>

        <div class="row actions">
          <button :disabled="isSending" @click="send('ring')">Ring</button>
          <button class="danger" :disabled="isSending" @click="send('stop')">Stop</button>
        </div>
      </div>

      <p v-if="message" :class="messageIsError ? 'error' : 'notice'" class="result">
        {{ message }}
      </p>
    </section>

    <DeviceSchedules :device-id="device.id" :is-phone="device.platform === 'ANDROID'" />

    <RingtonesCard />

    <DeviceActivity v-if="device.platform === 'ANDROID'" ref="activity" :device-id="device.id" />
  </div>
</template>

<style scoped>
.back {
  margin: 0 0 8px -6px;
  color: var(--text-muted);
}

.ring-form {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
}

.actions {
  flex-wrap: nowrap;
}

.result {
  margin-top: 12px;
}

@media (max-width: 600px) {
  .ring-form {
    grid-template-columns: 1fr;
  }
}
</style>
