/**
 * Try Firebase push delivery without running the API or the database.
 *
 *   pnpm push:test                      check that the Firebase key works
 *   pnpm push:test <token>              ring the device that owns <token> for 30 s
 *   pnpm push:test <token> --seconds 10 ring for 10 s
 *   pnpm push:test <token> --stop       send a stop command instead
 *
 * Uses the same FirebaseService as the API, configured from apps/api/.env.
 * Exit code: 0 = ok, 1 = check or delivery failed, 2 = bad usage.
 */
import * as dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../src/firebase/firebase.service';

dotenv.config({ quiet: true });

const USAGE =
  'Usage: pnpm push:test [<device-token>] [--stop] [--seconds <1-300>]';

function parseArgs(argv: string[]) {
  let token: string | undefined;
  let stop = false;
  let seconds = 30;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--stop') {
      stop = true;
    } else if (arg === '--seconds') {
      seconds = Number(argv[++i]);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option "${arg}"`);
    } else if (token === undefined) {
      token = arg;
    } else {
      throw new Error('Only one device token can be given');
    }
  }

  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) {
    throw new Error('--seconds must be a whole number from 1 to 300');
  }

  return { token, stop, seconds };
}

async function main(): Promise<number> {
  let args: ReturnType<typeof parseArgs>;

  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`${(error as Error).message}\n${USAGE}`);
    return 2;
  }

  const firebase = new FirebaseService(new ConfigService());

  try {
    firebase.onModuleInit();
  } catch (error) {
    // A set-but-broken key is reported as-is; it never contains the key itself.
    console.error(`FAIL  ${(error as Error).message}`);
    return 1;
  }

  const check = await firebase.checkCredentials();
  console.log(`${check.ok ? 'OK   ' : 'FAIL '} ${check.detail}`);

  if (!check.ok) {
    return 1;
  }

  if (!args.token) {
    console.log(
      '\nThe key works. To ring a real device, run:\n' +
        '  pnpm push:test <device-token>',
    );
    return 0;
  }

  const outcome = await firebase.sendRingCommand(args.token, {
    commandId: `push-test-${Date.now()}`,
    type: args.stop ? 'RING_STOP' : 'RING_START',
    durationSeconds: args.stop ? undefined : args.seconds,
  });

  if (outcome.status === 'sent') {
    console.log(
      `OK    Sent ${args.stop ? 'RING_STOP' : 'RING_START'} ` +
        `(FCM message ${outcome.messageId}).`,
    );
    return 0;
  }

  console.log(`FAIL  ${outcome.reason}`);

  if (outcome.invalidToken) {
    console.log(
      '      The token is stale or was copied incompletely. Get a fresh one ' +
        'from the device.',
    );
  }

  return 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`FAIL  Unexpected error: ${(error as Error).message}`);
    process.exit(1);
  },
);
