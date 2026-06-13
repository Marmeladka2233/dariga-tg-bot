const API_OVERRIDE_STORAGE_KEY = "dariga_api_base_url";
const GOOGLE_SHEETS_OVERRIDE_STORAGE_KEY = "dariga_google_sheets_url";

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function getQueryParamValue(paramName: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return new URL(window.location.href).searchParams.get(paramName)?.trim() ?? "";
}

function getStoredValue(storageKey: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(storageKey)?.trim() ?? "";
}

function persistValue(storageKey: string, value: string) {
  if (typeof window === "undefined" || !value) {
    return;
  }

  window.localStorage.setItem(storageKey, value);
}

export function getApiBaseUrl() {
  const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
  const queryOverride = getQueryParamValue("apiBaseUrl");

  if (queryOverride) {
    persistValue(API_OVERRIDE_STORAGE_KEY, queryOverride);
    return normalizeUrl(queryOverride);
  }

  const storedOverride = getStoredValue(API_OVERRIDE_STORAGE_KEY);

  if (storedOverride) {
    return normalizeUrl(storedOverride);
  }

  return normalizeUrl(defaultBaseUrl);
}

export function getGoogleSheetsUrl() {
  const defaultUrl = import.meta.env.VITE_GOOGLE_SHEETS_URL ?? "";
  const queryOverride = getQueryParamValue("googleSheetsUrl");

  if (queryOverride) {
    persistValue(GOOGLE_SHEETS_OVERRIDE_STORAGE_KEY, queryOverride);
    return queryOverride;
  }

  const storedOverride = getStoredValue(GOOGLE_SHEETS_OVERRIDE_STORAGE_KEY);

  if (storedOverride) {
    return storedOverride;
  }

  return defaultUrl;
}
