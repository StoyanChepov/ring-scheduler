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
      params: { limit: 10 },
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
  <div class="activity">
    <div class="header">
      <h4>Recent activity</h4>
      <button class="link" type="button" @click="load">Refresh</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>

    <ul v-if="events.length" class="event-list">
      <li v-for="event in events" :key="event.id" :class="event.type.toLowerCase()">
        <span class="badge">{{ LABELS[event.type] }}</span>
        <span>
          {{ event.source === 'SCHEDULE' ? 'Scheduled alarm' : 'Ring now' }}
          <template v-if="event.detail"> · {{ event.detail }}</template>
        </span>
        <span class="muted time">{{ when(event.occurredAt) }}</span>
      </li>
    </ul>
    <p v-else class="muted small">
      Nothing yet. The phone reports here when it rings or is stopped.
    </p>
  </div>
</template>

<style scoped>
.activity {
  flex-basis: 100%;
  padding-top: 12px;
  border-top: 1px solid #e1e6ef;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

h4 {
  margin: 0 0 8px;
  color: #172033;
}

.event-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: #172033;
  font-size: 14px;
}

.event-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.badge {
  min-width: 64px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #e8edf6;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.started .badge {
  background: #e3f4e6;
  color: #1b6b2c;
}

.failed .badge {
  background: #fdeceb;
  color: #b42318;
}

.time {
  margin-left: auto;
  font-size: 13px;
}

button.link {
  padding: 4px 6px;
  border: 0;
  background: none;
  color: #172033;
  cursor: pointer;
  font-weight: 700;
}

.muted {
  color: #68758a;
}

.small {
  font-size: 13px;
}

.error {
  color: #b42318;
  font-size: 14px;
}
</style>
