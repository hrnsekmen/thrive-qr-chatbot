export type UserSession = {
  name: string;
  email: string;
  createdAt: number;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp: number;
    formatted?: string;
  };
};

const PREFIX = 'qrSession:';

export function getCurrentLinkKey(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    // Normalize by ignoring hash; include path + search so different QR links produce distinct keys
    const linkPart = `${url.pathname}?${url.searchParams.toString()}`;
    return PREFIX + btoa(encodeURIComponent(linkPart)).replace(/=+$/, '');
  } catch {
    return null;
  }
}

export function loadSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const key = getCurrentLinkKey();
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as UserSession;
  } catch {
    return null;
  }
}

export function saveSession(session: UserSession): void {
  if (typeof window === 'undefined') return;
  const key = getCurrentLinkKey();
  if (!key) return;
  window.localStorage.setItem(key, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  const key = getCurrentLinkKey();
  if (!key) return;
  window.localStorage.removeItem(key);
}



