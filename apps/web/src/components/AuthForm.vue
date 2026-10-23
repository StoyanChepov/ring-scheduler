<script setup lang="ts">
import { computed, ref } from 'vue';
import { isAxiosError } from 'axios';
import { useAuth } from '../composables/useAuth';

const { login, register } = useAuth();

const mode = ref<'login' | 'register'>('login');
const email = ref('');
const password = ref('');
const isSubmitting = ref(false);
const error = ref('');

const isRegister = computed(() => mode.value === 'register');

function describeError(err: unknown): string {
  if (!isAxiosError(err)) {
    return 'Something went wrong. Please try again.';
  }

  const status = err.response?.status;

  if (status === 401) return 'Invalid email or password.';
  if (status === 409) return 'That email is already registered.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';

  if (status === 400) {
    const message = err.response?.data?.message;
    return Array.isArray(message) ? message.join(' ') : 'Please check the details you entered.';
  }

  return 'Could not reach the server.';
}

async function submit() {
  error.value = '';
  isSubmitting.value = true;

  try {
    if (isRegister.value) {
      await register(email.value, password.value);
    } else {
      await login(email.value, password.value);
    }
  } catch (err) {
    error.value = describeError(err);
  } finally {
    isSubmitting.value = false;
  }
}

function toggleMode() {
  mode.value = isRegister.value ? 'login' : 'register';
  error.value = '';
}
</script>

<template>
  <section class="card">
    <h2>{{ isRegister ? 'Create account' : 'Log in' }}</h2>

    <form class="auth-form" @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="email" required />
      </label>

      <label>
        Password
        <input
          v-model="password"
          type="password"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
          :minlength="isRegister ? 8 : undefined"
          maxlength="72"
          required
        />
        <span v-if="isRegister" class="hint">At least 8 characters.</span>
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button type="submit" :disabled="isSubmitting">
        {{ isRegister ? 'Create account' : 'Log in' }}
      </button>
    </form>

    <p class="switch">
      {{ isRegister ? 'Already have an account?' : 'New here?' }}
      <button type="button" class="link" @click="toggleMode">
        {{ isRegister ? 'Log in' : 'Create an account' }}
      </button>
    </p>
  </section>
</template>

<style scoped>
.auth-form {
  display: grid;
  gap: 16px;
  margin-top: 12px;
}

label {
  display: grid;
  gap: 6px;
  font-weight: 600;
}

.hint {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 400;
}

.switch {
  margin-top: 16px;
  color: var(--text-muted);
}

button.link {
  padding: 0;
  text-decoration: underline;
}
</style>
