import localtunnel, { type Tunnel } from "localtunnel";

import { appConfig, type AppConfig } from "../config";

type PublicApiInfo = {
  apiBaseUrl: string;
  close?: () => Promise<void>;
};

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export function buildMiniAppUrl(config: AppConfig, apiBaseUrl?: string) {
  const miniAppUrl = new URL(config.WEB_APP_URL);

  if (apiBaseUrl) {
    miniAppUrl.searchParams.set("apiBaseUrl", normalizeUrl(apiBaseUrl));
  }

  if (config.GOOGLE_SHEETS_URL) {
    miniAppUrl.searchParams.set("googleSheetsUrl", config.GOOGLE_SHEETS_URL);
  }

  return miniAppUrl.toString();
}

async function openLocalTunnel(config: AppConfig): Promise<Tunnel> {
  return localtunnel({
    port: config.API_PORT,
    subdomain: config.PUBLIC_API_TUNNEL_SUBDOMAIN || undefined,
  });
}

export async function resolvePublicApiInfo(
  config: AppConfig = appConfig
): Promise<PublicApiInfo | null> {
  if (config.PUBLIC_API_BASE_URL) {
    return {
      apiBaseUrl: normalizeUrl(config.PUBLIC_API_BASE_URL),
    };
  }

  if (!config.PUBLIC_API_TUNNEL_ENABLED) {
    return null;
  }

  const tunnel = await openLocalTunnel(config);

  return {
    apiBaseUrl: normalizeUrl(tunnel.url),
    close: async () => {
      tunnel.close();
    },
  };
}
