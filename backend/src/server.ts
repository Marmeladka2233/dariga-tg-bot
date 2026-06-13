import cors from "@fastify/cors";
import type { Bot } from "grammy";
import Fastify from "fastify";
import { z } from "zod";

import { sendBookingConfirmation } from "./bot";
import { appConfig, type AppConfig } from "./config";
import { verifyTelegramInitData } from "./lib/telegram-auth";
import {
  BookingConflictError,
  BookingForbiddenError,
  BookingNotFoundError,
  BookingValidationError,
  createBooking,
  getUserBookings,
  listSlotsForDate,
} from "./services/booking-service";
import { syncBookingToGoogleSheets } from "./services/google-sheets-sync-service";

const bookingRequestSchema = z.object({
  bookingDate: z.string().min(1),
  slotTimes: z.array(z.string()).min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
});

function getHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveTelegramUser(
  initData: string | undefined,
  config: AppConfig = appConfig
) {
  if (initData) {
    return verifyTelegramInitData(initData, config.TELEGRAM_BOT_TOKEN);
  }

  if (!config.ALLOW_DEV_AUTH) {
    throw new BookingForbiddenError("Требуется Telegram Web App авторизация.");
  }

  return {
    id: Number(config.DEV_TELEGRAM_USER_ID),
    username: config.DEV_TELEGRAM_USERNAME,
    first_name: "Dev",
    last_name: "User",
  };
}

export function createServer(bot: Bot, config: AppConfig) {
  const fastify = Fastify({
    logger: false,
  });

  fastify.register(cors, {
    origin: true,
  });

  fastify.get("/health", async () => ({
    ok: true,
  }));

  fastify.get("/api/config", async () => ({
    studioName: config.STUDIO_NAME,
    googleSheetsUrl: config.GOOGLE_SHEETS_URL,
    slotStartHour: "08:00",
    slotEndHour: "23:00",
  }));

  fastify.get("/api/slots", async (request) => {
    const query = z
      .object({
        date: z.string().min(1),
      })
      .parse(request.query);

    return {
      date: query.date,
      slots: await listSlotsForDate(query.date),
    };
  });

  fastify.get("/api/bookings/my", async (request) => {
    const telegramUser = resolveTelegramUser(
      getHeaderValue(request.headers["x-telegram-init-data"]),
      config
    );

    const bookings = await getUserBookings(String(telegramUser.id));

    return {
      bookings,
    };
  });

  fastify.post("/api/bookings", async (request, reply) => {
    const telegramUser = resolveTelegramUser(
      getHeaderValue(request.headers["x-telegram-init-data"]),
      config
    );
    const body = bookingRequestSchema.parse(request.body);

    const booking = await createBooking({
      telegramUserId: String(telegramUser.id),
      telegramUsername: telegramUser.username,
      telegramFirstName: telegramUser.first_name,
      telegramLastName: telegramUser.last_name,
      bookingDate: body.bookingDate,
      slotTimes: body.slotTimes,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
    });
    const syncResult = await syncBookingToGoogleSheets(booking, config);

    await sendBookingConfirmation(bot, booking);

    reply.code(201);

    return {
      success: true,
      booking,
      syncWarning: syncResult.warning,
    };
  });

  fastify.setErrorHandler((error, request, reply) => {
    console.error("API error", error);

    if (error instanceof z.ZodError || error instanceof BookingValidationError) {
      reply.code(400).send({
        error: error instanceof z.ZodError ? "Некорректные входные данные." : error.message,
      });
      return;
    }

    if (error instanceof BookingConflictError) {
      reply.code(409).send({ error: error.message });
      return;
    }

    if (error instanceof BookingForbiddenError) {
      reply.code(403).send({ error: error.message });
      return;
    }

    if (error instanceof BookingNotFoundError) {
      reply.code(404).send({ error: error.message });
      return;
    }

    reply.code(500).send({
      error: "Внутренняя ошибка сервера.",
    });
  });

  return fastify;
}
