import crypto from "node:crypto";

import { addDays, format } from "date-fns";
import { customAlphabet } from "nanoid";

import { db } from "../lib/database";

const bookingCodeAlphabet = customAlphabet("123456789ABCDEFGHJKLMNPQRSTUVWXYZ", 6);

export const ALLOWED_SLOT_TIMES = Array.from({ length: 16 }, (_, index) =>
  `${String(index + 8).padStart(2, "0")}:00`
);

export class BookingConflictError extends Error {}
export class BookingForbiddenError extends Error {}
export class BookingNotFoundError extends Error {}
export class BookingValidationError extends Error {}

type UserRecord = {
  id: string;
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

type BookingRecord = {
  id: string;
  booking_code: string;
  booking_date: string;
  slot_times_json: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  user_id: string;
};

type BookingSlotRecord = {
  id: string;
  booking_id: string;
  slot_date: string;
  slot_time: string;
  created_at: string;
};

export type BookingDetails = {
  id: string;
  bookingCode: string;
  bookingDate: string;
  slotTimesJson: string;
  slotTimes: string[];
  status: string;
  customerName: string;
  customerPhone: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  userId: string;
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    createdAt: string;
    updatedAt: string;
  };
  slots: Array<{
    id: string;
    bookingId: string;
    slotDate: string;
    slotTime: string;
    createdAt: string;
  }>;
};

type CreateBookingInput = {
  telegramUserId: string;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  customerName: string;
  customerPhone: string;
  bookingDate: string;
  slotTimes: string[];
};

export function parseSlotTimes(slotTimesJson: string): string[] {
  const parsed = JSON.parse(slotTimesJson) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function toCamelUser(record: UserRecord) {
  return {
    id: record.id,
    telegramId: record.telegram_id,
    username: record.username,
    firstName: record.first_name,
    lastName: record.last_name,
    phone: record.phone,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function toCamelSlot(record: BookingSlotRecord) {
  return {
    id: record.id,
    bookingId: record.booking_id,
    slotDate: record.slot_date,
    slotTime: record.slot_time,
    createdAt: record.created_at,
  };
}

function buildBookingDetails(
  booking: BookingRecord,
  user: UserRecord,
  slots: BookingSlotRecord[]
): BookingDetails {
  return {
    id: booking.id,
    bookingCode: booking.booking_code,
    bookingDate: booking.booking_date,
    slotTimesJson: booking.slot_times_json,
    slotTimes: parseSlotTimes(booking.slot_times_json),
    status: booking.status,
    customerName: booking.customer_name,
    customerPhone: booking.customer_phone,
    createdAt: booking.created_at,
    updatedAt: booking.updated_at,
    cancelledAt: booking.cancelled_at,
    userId: booking.user_id,
    user: toCamelUser(user),
    slots: slots.map(toCamelSlot),
  };
}

function nowIso() {
  return new Date().toISOString();
}

function assertBookingDate(bookingDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate)) {
    throw new BookingValidationError("Дата бронирования должна быть в формате YYYY-MM-DD.");
  }
}

function normalizeSlotTimes(slotTimes: string[]) {
  const uniqueTimes = [...new Set(slotTimes)].sort();

  if (uniqueTimes.length === 0) {
    throw new BookingValidationError("Выберите хотя бы один свободный час.");
  }

  const invalidSlot = uniqueTimes.find((slotTime) => !ALLOWED_SLOT_TIMES.includes(slotTime));

  if (invalidSlot) {
    throw new BookingValidationError(`Слот ${invalidSlot} недоступен для бронирования.`);
  }

  return uniqueTimes;
}

function normalizePhone(phone: string) {
  const normalized = phone.replace(/[^\d+]/g, "");

  if (normalized.length < 10) {
    throw new BookingValidationError("Укажите корректный номер телефона.");
  }

  return normalized;
}

function isUniqueSlotError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed") &&
    error.message.includes("booking_slots.slot_date")
  );
}

