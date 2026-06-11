import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { appConfig } from "../config";

const databaseFilePath = path.resolve(process.cwd(), appConfig.DATABASE_PATH);

fs.mkdirSync(path.dirname(databaseFilePath), { recursive: true });

export const db = new DatabaseSync(databaseFilePath);

db.exec("PRAGMA foreign_keys = ON;");

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      telegram_id TEXT NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      booking_code TEXT NOT NULL UNIQUE,
      booking_date TEXT NOT NULL,
      slot_times_json TEXT NOT NULL,
      status TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cancelled_at TEXT,
      user_id TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS booking_slots (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      slot_date TEXT NOT NULL,
      slot_time TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      UNIQUE (slot_date, slot_time)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON bookings (booking_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings (user_id);
    CREATE INDEX IF NOT EXISTS idx_booking_slots_booking_id ON booking_slots (booking_id);
    CREATE INDEX IF NOT EXISTS idx_booking_slots_slot_date ON booking_slots (slot_date);
  `);
}
