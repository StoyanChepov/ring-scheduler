# Ring Scheduler — web dashboard

The dashboard where users see their phones, ring them, schedule alarms,
upload ringtones and check what happened on each phone.

Built with **Vue 3 + TypeScript + Vite**. State is kept in a few plain
composables (no Vuex/Pinia), and there is no router: the open page lives in
the URL hash (`#/devices/<id>` or `#/account`), so back, refresh and links
still work.

## Run locally

You need the local database and API running first:

```
# repo root: Postgres (and Redis) in Docker
docker compose up -d

# the API, on http://localhost:3000
cd apps/api
pnpm start:dev
```

Then the dashboard:

```
cd apps/web
pnpm install   # first time only
pnpm dev       # http://localhost:5173
```

The API address comes from `VITE_API_URL` in `apps/web/.env.local`
(git-ignored) and defaults to `http://localhost:3000`. The local database has
its own accounts, separate from the live site's.

The deployed API only accepts browser calls from the deployed site (its
`WEB_ORIGINS` setting), so a local dashboard can't use the live API unless
`http://localhost:5173` is added to `WEB_ORIGINS` on Vercel.

## Build

```
pnpm build     # vue-tsc type check, then vite build into dist/
```

## Deploy

Vercel project with **Root Directory `apps/web`** and the environment variable
`VITE_API_URL=https://ring-scheduler.vercel.app`. Every push to `main`
deploys it to https://ring-scheduler-web.vercel.app.

`apps/web` must keep its own `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
Without them, pnpm on Vercel installs from the repo root instead and the build
fails with "vue-tsc: command not found".

## Layout

- `src/App.vue`: the shell: top bar, then login, the device list, one
  device's details, or the account page, depending on the session and the
  URL.
- `src/components/`
  - `DeviceList.vue`: the user's phones.
  - `DeviceDetails.vue`: one phone: rename, Ring now, the sections below,
    and remove.
  - `DeviceSchedules.vue`: scheduled alarms and the new-alarm form.
  - `RingtonesCard.vue`: upload, play and delete ringtones (shared by all
    of the user's phones).
  - `DeviceActivity.vue`: what the phone reported (rang, stopped, failed).
  - `AuthForm.vue`: log in / create account.
  - `AccountSettings.vue`: change password, delete the account.
- `src/composables/`: `useAuth`, `useDevices`, `useRingtones` (page-wide
  shared state).
- `src/services/api.ts`: the axios client; adds the login token and logs out
  on a 401.
- `src/links.ts`: the Android app download link (latest GitHub release).
- `src/style.css`: shared styles (colours, cards, buttons, form fields).
