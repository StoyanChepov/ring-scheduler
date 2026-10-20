<script setup lang="ts">
import { ref } from 'vue';
import { isAxiosError } from 'axios';
import { useRingtones } from '../composables/useRingtones';

const { ringtones, upload, remove, play } = useRingtones();

const fileInput = ref<HTMLInputElement | null>(null);
const name = ref('');
const isBusy = ref(false);
const error = ref('');

const MAX_BYTES = 1024 * 1024;

function describeError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    if (err.response?.status === 413) return 'That file is over 1 MB.';
    const message = err.response?.data?.message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

async function run(action: () => Promise<unknown>, fallback: string) {
  isBusy.value = true;
  error.value = '';
  try {
    await action();
  } catch (err) {
    error.value = describeError(err, fallback);
  } finally {
    isBusy.value = false;
  }
}

function onUpload() {
  const file = fileInput.value?.files?.[0];

  if (!file) {
    error.value = 'Choose an audio file first.';
    return;
  }
  // Checked here too, so a big file isn't uploaded only to be refused.
  if (file.size > MAX_BYTES) {
    error.value = 'That file is over 1 MB.';
    return;
  }

  return run(async () => {
    await upload(file, name.value);
    name.value = '';
    if (fileInput.value) fileInput.value.value = '';
  }, 'Failed to upload the ringtone.');
}

function kb(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
</script>

<template>
  <section class="card">
    <h2>Ringtones</h2>
    <p class="muted">
      Upload your own alarm sounds (MP3, OGG, WAV or M4A, up to 1 MB) and pick
      them for alarms or "Ring now". Phones download them so alarms still play
      them offline.
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <form class="row" @submit.prevent="onUpload">
      <input ref="fileInput" type="file" accept="audio/*" aria-label="Audio file" />
      <input v-model="name" type="text" maxlength="80" placeholder="Name (optional)" class="grow" />
      <button type="submit" :disabled="isBusy">Upload</button>
    </form>

    <ul v-if="ringtones.length" class="tone-list">
      <li v-for="tone in ringtones" :key="tone.id">
        <span>
          <strong>{{ tone.name }}</strong>
          <span class="muted small"> · {{ kb(tone.sizeBytes) }}</span>
        </span>
        <span class="row">
          <button class="link" type="button" @click="run(() => play(tone.id), 'Could not play it.')">
            ▶ Play
          </button>
          <button
            class="link danger"
            type="button"
            :disabled="isBusy"
            @click="run(() => remove(tone.id), 'Failed to delete the ringtone.')"
          >
            Delete
          </button>
        </span>
      </li>
    </ul>
    <p v-else class="muted small">No ringtones yet; alarms use the phone's alarm sound.</p>
  </section>
</template>

<style scoped>
.card {
  max-width: 900px;
  margin: 0 auto 20px;
  padding: 24px;
  background: white;
  border: 1px solid #e1e6ef;
  border-radius: 18px;
  box-shadow: 0 12px 30px rgba(23, 32, 51, 0.06);
}

h2 {
  margin-top: 0;
  color: #172033;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.grow {
  flex: 1;
  min-width: 160px;
}

input {
  padding: 10px 12px;
  border: 1px solid #cfd7e6;
  border-radius: 12px;
  font-size: 15px;
}

button {
  padding: 10px 16px;
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

button.link {
  padding: 4px 6px;
  background: none;
  color: #172033;
}

button.link.danger {
  color: #b42318;
}

.tone-list {
  display: grid;
  gap: 6px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.tone-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fb;
  border-radius: 10px;
  color: #172033;
}

.muted {
  color: #68758a;
}

.small {
  font-size: 13px;
}

.error {
  padding: 8px 12px;
  background: #fdeceb;
  border: 1px solid #f3c5c1;
  border-radius: 10px;
  color: #b42318;
  font-size: 14px;
}
</style>
