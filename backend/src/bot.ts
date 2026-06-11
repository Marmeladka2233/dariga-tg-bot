import { Bot, InlineKeyboard, type Context } from "grammy";

import { appConfig, type AppConfig } from "./config";
import { createTelegramProxyAgent } from "./lib/telegram-proxy";
import {
  cancelBooking,
  formatBookingDateHuman,
  getAdminBookingsForDate,
  getUpcomingAdminBookings,
  getUserActiveBookings,
  type BookingDetails,
} from "./services/booking-service";

function isAdmin(config: AppConfig, telegramId: string) {
  return config.adminTelegramIds.includes(telegramId);
}

function getStartText(config: AppConfig) {
  return [
    `Добро пожаловать в систему бронирования ${config.STUDIO_NAME}!`,
    "",
    "Нажмите кнопку ниже, чтобы выбрать дату и время.",
    "",
    "Наш канал с инструкциями и обзором студии:",
    "https://t.me/darigavocal",
    "",
    "Актуальные цены и правила студии: /rules",
    "Остались вопросы? Напишите нам: @dariga2222",
  ].join("\n");
}

function getMainKeyboard(config: AppConfig) {
  return new InlineKeyboard()
    .webApp("Забронировать", config.WEB_APP_URL)
    .row()
    .text("Мои брони", "my_bookings")
    .text("Правила", "show_rules")
    .row()
    .text("О студии", "show_about");
}

function getBookingKeyboard(config: AppConfig, bookingId: string) {
  return new InlineKeyboard()
    .url("Проверить бронь", config.GOOGLE_SHEETS_URL)
    .row()
    .text("Отменить бронь", `cancel_booking:${bookingId}`)
    .text("Мои брони", "my_bookings");
}

function formatBookingText(booking: BookingDetails) {
  return [
    "Общая информация:",
    `Номер брони: ${booking.bookingCode}`,
    `Дата: ${formatBookingDateHuman(booking.bookingDate)}`,
    `Время: ${booking.slotTimes.join(", ")}`,
    `Имя: ${booking.customerName}`,
    `Телефон: ${booking.customerPhone}`,
    `Статус: ${booking.status === "cancelled" ? "отменена" : "ожидает оплату"}`,
    "",
    "Бронь необходимо оплатить за 24 часа до посещения.",
    `Реквизиты: ${appConfig.PAYMENT_DETAILS}`,
    "",
    "После оплаты вышлем код от замка.",
  ].join("\n");
}

function formatUserBookings(bookings: BookingDetails[]) {
  if (bookings.length === 0) {
    return "У вас пока нет активных броней.";
  }

  return bookings
    .map((booking, index) =>
      [
        `${index + 1}. ${formatBookingDateHuman(booking.bookingDate)} | ${booking.slotTimes.join(", ")}`,
        `Номер: ${booking.bookingCode}`,
        `Статус: ${booking.status === "cancelled" ? "отменена" : "ожидает оплату"}`,
      ].join("\n")
    )
    .join("\n\n");
}

function formatAdminBookings(dateLabel: string, bookings: BookingDetails[]) {
  if (bookings.length === 0) {
    return `На ${dateLabel} броней нет.`;
  }

  const lines = bookings.flatMap((booking, index) => [
    `${index + 1}. ${booking.slotTimes.join(", ")} | ${booking.customerName}`,
    `Телефон: ${booking.customerPhone}`,
    `Пользователь Telegram: ${booking.user.firstName ?? "-"} (@${booking.user.username ?? "-"})`,
    `Статус: ${booking.status}`,
    `Код брони: ${booking.bookingCode}`,
    "",
  ]);

  return [`Брони на ${dateLabel}:`, "", ...lines].join("\n").trim();
}

async function sendUserBookings(ctx: Context) {
  if (!ctx.from) {
    return;
  }

  const bookings = await getUserActiveBookings(String(ctx.from.id));
  await ctx.reply(formatUserBookings(bookings), {
    reply_markup: new InlineKeyboard().url("Таблица", appConfig.GOOGLE_SHEETS_URL),
  });

  for (const booking of bookings) {
    await ctx.reply(
      `${formatBookingDateHuman(booking.bookingDate)} | ${booking.slotTimes.join(", ")}\nНомер: ${booking.bookingCode}`,
      {
        reply_markup: new InlineKeyboard().text(
          "Отменить бронь",
          `cancel_booking:${booking.id}`
        ),
      }
    );
  }
}

