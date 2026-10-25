<script setup lang="ts">
import { ref } from 'vue';
import { isAxiosError } from 'axios';
import { useAuth } from '../composables/useAuth';

const emit = defineEmits<{ back: [] }>();

const { user, changePassword, deleteAccount } = useAuth();

function describeError(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback;

  const status = err.response?.status;

  if (status === 403) return 'That password is incorrect.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status === 400) {
    const message = err.response?.data?.message;
    return Array.isArray(message) ? message.join(' ') : 'Please check the details you entered.';
  }

  return fallback;
}

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const isChanging = ref(false);
const changeError = ref('');
const changeNotice = ref('');

async function submitPasswordChange() {
  changeError.value = '';
  changeNotice.value = '';

  if (newPassword.value !== confirmPassword.value) {
    changeError.value = "The new passwords don't match.";
    return;
  }

  isChanging.value = true;

  try {
    await changePassword(currentPassword.value, newPassword.value);
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    changeNotice.value = 'Password changed. Use the new one next time you log in.';
  } catch (err) {
    console.error(err);
    changeError.value = describeError(err, 'Failed to change the password.');
  } finally {
    isChanging.value = false;
  }
}

const deletePassword = ref('');
const isDeleting = ref(false);
const deleteError = ref('');

async function submitDelete() {
  const confirmed = window.confirm(
    'Delete your account? All your devices, alarms, ringtones and history are deleted, and your phones are signed out. This cannot be undone.',
  );
  if (!confirmed) return;

  isDeleting.value = true;
  deleteError.value = '';

  try {
    await deleteAccount(deletePassword.value);
    emit('back');
  } catch (err) {
    console.error(err);
    deleteError.value = describeError(err, 'Failed to delete the account.');
  } finally {
    isDeleting.value = false;
  }
}
</script>

<template>
  <div class="stack">
    <div>
      <button class="link back" type="button" @click="emit('back')">‹ All devices</button>
      <h1>Account</h1>
      <p class="muted small">Logged in as {{ user?.email }}</p>
    </div>

    <section class="card">
      <div class="card-header">
        <h2>Change password</h2>
      </div>

      <form class="form" @submit.prevent="submitPasswordChange">
        <label class="field">
          Current password
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            maxlength="72"
            required
          />
        </label>

        <label class="field">
          New password
          <input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            maxlength="72"
            required
          />
          <span class="hint">At least 8 characters.</span>
        </label>

        <label class="field">
          New password again
          <input
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            minlength="8"
            maxlength="72"
            required
          />
        </label>

        <p v-if="changeError" class="error" role="alert">{{ changeError }}</p>
        <p v-if="changeNotice" class="notice" role="status">{{ changeNotice }}</p>

        <p>
          <button type="submit" :disabled="isChanging">
            {{ isChanging ? 'Changing…' : 'Change password' }}
          </button>
        </p>
      </form>
    </section>

    <section class="card danger-zone">
      <div class="card-header">
        <h2>Delete account</h2>
      </div>

      <form class="form" @submit.prevent="submitDelete">
        <p class="muted small">
          Deletes your devices with their alarms and history, and your
          ringtones. Your phones are signed out and stop ringing on these
          alarms. This cannot be undone.
        </p>

        <label class="field">
          Password
          <input
            v-model="deletePassword"
            type="password"
            autocomplete="current-password"
            maxlength="72"
            required
          />
        </label>

        <p v-if="deleteError" class="error" role="alert">{{ deleteError }}</p>

        <p>
          <button class="danger" type="submit" :disabled="isDeleting">
            {{ isDeleting ? 'Deleting…' : 'Delete account' }}
          </button>
        </p>
      </form>
    </section>
  </div>
</template>

<style scoped>
.back {
  margin: 0 0 8px -6px;
  color: var(--text-muted);
}

.form {
  display: grid;
  gap: 16px;
  max-width: 420px;
}

.hint {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 400;
}

.danger-zone {
  border-color: var(--danger-border);
}
</style>
