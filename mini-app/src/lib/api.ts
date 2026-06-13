import type { AppConfig, CreateBookingResult, Slot } from "../types";
import { getTelegramWebApp } from "./telegram";
import { getApiBaseUrl } from "./runtime-config";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const webApp = getTelegramWebApp();

  if (webApp?.initData) {
    headers.set("X-Telegram-Init-Data", webApp.initData);
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error(
      "Не удалось связаться с сервером бронирования. Проверьте, что бот запущен и временный HTTPS-доступ активен."
    );
  }

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
  const response = await request<{
    success: boolean;
    booking: CreateBookingResult["booking"];
    syncWarning?: string;
  }>("/api/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    booking: response.booking,
    syncWarning: response.syncWarning,
  } satisfies CreateBookingResult;
}
