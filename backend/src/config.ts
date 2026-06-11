import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  WEB_APP_URL: z.string().url().default("https://example.com"),
  GOOGLE_SHEETS_URL: z.string().url().default("https://example.com"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().min(1).default("./data/dariga.db"),
  TELEGRAM_PROXY: z.string().default(""),
  ADMIN_TELEGRAM_IDS: z.string().default(""),
  ALLOW_DEV_AUTH: z
    .string()
    .default("true")
    .transform((value) => value.toLowerCase() === "true"),
  DEV_TELEGRAM_USER_ID: z.string().default("100000001"),
  DEV_TELEGRAM_USERNAME: z.string().default("dariga_dev"),
  STUDIO_NAME: z.string().default('Вокальная студия "Дарига"'),
  PAYMENT_DETAILS: z.string().default("ХХХХХ"),
  ABOUT_TEXT: z
    .string()
    .default(
      "Мы вокальная студия \"Дарига\". Здесь будет информация о студии, оборудовании, как пройти и инструкция."
    ),
  RULES_TEXT: z
    .string()
    .default(
      "Здесь будут актуальные цены и правила студии. Этот текст можно поменять позже без изменений логики."
    ),
});

const env = envSchema.parse(process.env);

export const appConfig = {
  ...env,
  adminTelegramIds: env.ADMIN_TELEGRAM_IDS.split(",")
    .map((item) => item.trim())
    .filter(Boolean),
};

export type AppConfig = typeof appConfig;
