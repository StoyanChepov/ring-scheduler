import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import type { App, ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const APP_NAME = 'ring-scheduler';

// A ring command that sits in FCM for long is wrong by the time it arrives, so
// the message expires quickly instead of ringing a phone minutes later.
const COMMAND_TTL_MS = 60_000;

// A schedule change is still worth delivering hours later: the phone needs it
// before the next alarm, whenever it comes back online.
const SCHEDULES_TTL_MS = 24 * 60 * 60 * 1000;

// Both codes mean FCM will never accept this token again. Other errors
// (including mismatched-credential, which is a server config problem) must not
// cause the stored token to be thrown away.
const DEAD_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

// Sent in dry-run mode by checkCredentials(). It is deliberately not a real
// token: FCM rejects it, and *how* it rejects tells us whether our credentials
// were accepted.
const PROBE_TOKEN = 'ring-scheduler-credential-check';

// FCM got far enough to look at the token, so it had already accepted the
// credentials and the request. invalid-argument is what a malformed token
// (like the probe) usually produces.
const TOKEN_REJECTED_CODES = new Set([
  ...DEAD_TOKEN_CODES,
  'messaging/invalid-argument',
]);

export interface CredentialCheck {
  ok: boolean;
  detail: string;
}

export interface RingPushPayload {
  commandId: string;
  type: 'RING_START' | 'RING_STOP';
  durationSeconds?: number;
  ringtoneId?: string;
}

export type PushOutcome =
  | { status: 'sent'; messageId: string }
  | { status: 'failed'; reason: string; invalidToken: boolean };

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app?: App;
  private projectId?: string;

  constructor(private readonly config: ConfigService) {}

  /** False when no credentials are configured; callers then skip real push. */
  get isEnabled(): boolean {
    return this.app !== undefined;
  }

  onModuleInit() {
    const serviceAccount = this.loadServiceAccount();

    if (!serviceAccount) {
      this.logger.warn(
        'Firebase credentials are not set; real push delivery is disabled ' +
          '(MOCK devices still work). Set FIREBASE_SERVICE_ACCOUNT_JSON or ' +
          'FIREBASE_SERVICE_ACCOUNT_PATH to enable it.',
      );
      return;
    }

    // Reuse the app if the module is initialised twice (e.g. in tests).
    this.app =
      getApps().find((app) => app.name === APP_NAME) ??
      initializeApp({ credential: cert(serviceAccount) }, APP_NAME);
    this.projectId = serviceAccount.projectId;

    this.logger.log(
      `Firebase push enabled for project "${serviceAccount.projectId}"`,
    );
  }

  /**
   * Checks that the configured key really works, without needing a device.
   * It asks FCM to validate (not deliver) a message to a fake token: a bad key
   * fails with an authentication error, while a good key gets as far as FCM
   * rejecting the token. Nothing is ever delivered.
   */
  async checkCredentials(): Promise<CredentialCheck> {
    if (!this.app) {
      return {
        ok: false,
        detail:
          'No Firebase credentials are configured. Set ' +
          'FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON.',
      };
    }

    const project = `project "${this.projectId}"`;

    try {
      await getMessaging(this.app).send(
        { token: PROBE_TOKEN, data: { type: 'CREDENTIAL_CHECK' } },
        true,
      );

      return {
        ok: true,
        detail: `Firebase accepted the credentials for ${project}.`,
      };
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'unknown';

      if (TOKEN_REJECTED_CODES.has(code)) {
        return {
          ok: true,
          detail:
            `Firebase accepted the credentials for ${project}; it only ` +
            `rejected the fake test token (${code}), as expected.`,
        };
      }

      return {
        ok: false,
        detail:
          `Firebase did not accept the request for ${project} (${code}). ` +
          'Check that the key belongs to this project and has not been ' +
          'revoked, that the Firebase Cloud Messaging API is enabled, and ' +
          'that this machine can reach Google (a firewall or proxy gives the ' +
          'same error).',
      };
    }
  }

  /**
   * Sends one command to one device. FCM failures are returned as an outcome
   * instead of thrown, so the caller can record the result either way.
   */
  async sendRingCommand(
    token: string,
    payload: RingPushPayload,
  ): Promise<PushOutcome> {
    if (!this.app) {
      return {
        status: 'failed',
        reason: 'Push delivery is not configured on the server',
        invalidToken: false,
      };
    }

    // A data-only message always reaches the app's own handler, which is what
    // has to start the ringtone. A "notification" message would only show a
    // banner when the app is in the background.
    const data: Record<string, string> = {
      type: payload.type,
      commandId: payload.commandId,
      sentAt: new Date().toISOString(),
    };

    if (payload.durationSeconds !== undefined) {
      data.durationSeconds = String(payload.durationSeconds);
    }

    // The phone downloads it if it hasn't cached it yet.
    if (payload.ringtoneId) {
      data.ringtoneId = payload.ringtoneId;
    }

    return this.send(
      token,
      data,
      {
        ttl: COMMAND_TTL_MS,
        // If the phone is offline, a stop replaces a still-queued ring
        // instead of both being delivered in order.
        collapseKey: 'ring-command',
      },
      `command ${payload.commandId}`,
    );
  }

  /**
   * Tells the phone its schedules changed, so it fetches them and resets its
   * alarms. The message carries no schedule data; the phone asks the API.
   */
  async sendSchedulesChanged(token: string): Promise<PushOutcome> {
    if (!this.app) {
      return {
        status: 'failed',
        reason: 'Push delivery is not configured on the server',
        invalidToken: false,
      };
    }

    return this.send(
      token,
      { type: 'SCHEDULES_CHANGED', sentAt: new Date().toISOString() },
      // Several quick edits only need one sync.
      { ttl: SCHEDULES_TTL_MS, collapseKey: 'schedules-changed' },
      'schedules update',
    );
  }

  // FCM failures are returned as an outcome instead of thrown, so callers can
  // record the result either way.
  private async send(
    token: string,
    data: Record<string, string>,
    android: { ttl: number; collapseKey: string },
    description: string,
  ): Promise<PushOutcome> {
    try {
      const messageId = await getMessaging(this.app).send({
        token,
        data,
        android: { priority: 'high', ...android },
      });

      return { status: 'sent', messageId };
    } catch (error) {
      const code = (error as { code?: string }).code ?? 'unknown';
      const invalidToken = DEAD_TOKEN_CODES.has(code);

      this.logger.warn(`FCM send failed for ${description}: ${code}`);

      return {
        status: 'failed',
        reason: invalidToken
          ? 'The device push token is no longer valid'
          : `Push delivery failed (${code})`,
        invalidToken,
      };
    }
  }

  private loadServiceAccount():
    | (ServiceAccount & { projectId: string })
    | null {
    const inline = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');

    if (!inline && !path) {
      return null;
    }

    // Misconfiguration fails startup loudly. Quietly falling back to mock mode
    // would hide the problem until someone's phone never rings.
    let raw: Record<string, unknown>;

    try {
      raw = JSON.parse(
        inline ?? readFileSync(path as string, 'utf8'),
      ) as Record<string, unknown>;
    } catch {
      throw new Error(
        'Firebase service account could not be read: ' +
          (inline
            ? 'FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON'
            : 'FIREBASE_SERVICE_ACCOUNT_PATH is missing or not valid JSON'),
      );
    }

    const { project_id, client_email, private_key } = raw;

    if (
      typeof project_id !== 'string' ||
      typeof client_email !== 'string' ||
      typeof private_key !== 'string'
    ) {
      throw new Error(
        'Firebase service account must contain project_id, client_email and private_key',
      );
    }

    return {
      projectId: project_id,
      clientEmail: client_email,
      privateKey: private_key,
    };
  }
}