function getUserByTelegramId(telegramUserId: string) {
  return (
    db
      .prepare("SELECT * FROM users WHERE telegram_id = ?")
      .get(telegramUserId) as UserRecord | undefined
  );
}

function getBookingRecordById(bookingId: string) {
  return (
    db
      .prepare("SELECT * FROM bookings WHERE id = ?")
      .get(bookingId) as BookingRecord | undefined
  );
}

function getSlotsByBookingId(bookingId: string) {
  return db
    .prepare("SELECT * FROM booking_slots WHERE booking_id = ? ORDER BY slot_time ASC")
    .all(bookingId) as BookingSlotRecord[];
}

function getBookingDetailsById(bookingId: string) {
  const booking = getBookingRecordById(bookingId);

  if (!booking) {
    return null;
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id) as
    | UserRecord
    | undefined;

  if (!user) {
    throw new BookingNotFoundError("Пользователь брони не найден.");
  }

  return buildBookingDetails(booking, user, getSlotsByBookingId(bookingId));
}

export function formatBookingDateHuman(bookingDate: string) {
  return format(new Date(`${bookingDate}T00:00:00`), "dd.MM.yyyy");
}

export async function listSlotsForDate(bookingDate: string) {
  assertBookingDate(bookingDate);

  const reservedSlots = db
    .prepare("SELECT slot_time FROM booking_slots WHERE slot_date = ? ORDER BY slot_time ASC")
    .all(bookingDate) as Array<{ slot_time: string }>;

  const reserved = new Set(reservedSlots.map((slot) => slot.slot_time));

  return ALLOWED_SLOT_TIMES.map((slotTime) => ({
    time: slotTime,
    available: !reserved.has(slotTime),
  }));
}

