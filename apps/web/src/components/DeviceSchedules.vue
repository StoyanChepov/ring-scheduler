<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { isAxiosError } from 'axios';
import { useRingtones } from '../composables/useRingtones';
import { api } from '../services/api';

type Schedule = {
  id: string;
  kind: 'ONE_TIME' | 'WEEKLY';
  startAt: string | null;
  timeOfDay: string | null;
  daysOfWeek: number[];
  durationSeconds: number;
  label: string | null;
  ringtoneId: string | null;
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
// '' means the phone's own alarm sound.
const ringtoneId = ref('');
const { ringtones, nameOf } = useRingtones();

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
    ...(ringtoneId.value && { ringtoneId: ringtoneId.value }),
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
  <section class="card">
    <div class="card-header">
      <h2>Scheduled alarms</h2>
    </div>

    <p v-if="!isPhone" class="muted small">
      Schedules only ring on a real Android phone; this device just stores them.
    </p>

    <p v-if="error" class="error">{{ error }}</p>

    <ul v-if="schedules.length" class="item-list alarms">
      <li v-for="schedule in schedules" :key="schedule.id" :class="{ paused: !schedule.isActive }">
        <div class="alarm-text">
          <strong>{{ describe(schedule) }}</strong>
          <span class="muted small">
            {{ schedule.label ? `${schedule.label} · ` : '' }}{{ nameOf(schedule.ringtoneId) }} ·
            {{ schedule.durationSeconds }} s
          </span>
        </div>

        <div class="row">
          <label class="toggle small">
            <input
              type="checkbox"
              :checked="schedule.isActive"
              :disabled="isBusy"
              @change="setActive(schedule, ($event.target as HTMLInputElement).checked)"
            />
            {{ schedule.isActive ? 'On' : 'Off' }}
          </label>
          <button class="link danger" :disabled="isBusy" @click="remove(schedule)">Delete</button>
        </div>
      </li>
    </ul>
    <p v-else class="muted small">No alarms yet. Add one below.</p>

    <form class="add" @submit.prevent="addSchedule">
      <h3 class="small">New alarm</h3>

      <div class="segmented" role="radiogroup" aria-label="Repeat">
        <button
          type="button"
          role="radio"
          :aria-checked="kind === 'ONE_TIME'"
          :class="{ selected: kind === 'ONE_TIME' }"
          @click="kind = 'ONE_TIME'"
        >
          Once
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="kind === 'WEEKLY'"
          :class="{ selected: kind === 'WEEKLY' }"
          @click="kind = 'WEEKLY'"
        >
          Every week
        </button>
      </div>

      <div class="fields">
        <label v-if="kind === 'ONE_TIME'" class="field">
          Date and time
          <input v-model="startAtLocal" type="datetime-local" required />
        </label>
        <label v-else class="field">
          Time (phone's time zone)
          <input v-model="timeOfDay" type="time" required />
        </label>

        <label class="field">
          Sound
          <select v-model="ringtoneId">
            <option value="">Phone's alarm sound</option>
            <option v-for="tone in ringtones" :key="tone.id" :value="tone.id">
              {{ tone.name }}
            </option>
          </select>
        </label>

        <label class="field">
          Duration (seconds)
          <input v-model="durationSeconds" type="number" min="1" max="300" />
        </label>

        <label class="field">
          Label (optional)
          <input v-model="label" type="text" maxlength="80" placeholder="e.g. Wake up" />
        </label>
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

      <div>
        <button type="submit" :disabled="isBusy || (kind === 'WEEKLY' && days.length === 0)">
          Add alarm
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
/* Each alarm is its own bordered row, like the device list, so neighbours
   don't run together. The bar on the left shows at a glance whether it's on. */
.alarms {
  gap: 10px;
}

.alarms > li {
  padding: 14px 16px 14px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid var(--primary);
}

.alarms > li.paused {
  border-left-color: var(--border-strong);
}

.alarms li.paused .alarm-text {
  opacity: 0.55;
}

.alarm-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.toggle {
  display: flex;
  gap: 6px;
  align-items: center;
}

.add {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.segmented {
  display: inline-flex;
  justify-self: start;
  padding: 3px;
  border-radius: 12px;
  background: var(--subtle);
}

.segmented button,
button.day {
  padding: 6px 14px;
  background: transparent;
  color: var(--text);
}

.segmented button.selected {
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(23, 32, 51, 0.15);
}

button.day {
  min-width: 52px;
  background: var(--subtle);
}

button.day.selected {
  background: var(--primary);
  color: var(--primary-text);
}

@media (max-width: 600px) {
  .fields {
    grid-template-columns: 1fr;
  }
}
</style>
