import { ref } from 'vue';
import { api } from '../services/api';

export type Ringtone = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

// One list for the whole page, so a new upload shows up in every picker.
const ringtones = ref<Ringtone[]>([]);

async function load() {
  const response = await api.get<Ringtone[]>('/ringtones');
  ringtones.value = response.data;
}

async function upload(file: File, name: string) {
  const form = new FormData();
  form.append('file', file);
  if (name.trim()) form.append('name', name.trim());

  await api.post('/ringtones', form);
  await load();
}

async function remove(id: string) {
  await api.delete(`/ringtones/${id}`);
  await load();
}

let preview: HTMLAudioElement | undefined;

/** Plays a ringtone in the browser; the file needs the login, so it's fetched first. */
async function play(id: string) {
  preview?.pause();
  const response = await api.get<Blob>(`/ringtones/${id}/file`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  preview = new Audio(url);
  preview.addEventListener('ended', () => URL.revokeObjectURL(url));
  await preview.play();
}

function nameOf(id: string | null | undefined): string {
  if (!id) return "Phone's alarm sound";
  return ringtones.value.find((r) => r.id === id)?.name ?? 'Ringtone';
}

function clear() {
  preview?.pause();
  ringtones.value = [];
}

export function useRingtones() {
  return { ringtones, load, upload, remove, play, nameOf, clear };
}
