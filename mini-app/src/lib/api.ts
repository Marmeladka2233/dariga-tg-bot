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

  // Helps bypass intermediate warning pages returned by temporary HTTPS tunnels.
  headers.set("bypass-tunnel-reminder", "true");

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
    const responseText = await response.text().catch(() => "");
    const payload = responseText
      ? ((() => {
          try {
            return JSON.parse(responseText) as { error?: string };
          } catch {
            return null;
          }
        })() as { error?: string } | null)
      : null;

    if (payload?.error) {
      throw new Error(payload.error);
    }

    const lowerText = responseText.toLowerCase();

    if (
      response.status === 401 ||
      response.status === 403 ||
      lowerText.includes("loca.lt") ||
      lowerText.includes("localtunnel") ||
      lowerText.includes("tunnel") ||
      lowerText.includes("<html")
    ) {
      throw new Error(
        "Временный доступ к серверу бронирования устарел. Откройте бота заново через /start и нажмите свежую кнопку бронирования."
      );
    }

    throw new Error(`Не удалось выполнить запрос. Код ответа: ${response.status}.`);
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
