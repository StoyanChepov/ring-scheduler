import { computed, ref } from 'vue';
import { api, clearToken, getToken, setToken, setUnauthorizedHandler } from '../services/api';

export type AuthUser = {
  id: string;
  email: string;
};

type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

// Module-level state so every component sees the same session.
const user = ref<AuthUser | null>(null);
const isRestoring = ref(false);

function reset() {
  user.value = null;
}

setUnauthorizedHandler(reset);

async function restoreSession() {
  if (!getToken()) {
    return;
  }

  isRestoring.value = true;

  try {
    const response = await api.get<AuthUser>('/auth/me');
    user.value = response.data;
  } catch {
    // A 401 already cleared the token; for other errors stay logged out.
    reset();
  } finally {
    isRestoring.value = false;
  }
}

async function authenticate(path: '/auth/login' | '/auth/register', email: string, password: string) {
  const response = await api.post<AuthResponse>(path, { email, password });

  setToken(response.data.accessToken);
  user.value = response.data.user;
}

export function useAuth() {
  return {
    user,
    isLoggedIn: computed(() => user.value !== null),
    isRestoring,
    restoreSession,
    login: (email: string, password: string) => authenticate('/auth/login', email, password),
    register: (email: string, password: string) => authenticate('/auth/register', email, password),
    logout() {
      clearToken();
      reset();
    },
  };
}
