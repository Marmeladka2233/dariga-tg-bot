import { createBot, setupBot } from "./bot";
import { appConfig } from "./config";
import { initDatabase } from "./lib/database";
import { buildMiniAppUrl, resolvePublicApiInfo } from "./lib/public-api-url";
import { createTelegramProxyAgent } from "./lib/telegram-proxy";
import { createServer } from "./server";

async function bootstrap() {
  initDatabase();

  const proxyEnabled = createTelegramProxyAgent(appConfig.TELEGRAM_PROXY) !== null;

  if (proxyEnabled) {
    console.log("Telegram proxy is enabled for local testing.");
  }

  const bot = createBot(appConfig);
  const server = createServer(bot, appConfig);
  await server.listen({
    port: appConfig.API_PORT,
    host: "0.0.0.0",
  });

  let closePublicApi: (() => Promise<void>) | undefined;
  try {
    const publicApiInfo = await resolvePublicApiInfo(appConfig);

    if (publicApiInfo) {
      appConfig.WEB_APP_URL = buildMiniAppUrl(appConfig, publicApiInfo.apiBaseUrl);
      closePublicApi = publicApiInfo.close;
      console.log(`Public API URL for Mini App: ${publicApiInfo.apiBaseUrl}`);
    } else {
      appConfig.WEB_APP_URL = buildMiniAppUrl(appConfig);
    }
  } catch (error) {
    appConfig.WEB_APP_URL = buildMiniAppUrl(appConfig);
    console.error("Public API URL setup failed:", error);
  }

  await setupBot(bot);

  await bot.start({
    onStart() {
      console.log(`Bot polling started. API is available on port ${appConfig.API_PORT}.`);
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      if (closePublicApi) {
        await closePublicApi();
      }

      process.exit(0);
    });
  }
}

bootstrap().catch(async (error) => {
  console.error("Application startup failed:", error);
  process.exit(1);
});