export async function createBooking(input: CreateBookingInput): Promise<BookingDetails> {
  const customerName = input.customerName.trim();
  const customerPhone = normalizePhone(input.customerPhone);
  const slotTimes = normalizeSlotTimes(input.slotTimes);

  if (!customerName) {
    throw new BookingValidationError("Введите имя.");
  }

  assertBookingDate(input.bookingDate);

  const bookingId = crypto.randomUUID();
  const bookingCode = `DG-${input.bookingDate.replaceAll("-", "")}-${bookingCodeAlphabet()}`;
  const timestamp = nowIso();

  db.exec("BEGIN IMMEDIATE");

  try {
    let user = getUserByTelegramId(input.telegramUserId);

    if (user) {
      db.prepare(
        `
          UPDATE users
          SET username = ?, first_name = ?, last_name = ?, phone = ?, updated_at = ?
          WHERE telegram_id = ?
        `
      ).run(
        input.telegramUsername ?? null,
        input.telegramFirstName ?? null,
        input.telegramLastName ?? null,
        customerPhone,
        timestamp,
        input.telegramUserId
      );

      user = getUserByTelegramId(input.telegramUserId);
    } else {
      const userId = crypto.randomUUID();

      db.prepare(
        `
          INSERT INTO users (
            id, telegram_id, username, first_name, last_name, phone, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).run(
        userId,
        input.telegramUserId,
        input.telegramUsername ?? null,
        input.telegramFirstName ?? null,
        input.telegramLastName ?? null,
        customerPhone,
        timestamp,
        timestamp
      );

      user = getUserByTelegramId(input.telegramUserId);
    }

    if (!user) {
      throw new BookingValidationError("Не удалось создать пользователя.");
    }

    db.prepare(
      `
        INSERT INTO bookings (
          id, booking_code, booking_date, slot_times_json, status,
          customer_name, customer_phone, created_at, updated_at, cancelled_at, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      bookingId,
      bookingCode,
      input.bookingDate,
      JSON.stringify(slotTimes),
      "pending_payment",
      customerName,
      customerPhone,
      timestamp,
      timestamp,
      null,
      user.id
    );

    const insertSlotStatement = db.prepare(
      `
        INSERT INTO booking_slots (id, booking_id, slot_date, slot_time, created_at)
        VALUES (?, ?, ?, ?, ?)
      `
    );

    for (const slotTime of slotTimes) {
      insertSlotStatement.run(
        crypto.randomUUID(),
        bookingId,
        input.bookingDate,
        slotTime,
        timestamp
      );
    }

    db.exec("COMMIT");

    const booking = getBookingDetailsById(bookingId);

    if (!booking) {
      throw new BookingNotFoundError("Не удалось загрузить созданную бронь.");
    }

    return booking;
  } catch (error) {
    db.exec("ROLLBACK");

    if (isUniqueSlotError(error)) {
      throw new BookingConflictError(
        "Часть выбранного времени уже занята. Обновите расписание и выберите свободные часы."
      );
    }

    throw error;
  }
}

export async function getUserBookings(telegramUserId: string) {
  const user = getUserByTelegramId(telegramUserId);

  if (!user) {
    return [];
  }

  const bookings = db
    .prepare(
      `
        SELECT * FROM bookings
        WHERE user_id = ?
        ORDER BY booking_date ASC, created_at ASC
      `
    )
    .all(user.id) as BookingRecord[];

  return bookings.map((booking) =>
    buildBookingDetails(booking, user, getSlotsByBookingId(booking.id))
  );
}

export async function getUserActiveBookings(telegramUserId: string) {
  const allBookings = await getUserBookings(telegramUserId);
  return allBookings.filter((booking) => booking.status !== "cancelled");
}

export async function cancelBooking(
  bookingId: string,
  actorTelegramId: string,
  isAdmin: boolean
) {
  const booking = getBookingDetailsById(bookingId);

  if (!booking) {
    throw new BookingNotFoundError("Бронь не найдена.");
  }

  if (!isAdmin && booking.user.telegramId !== actorTelegramId) {
    throw new BookingForbiddenError("Нельзя отменить чужую бронь.");
  }

  if (booking.status === "cancelled") {
    return booking;
  }

  const timestamp = nowIso();
  db.exec("BEGIN IMMEDIATE");

  try {
    db.prepare("DELETE FROM booking_slots WHERE booking_id = ?").run(bookingId);
    db.prepare(
      "UPDATE bookings SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ?"
    ).run("cancelled", timestamp, timestamp, bookingId);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const updated = getBookingDetailsById(bookingId);

  if (!updated) {
    throw new BookingNotFoundError("Не удалось обновить бронь.");
  }

  return updated;
}

export async function getAdminBookingsForDate(bookingDate: string) {
  assertBookingDate(bookingDate);

  const bookings = db
    .prepare(
      `
        SELECT * FROM bookings
        WHERE booking_date = ?
        ORDER BY status ASC, created_at ASC
      `
    )
    .all(bookingDate) as BookingRecord[];

  return bookings.map((booking) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id) as
      | UserRecord
      | undefined;

    if (!user) {
      throw new BookingNotFoundError("Не найден пользователь администратора.");
    }

    return buildBookingDetails(booking, user, getSlotsByBookingId(booking.id));
  });
}

export async function getUpcomingAdminBookings(daysAhead = 7) {
  const today = format(new Date(), "yyyy-MM-dd");
  const limitDate = format(addDays(new Date(), daysAhead), "yyyy-MM-dd");

  const bookings = db
    .prepare(
      `
        SELECT * FROM bookings
        WHERE booking_date >= ? AND booking_date <= ?
        ORDER BY booking_date ASC, created_at ASC
      `
    )
    .all(today, limitDate) as BookingRecord[];

  return bookings.map((booking) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(booking.user_id) as
      | UserRecord
      | undefined;

    if (!user) {
      throw new BookingNotFoundError("Не найден пользователь администратора.");
    }

    return buildBookingDetails(booking, user, getSlotsByBookingId(booking.id));
  });
}
