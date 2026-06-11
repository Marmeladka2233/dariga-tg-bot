import { ProxyAgent, setGlobalDispatcher } from "undici";

function toProxyUrl(proxyValue: string) {
  const trimmed = proxyValue.trim();

  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split(":");

  if (parts.length !== 4) {
    throw new Error(
      "TELEGRAM_PROXY должен быть в формате host:port:username:password или готовым URL."
    );
  }

  const [host, port, username, password] = parts;

  return `http://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}`;
}

export function configureTelegramProxy(proxyValue: string) {
  const proxyUrl = toProxyUrl(proxyValue);

  if (!proxyUrl) {
    return false;
  }

  setGlobalDispatcher(new ProxyAgent(proxyUrl));
  return true;
}
