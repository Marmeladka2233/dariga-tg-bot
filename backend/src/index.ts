import { createBot, setupBot } from "./bot";
import { appConfig } from "./config";
import { initDatabase } from "./lib/database";
import { configureTelegramProxy } from "./lib/telegram-proxy";
import { createServer } from "./server";

async function bootstrap() {
  initDatabase();

  const proxyEnabled = configureTelegramProxy(appConfig.TELEGRAM_PROXY);

  if (proxyEnabled) {
    console.log("Telegram proxy is enabled for local testing.");
  }

  const bot = createBot(appConfig);
  await setupBot(bot);

  const server = createServer(bot, appConfig);
  await server.listen({
    port: appConfig.API_PORT,
    host: "0.0.0.0",
  });

  await bot.start({
    onStart() {
      console.log(`Bot polling started. API is available on port ${appConfig.API_PORT}.`);
    },
  });
}

bootstrap().catch(async (error) => {
  console.error("Application startup failed:", error);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    process.exit(0);
  });
}
