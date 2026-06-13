import fs from "node:fs";
import path from "node:path";

import { google, type sheets_v4 } from "googleapis";

import { appConfig, type AppConfig } from "../config";

export class GoogleSheetsConfigError extends Error {}

let cachedSheetsClient: sheets_v4.Sheets | null = null;

export function isGoogleSheetsSyncEnabled(config: AppConfig = appConfig) {
  return (
    config.GOOGLE_SHEETS_SYNC_ENABLED &&
    Boolean(config.GOOGLE_SHEETS_SPREADSHEET_ID) &&
    Boolean(config.GOOGLE_SHEETS_CREDENTIALS_PATH)
  );
}

export function getGoogleSheetsSpreadsheetUrl(config: AppConfig = appConfig) {
  return (
    config.GOOGLE_SHEETS_URL ||
    `https://docs.google.com/spreadsheets/d/${config.GOOGLE_SHEETS_SPREADSHEET_ID}/edit?usp=sharing`
  );
}

export function resolveGoogleSheetsCredentialsPath(config: AppConfig = appConfig) {
  return path.resolve(process.cwd(), config.GOOGLE_SHEETS_CREDENTIALS_PATH);
}

export async function getGoogleSheetsClient(config: AppConfig = appConfig) {
  if (!isGoogleSheetsSyncEnabled(config)) {
    throw new GoogleSheetsConfigError("Синхронизация Google Sheets отключена.");
  }

  const credentialsPath = resolveGoogleSheetsCredentialsPath(config);

  if (!fs.existsSync(credentialsPath)) {
    throw new GoogleSheetsConfigError(
      `Файл credentials.json не найден по пути ${credentialsPath}.`
    );
  }

  if (!cachedSheetsClient) {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    cachedSheetsClient = google.sheets({
      version: "v4",
      auth: await auth.getClient(),
    });
  }

  return cachedSheetsClient;
}
