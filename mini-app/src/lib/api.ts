import type { AppConfig, Booking, Slot } from "../types";
import { getTelegramWebApp } from "./telegram";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const webApp = getTelegramWebApp();

  if (webApp?.initData) {
    headers.set("X-Telegram-Init-Data", webApp.initData);
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Не удалось выполнить запрос.");
  }

  return response.json() as Promise<T>;
}

export function getAppConfig() {
  return request<AppConfig>("/api/config");
}

export async function getSlotsByDate(date: string) {
  const response = await request<{ date: string; slots: Slot[] }>(
    `/api/slots?date=${encodeURIComponent(date)}`
  );

  return response.slots;
}

export async function createBooking(payload: {
  bookingDate: string;
  slotTimes: string[];
  customerName: string;
  customerPhone: string;
}) {
  const response = await request<{ success: boolean; booking: Booking }>("/api/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return response.booking;
}
