import { ref } from 'vue';
import { api } from '../services/api';

export type Device = {
  id: string;
  name: string;
  platform: string;
  fcmToken?: string | null;
  lastSeenAt?: string | null;
  createdAt: string;
};

// One list for the page, shared by the list and the details view.
const devices = ref<Device[]>([]);
const isLoading = ref(false);
const hasLoaded = ref(false);
const error = ref('');

async function load() {
  isLoading.value = true;
  error.value = '';

  try {
    const response = await api.get<Device[]>('/devices');
    devices.value = response.data;
  } catch (err) {
    console.error(err);
    error.value = 'Failed to load your devices.';
  } finally {
    isLoading.value = false;
    hasLoaded.value = true;
  }
}

function clear() {
  devices.value = [];
  hasLoaded.value = false;
  error.value = '';
}

/** "5 min ago"-style text for when the phone last talked to the server. */
export function lastSeen(device: Device): string {
  if (!device.lastSeenAt) return 'Never connected';

  const seconds = (new Date(device.lastSeenAt).getTime() - Date.now()) / 1000;
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      return `Last seen ${format.format(Math.round(seconds / size), unit)}`;
    }
  }
  return 'Last seen just now';
}

export function useDevices() {
  return { devices, isLoading, hasLoaded, error, load, clear };
}