export async function sendBookingConfirmation(bot: Bot, booking: BookingDetails) {
  await bot.api.sendMessage(Number(booking.user.telegramId), "Вы успешно передали данные боту кнопкой бронирования.");
  await bot.api.sendMessage(Number(booking.user.telegramId), formatBookingText(booking), {
    reply_markup: getBookingKeyboard(appConfig, booking.id),
  });
}

export function createBot(config: AppConfig) {
  const proxyAgent = createTelegramProxyAgent(config.TELEGRAM_PROXY);
  const bot = new Bot(config.TELEGRAM_BOT_TOKEN, {
    client: proxyAgent
      ? {
          baseFetchConfig: {
            agent: proxyAgent,
          },
        }
      : undefined,
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(getStartText(config), {
      reply_markup: getMainKeyboard(config),
    });
  });

  bot.command("rules", async (ctx) => {
    await ctx.reply(config.RULES_TEXT);
  });

  bot.command("about", async (ctx) => {
    await ctx.reply(config.ABOUT_TEXT);
  });

  bot.command("my_bookings", async (ctx) => {
    await sendUserBookings(ctx);
  });

  bot.command("admin", async (ctx) => {
    if (!ctx.from || !isAdmin(config, String(ctx.from.id))) {
      await ctx.reply("Эта команда доступна только администратору.");
      return;
    }

    const bookings = await getUpcomingAdminBookings(7);

    if (bookings.length === 0) {
      await ctx.reply("На ближайшие 7 дней броней пока нет.");
      return;
    }

    const grouped = new Map<string, BookingDetails[]>();

    for (const booking of bookings) {
      const current = grouped.get(booking.bookingDate) ?? [];
      current.push(booking);
      grouped.set(booking.bookingDate, current);
    }

    for (const [bookingDate, items] of grouped.entries()) {
      await ctx.reply(formatAdminBookings(formatBookingDateHuman(bookingDate), items));
    }

    await ctx.reply("Для просмотра конкретного дня используйте команду /admin_date YYYY-MM-DD");
  });

  bot.command("admin_date", async (ctx) => {
    if (!ctx.from || !isAdmin(config, String(ctx.from.id))) {
      await ctx.reply("Эта команда доступна только администратору.");
      return;
    }

    const bookingDate = ctx.match?.trim();

    if (!bookingDate) {
      await ctx.reply("Укажите дату в формате /admin_date 2026-06-17");
      return;
    }

    const bookings = await getAdminBookingsForDate(bookingDate);
    await ctx.reply(formatAdminBookings(formatBookingDateHuman(bookingDate), bookings));
  });

  bot.callbackQuery("show_rules", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(config.RULES_TEXT);
  });

  bot.callbackQuery("show_about", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(config.ABOUT_TEXT);
  });

  bot.callbackQuery("my_bookings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendUserBookings(ctx);
  });

  bot.callbackQuery(/^cancel_booking:(.+)$/, async (ctx) => {
    if (!ctx.from) {
      await ctx.answerCallbackQuery({ text: "Пользователь не найден." });
      return;
    }

    const bookingId = ctx.match[1];

    try {
      const booking = await cancelBooking(
        bookingId,
        String(ctx.from.id),
        isAdmin(config, String(ctx.from.id))
      );

      await ctx.answerCallbackQuery({ text: "Бронь отменена." });
      await ctx.reply(
        `Бронь отменена.\nДата: ${formatBookingDateHuman(booking.bookingDate)}\nВремя: ${booking.slotTimes.join(", ")}`
      );
    } catch (error) {
      await ctx.answerCallbackQuery({
        text: error instanceof Error ? error.message : "Не удалось отменить бронь.",
        show_alert: true,
      });
    }
  });

  bot.catch((error) => {
    console.error("Telegram bot error:", error.error);
  });

  return bot;
}

export async function setupBot(bot: Bot) {
  await bot.api.setMyCommands([
    { command: "start", description: "Открыть главное меню" },
    { command: "rules", description: "Правила и цены" },
    { command: "about", description: "О студии" },
    { command: "my_bookings", description: "Мои брони" },
  ]);
}
