<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AccountSettings from './components/AccountSettings.vue';
import AuthForm from './components/AuthForm.vue';
import DeviceDetails from './components/DeviceDetails.vue';
import DeviceList from './components/DeviceList.vue';
import { useAuth } from './composables/useAuth';
import { useDevices } from './composables/useDevices';
import { useRingtones } from './composables/useRingtones';
import { APK_URL } from './links';

const { user, isLoggedIn, isRestoring, restoreSession, logout } = useAuth();
const { devices, hasLoaded, load: loadDevices, clear: clearDevices } = useDevices();
const { load: loadRingtones, clear: clearRingtones } = useRingtones();

// The open page lives in the URL (#/devices/<id> or #/account), so the
// browser's back button and a page refresh both work without a router.
function deviceIdFromHash(): string | null {
  return /^#\/devices\/([0-9a-f-]{36})$/i.exec(window.location.hash)?.[1] ?? null;
}

const isAccountHash = () => window.location.hash === '#/account';

const openDeviceId = ref(deviceIdFromHash());
const isAccountOpen = ref(isAccountHash());
const onHashChange = () => {
  openDeviceId.value = deviceIdFromHash();
  isAccountOpen.value = isAccountHash();
};

const openDevice = computed(
  () => devices.value.find((device) => device.id === openDeviceId.value) ?? null,
);

function showDevice(deviceId: string) {
  window.location.hash = `#/devices/${deviceId}`;
}

function showList() {
  // Clears the hash without leaving a bare "#" behind.
  history.pushState(null, '', window.location.pathname + window.location.search);
  openDeviceId.value = null;
  isAccountOpen.value = false;
}

// Load on login; drop everything on logout so the next person to log in on
// this browser never sees stale data.
watch(isLoggedIn, (loggedIn) => {
  if (loggedIn) {
    loadDevices();
    loadRingtones().catch((error) => console.error(error));
  } else {
    clearDevices();
    clearRingtones();
  }
});

onMounted(() => {
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('popstate', onHashChange);
  restoreSession();
});

onBeforeUnmount(() => {
  window.removeEventListener('hashchange', onHashChange);
  window.removeEventListener('popstate', onHashChange);
});
</script>

<template>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#" @click.prevent="showList">
        <img src="/favicon.svg" alt="" width="28" height="28" />
        Ring Scheduler
      </a>

      <div v-if="isLoggedIn" class="row user">
        <span class="muted small email">{{ user?.email }}</span>
        <a class="button secondary" href="#/account">Account</a>
        <button class="secondary" @click="logout">Log out</button>
      </div>
    </div>
  </header>

  <main class="page">
    <p v-if="isRestoring" class="muted">Restoring your session…</p>

    <div v-else-if="!isLoggedIn" class="welcome">
      <div class="intro stack">
        <h1>Alarms for your Android phones</h1>
        <p class="muted">
          Ring a phone right now, or schedule alarms that ring on time even when
          the phone is offline. Use your own ringtones and see what happened on
          each phone.
        </p>
        <p class="row">
          <a class="button secondary" :href="APK_URL">Get the Android app</a>
          <span class="muted small">Android 8 or newer</span>
        </p>
      </div>
      <AuthForm />
    </div>

    <template v-else>
      <AccountSettings v-if="isAccountOpen" @back="showList" />

      <DeviceDetails v-else-if="openDevice" :key="openDevice.id" :device="openDevice" @back="showList" />

      <section v-else-if="openDeviceId && hasLoaded" class="card stack">
        <p>That device isn't in your account (any more).</p>
        <p><button class="secondary" @click="showList">Show all devices</button></p>
      </section>

      <DeviceList v-else @open="showDevice" />
    </template>
  </main>
</template>

<style scoped>
.topbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.topbar-inner {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  max-width: 880px;
  margin: 0 auto;
  padding: 12px 16px;
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--text);
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.user button,
.user .button {
  white-space: nowrap;
}

.user {
  flex-wrap: nowrap;
  min-width: 0;
}

.email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.welcome {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 400px);
  gap: 32px;
  align-items: start;
  padding-top: 24px;
}

@media (max-width: 760px) {
  .welcome {
    grid-template-columns: 1fr;
  }
}

/* The email is also in the account the user just logged into; on a phone the
   space is better spent on the brand and the button. */
@media (max-width: 480px) {
  .email {
    display: none;
  }

  /* Brand and both buttons still fit on one line at 375 px. */
  .user button,
  .user .button {
    padding: 8px 10px;
  }
}
</style>
