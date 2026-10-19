/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await --
   This is a deliberately loose in-memory stand-in for the Prisma client. */
import { randomUUID } from 'crypto';

/**
 * A small in-memory replacement for PrismaService, used by the HTTP-level
 * tests so the real modules, guards and validation run without Postgres.
 * It only implements the calls the app makes.
 */
export function createFakePrisma() {
  const users: any[] = [];
  const devices: any[] = [];
  const commands: any[] = [];

  const matchesDevice = (device: any, where: any) =>
    device.id === where.id &&
    (where.userId === undefined || device.userId === where.userId);

  return {
    user: {
      findUnique: async ({ where }: any) =>
        users.find((u) =>
          where.id ? u.id === where.id : u.email === where.email,
        ) ?? null,
      create: async ({ data }: any) => {
        const user = { id: randomUUID(), ...data };
        users.push(user);
        return user;
      },
    },
    device: {
      findMany: async ({ where }: any) =>
        devices.filter((d) => d.userId === where.userId),
      create: async ({ data }: any) => {
        const device = {
          id: randomUUID(),
          createdAt: new Date(),
          fcmToken: null,
          ...data,
        };
        // Prisma stores an omitted optional column as null.
        device.fcmToken ??= null;
        devices.push(device);
        return device;
      },
      findFirst: async ({ where }: any) =>
        devices.find((d) => matchesDevice(d, where)) ?? null,
      update: async ({ where, data }: any) => {
        const device = devices.find((d) => d.id === where.id);
        if (!device) throw new Error('Record to update not found');
        Object.assign(device, data);
        return device;
      },
      updateMany: async ({ where, data }: any) => {
        const matching = devices.filter((d) => matchesDevice(d, where));
        matching.forEach((d) => Object.assign(d, data));
        return { count: matching.length };
      },
    },
    ringCommand: {
      create: async ({ data }: any) => {
        const command = { id: randomUUID(), createdAt: new Date(), ...data };
        commands.push(command);
        return command;
      },
      update: async ({ where, data }: any) => {
        const command = commands.find((c) => c.id === where.id);
        if (!command) throw new Error('Record to update not found');
        Object.assign(command, data);
        return { ...command };
      },
    },
  };
}
