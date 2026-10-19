/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-call --
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
  const schedules: any[] = [];

  // Only the filters SchedulesService uses: deviceId, isActive and an OR of
  // { kind } / { startAt: { gt } }.
  const matchesSchedule = (s: any, where: any) =>
    (where.id === undefined || s.id === where.id) &&
    (where.deviceId === undefined || s.deviceId === where.deviceId) &&
    (where.isActive === undefined || s.isActive === where.isActive) &&
    (where.OR === undefined ||
      where.OR.some((clause: any) =>
        clause.kind
          ? s.kind === clause.kind
          : s.startAt !== null && s.startAt > clause.startAt.gt,
      ));

  // Mirrors Prisma's `omit`, so tests catch a column leaking into a response.
  const withoutOmitted = (row: any, omit: any) => {
    if (!row || !omit) return row;
    const copy = { ...row };
    Object.keys(omit).forEach((key) => omit[key] && delete copy[key]);
    return copy;
  };

  // Like a real query, `select` returns only the chosen columns.
  const selected = (row: any, select: any) =>
    row && select
      ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]))
      : row;

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
      findMany: async ({ where, omit }: any) =>
        devices
          .filter((d) => d.userId === where.userId)
          .map((d) => withoutOmitted(d, omit)),
      findUnique: async ({ where, select }: any) =>
        selected(
          devices.find((d) =>
            where.id ? d.id === where.id : d.keyHash === where.keyHash,
          ) ?? null,
          select,
        ),
      create: async ({ data, omit }: any) => {
        const device = {
          id: randomUUID(),
          createdAt: new Date(),
          fcmToken: null,
          ...data,
        };
        // Prisma stores an omitted optional column as null.
        device.fcmToken ??= null;
        devices.push(device);
        return withoutOmitted(device, omit);
      },
      findFirst: async ({ where, omit, select }: any) =>
        selected(
          withoutOmitted(
            devices.find((d) => matchesDevice(d, where)) ?? null,
            omit,
          ),
          select,
        ),
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
    ringSchedule: {
      findMany: async ({ where }: any) =>
        schedules.filter((s) => matchesSchedule(s, where)),
      findFirst: async ({ where }: any) =>
        schedules.find((s) => matchesSchedule(s, where)) ?? null,
      count: async ({ where }: any) =>
        schedules.filter((s) => matchesSchedule(s, where)).length,
      create: async ({ data }: any) => {
        const schedule = {
          id: randomUUID(),
          isActive: true,
          startAt: null,
          timeOfDay: null,
          label: null,
          createdAt: new Date(),
          ...data,
        };
        // Prisma stores an omitted optional column as null.
        for (const key of ['label', 'startAt', 'timeOfDay'])
          schedule[key] ??= null;
        schedules.push(schedule);
        return schedule;
      },
      updateMany: async ({ where, data }: any) => {
        const matching = schedules.filter((s) => matchesSchedule(s, where));
        matching.forEach((s) => Object.assign(s, data));
        return { count: matching.length };
      },
      deleteMany: async ({ where }: any) => {
        const before = schedules.length;
        for (let i = schedules.length - 1; i >= 0; i--) {
          if (matchesSchedule(schedules[i], where)) schedules.splice(i, 1);
        }
        return { count: before - schedules.length };
      },
    },
  };
}
