type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openLink: (url: string) => void;
  showAlert?: (message: string, callback?: () => void) => void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp;
}

export function initTelegramWebApp() {
  const webApp = getTelegramWebApp();

  if (!webApp) {
    return null;
  }

  webApp.ready();
  webApp.expand();

  return webApp;
}

export function openExternalLink(url: string) {
  const webApp = getTelegramWebApp();

  if (webApp) {
    webApp.openLink(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export function closeMiniApp() {
  const webApp = getTelegramWebApp();

  if (webApp) {
    webApp.close();
    return;
  }

  window.close();
}

export async function showTelegramAlert(message: string) {
  const webApp = getTelegramWebApp();

  if (webApp?.showAlert) {
    await new Promise<void>((resolve) => {
      webApp.showAlert?.(message, () => resolve());
    });

    return;
  }

  window.alert(message);
}
