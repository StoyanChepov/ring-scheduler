<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { isAxiosError } from 'axios';
import { api } from '../services/api';

type Schedule = {
  id: string;
  kind: 'ONE_TIME' | 'WEEKLY';
  startAt: string | null;
  timeOfDay: string | null;
  daysOfWeek: number[];
  durationSeconds: number;
  label: string | null;
  isActive: boolean;
};

const props = defineProps<{ deviceId: string; isPhone: boolean }>();

// 1 = Monday ... 7 = Sunday, matching the API.
const DAYS = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 7, short: 'Sun' },
];

const schedules = ref<Schedule[]>([]);
const isBusy = ref(false);
const error = ref('');

const kind = ref<'ONE_TIME' | 'WEEKLY'>('ONE_TIME');
const startAtLocal = ref(defaultStartAt());
const timeOfDay = ref('07:00');
const days = ref<number[]>([1, 2, 3, 4, 5]);
const durationSeconds = ref(30);
const label = ref('');

const url = computed(() => `/devices/${props.deviceId}/schedules`);

/** Five minutes from now, in the format a datetime-local input expects. */
function defaultStartAt(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function describe(schedule: Schedule): string {
  if (schedule.kind === 'ONE_TIME' && schedule.startAt) {
    const at = new Date(schedule.startAt);
    const text = at.toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return at.getTime() < Date.now() ? `${text} (past)` : text;
  }

  const sorted = [...schedule.daysOfWeek].sort((a, b) => a - b);
  const dayText =
    sorted.length === 7
      ? 'Every day'
      : sorted.join() === '1,2,3,4,5'
        ? 'Weekdays'
        : sorted.join() === '6,7'
          ? 'Weekends'
          : sorted.map((d) => DAYS[d - 1]?.short).join(', ');

  return `${dayText} at ${schedule.timeOfDay} (phone's time)`;
}

function describeError(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const message = err.response?.data?.message;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return fallback;
}

async function load() {
  try {
    const response = await api.get<Schedule[]>(url.value);
    schedules.value = response.data;
  } catch (err) {
    error.value = describeError(err, 'Failed to load schedules.');
  }
}

async function run(action: () => Promise<unknown>, fallback: string) {
  isBusy.value = true;
  error.value = '';

  try {
    await action();
    await load();
  } catch (err) {
    error.value = describeError(err, fallback);
  } finally {
    isBusy.value = false;
  }
}

function toggleDay(day: number) {
  days.value = days.value.includes(day)
    ? days.value.filter((d) => d !== day)
    : [...days.value, day];
}

function addSchedule() {
  const common = {
    durationSeconds: Number(durationSeconds.value),
    ...(label.value.trim() && { label: label.value.trim() }),
  };

  // datetime-local has no time zone; new Date() reads it as this browser's
  // local time, and toISOString() sends the exact moment.
  const body =
    kind.value === 'ONE_TIME'
      ? { kind: 'ONE_TIME', startAt: new Date(startAtLocal.value).toISOString(), ...common }
      : { kind: 'WEEKLY', timeOfDay: timeOfDay.value, daysOfWeek: days.value, ...common };

  return run(async () => {
    await api.post(url.value, body);
    label.value = '';
    startAtLocal.value = defaultStartAt();
  }, 'Failed to add the alarm.');
}

function setActive(schedule: Schedule, isActive: boolean) {
  return run(
    () => api.patch(`${url.value}/${schedule.id}`, { isActive }),
    'Failed to update the alarm.',
  );
}

function remove(schedule: Schedule) {
  return run(
    () => api.delete(`${url.value}/${schedule.id}`),
    'Failed to delete the alarm.',
  );
}

onMounted(load);
</script>

<template>
  <div class="schedules">
    <h4>Scheduled alarms</h4>

    <p v-if="!isPhone" class="muted small">
      Schedules only ring on a real Android phone; this device will just store them.
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <ul v-if="schedules.length" class="schedule-list">
      <li v-for="schedule in schedules" :key="schedule.id" :class="{ paused: !schedule.isActive }">
        <div>
          <strong>{{ describe(schedule) }}</strong>
          <span class="muted small">
            · {{ schedule.durationSeconds }}s<template v-if="schedule.label"> · {{ schedule.label }}</template>
          </span>
        </div>

        <div class="row">
          <label class="toggle">
            <input
              type="checkbox"
              :checked="schedule.isActive"
              :disabled="isBusy"
              @change="setActive(schedule, ($event.target as HTMLInputElement).checked)"
            />
            On
          </label>
          <button class="link danger" :disabled="isBusy" @click="remove(schedule)">
            Delete
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="muted small">No alarms yet.</p>

    <form class="add" @submit.prevent="addSchedule">
      <div class="row">
        <select v-model="kind" aria-label="Alarm type">
          <option value="ONE_TIME">Once</option>
          <option value="WEEKLY">Every week</option>
        </select>

        <input
          v-if="kind === 'ONE_TIME'"
          v-model="startAtLocal"
          type="datetime-local"
          required
          aria-label="Date and time"
        />
        <input v-else v-model="timeOfDay" type="time" required aria-label="Time" />
      </div>

      <div v-if="kind === 'WEEKLY'" class="row days" role="group" aria-label="Days">
        <button
          v-for="day in DAYS"
          :key="day.value"
          type="button"
          class="day"
          :class="{ selected: days.includes(day.value) }"
          :aria-pressed="days.includes(day.value)"
          @click="toggleDay(day.value)"
        >
          {{ day.short }}
        </button>
      </div>

      <div class="row">
        <input v-model="label" type="text" maxlength="80" placeholder="Label (optional)" class="grow" />
        <input
          v-model="durationSeconds"
          type="number"
          min="1"
          max="300"
          aria-label="Ring duration in seconds"
          class="narrow"
        />
        <span class="muted small">sec</span>
        <button type="submit" :disabled="isBusy || (kind === 'WEEKLY' && days.length === 0)">
          Add alarm
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.schedules {
  flex-basis: 100%;
  padding-top: 12px;
  border-top: 1px solid #e1e6ef;
}

h4 {
  margin: 0 0 8px;
  color: #172033;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.schedule-list {
  display: grid;
  gap: 6px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}

.schedule-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f7fb;
  border-radius: 10px;
  color: #172033;
  font-size: 15px;
}

.schedule-list li.paused {
  opacity: 0.55;
}

.add {
  display: grid;
  gap: 8px;
}

input,
select {
  padding: 8px 10px;
  border: 1px solid #cfd7e6;
  border-radius: 10px;
  font-size: 15px;
}

.grow {
  flex: 1;
  min-width: 140px;
}

.narrow {
  width: 70px;
}

button {
  padding: 8px 14px;
  border: 0;
  border-radius: 10px;
  background: #172033;
  color: white;
  cursor: pointer;
  font-weight: 700;
}

button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

button.day {
  padding: 6px 10px;
  background: #e8edf6;
  color: #172033;
  font-weight: 600;
}

button.day.selected {
  background: #172033;
  color: white;
}

button.link {
  padding: 4px 6px;
  background: none;
  color: #172033;
}

button.link.danger {
  color: #b42318;
}

.toggle {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 14px;
}

.muted {
  color: #68758a;
}

.small {
  font-size: 13px;
}

.error {
  margin: 0 0 8px;
  padding: 8px 12px;
  background: #fdeceb;
  border: 1px solid #f3c5c1;
  border-radius: 10px;
  color: #b42318;
  font-size: 14px;
}
</style>
