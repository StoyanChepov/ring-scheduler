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
    <div class="card-header">
      <h2>Ringtones</h2>
    </div>
    <p class="muted small intro">
      Your own alarm sounds, shared by all your phones: MP3, OGG, WAV or M4A, up
      to 1 MB. Phones download them, so alarms still play them offline.
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <ul v-if="ringtones.length" class="item-list">
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

    <form class="upload" @submit.prevent="onUpload">
      <label class="field">
        Audio file
        <input ref="fileInput" type="file" accept="audio/*" />
      </label>
      <label class="field">
        Name (optional)
        <input v-model="name" type="text" maxlength="80" placeholder="e.g. Ship horn" />
      </label>
      <button type="submit" :disabled="isBusy">Upload</button>
    </form>
  </section>
</template>

<style scoped>
.intro {
  margin-bottom: 12px;
}

.upload {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

@media (max-width: 600px) {
  .upload {
    grid-template-columns: 1fr;
  }
}
</style>
