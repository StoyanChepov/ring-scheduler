<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { lastSeen, useDevices, type Device } from '../composables/useDevices';
import { useRingtones } from '../composables/useRingtones';
import { api } from '../services/api';
import DeviceActivity from './DeviceActivity.vue';
import DeviceSchedules from './DeviceSchedules.vue';
import RingtonesCard from './RingtonesCard.vue';

const props = defineProps<{ device: Device }>();
const emit = defineEmits<{ back: [] }>();

const { ringtones } = useRingtones();
const { load: reloadDevices, rename } = useDevices();

const isRenaming = ref(false);
const isSavingName = ref(false);
const newName = ref('');
const renameError = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

async function startRename() {
  newName.value = props.device.name;
  renameError.value = '';
  isRenaming.value = true;
  await nextTick();
  nameInput.value?.select();
}

async function saveName() {
  const name = newName.value.trim();
  if (!name) return;
  if (name === props.device.name) {
    isRenaming.value = false;
    return;
  }

  isSavingName.value = true;
  renameError.value = '';

  try {
    await rename(props.device.id, name);
    isRenaming.value = false;
  } catch (error) {
    console.error(error);
    renameError.value = 'Failed to rename the device.';
  } finally {
    isSavingName.value = false;
  }
}

const isRemoving = ref(false);
const removeError = ref('');

async function removeDevice() {
  const confirmed = window.confirm(
    `Remove "${props.device.name}"? Its alarms and history are deleted, and the phone is signed out and stops ringing on them.`,
  );
  if (!confirmed) return;

  isRemoving.value = true;
  removeError.value = '';

  try {
    await api.delete(`/devices/${props.device.id}`);
    await reloadDevices();
    emit('back');
  } catch (error) {
    console.error(error);
    removeError.value = 'Failed to remove the device.';
  } finally {
    isRemoving.value = false;
  }
}

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

      <form v-if="isRenaming" class="rename" @submit.prevent="saveName">
        <input
          ref="nameInput"
          v-model="newName"
          aria-label="Device name"
          maxlength="80"
          required
          @keydown.esc="isRenaming = false"
        />
        <button type="submit" :disabled="isSavingName || !newName.trim()">Save</button>
        <button class="secondary" type="button" @click="isRenaming = false">Cancel</button>
      </form>

      <div v-else class="title">
        <h1>{{ device.name }}</h1>
        <button class="link" type="button" @click="startRename">Rename</button>
      </div>

      <p v-if="renameError" class="error" role="alert">{{ renameError }}</p>
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

    <section class="card remove">
      <div>
        <h2>Remove this device</h2>
        <p class="muted small">
          Deletes its alarms and history. The phone is signed out and stops
          ringing on them; logging in on it again adds it back as new.
        </p>
      </div>
      <button class="danger" :disabled="isRemoving" @click="removeDevice">
        {{ isRemoving ? 'Removing…' : 'Remove device' }}
      </button>
      <p v-if="removeError" class="error">{{ removeError }}</p>
    </section>
  </div>
</template>

<style scoped>
.back {
  margin: 0 0 8px -6px;
  color: var(--text-muted);
}

.title {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.title h1 {
  min-width: 0;
  overflow-wrap: anywhere;
}

.title .link {
  flex: none;
  color: var(--text-muted);
  text-decoration: underline;
}

.rename {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.rename input {
  flex: 1;
  min-width: 200px;
  font-size: 18px;
  font-weight: 600;
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

.remove {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  align-items: center;
  justify-content: space-between;
  border-color: var(--danger-border);
}

.remove > div {
  flex: 1;
  min-width: 220px;
}

.remove .error {
  flex-basis: 100%;
}

@media (max-width: 600px) {
  .ring-form {
    grid-template-columns: 1fr;
  }
}
</style>
