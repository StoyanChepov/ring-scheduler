<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../services/api';

type AlarmEvent = {
  id: string;
  type: 'STARTED' | 'FINISHED' | 'STOPPED' | 'FAILED';
  source: 'SCHEDULE' | 'COMMAND';
  scheduleId: string | null;
  detail: string | null;
  occurredAt: string;
};

const props = defineProps<{ deviceId: string }>();

const events = ref<AlarmEvent[]>([]);
const error = ref('');

const LABELS: Record<AlarmEvent['type'], string> = {
  STARTED: 'Rang',
  FINISHED: 'Finished',
  STOPPED: 'Stopped',
  FAILED: 'Failed',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function load() {
  try {
    const response = await api.get<AlarmEvent[]>(`/devices/${props.deviceId}/events`, {
      params: { limit: 15 },
    });
    events.value = response.data;
    error.value = '';
  } catch {
    error.value = 'Failed to load activity.';
  }
}

// The phone reports in the background, so check for news now and then.
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  load();
  timer = setInterval(load, 30_000);
});

onBeforeUnmount(() => clearInterval(timer));

defineExpose({ load });
</script>

<template>
  <section class="card">
    <div class="card-header">
      <h2>Recent activity</h2>
      <button class="link" type="button" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <ul v-if="events.length" class="event-list">
      <li v-for="event in events" :key="event.id" :class="event.type.toLowerCase()">
        <span class="badge">{{ LABELS[event.type] }}</span>
        <span class="what">
          {{ event.source === 'SCHEDULE' ? 'Scheduled alarm' : 'Ring now' }}
          <span v-if="event.detail" class="muted"> · {{ event.detail }}</span>
        </span>
        <span class="muted small time">{{ when(event.occurredAt) }}</span>
      </li>
    </ul>
    <p v-else class="muted small">
      Nothing yet. The phone reports here when it rings or is stopped.
    </p>
  </section>
</template>

<style scoped>
.event-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.event-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
}

.event-list li:last-child {
  border-bottom: 0;
}

.badge {
  min-width: 76px;
  text-align: center;
}

.started .badge {
  background: var(--success-bg);
  color: var(--success);
}

.failed .badge {
  background: var(--danger-bg);
  color: var(--danger);
}

.what {
  flex: 1;
  min-width: 160px;
}
</style>
