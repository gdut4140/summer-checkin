const LOCAL_DEVELOPMENT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
] as const;

function normalizeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function configuredWebSocketOrigins(
  applicationUrl = process.env.BETTER_AUTH_URL
): Set<string> {
  const origins = new Set<string>(LOCAL_DEVELOPMENT_ORIGINS);
  const configured = applicationUrl ? normalizeOrigin(applicationUrl) : null;
  if (configured) origins.add(configured);
  return origins;
}

export function isAllowedWebSocketUpgrade(
  requestUrl: string | undefined,
  origin: string | undefined,
  allowedOrigins = configuredWebSocketOrigins()
): boolean {
  if (!requestUrl) return false;

  let pathname: string;
  try {
    pathname = new URL(requestUrl, "http://websocket.internal").pathname;
  } catch {
    return false;
  }
  if (pathname !== "/ws") return false;

  // Browser WebSocket handshakes always carry Origin. Because authentication
  // uses cookies, fail closed when it is absent or does not match the app.
  const normalized = origin ? normalizeOrigin(origin) : null;
  return normalized !== null && allowedOrigins.has(normalized);
}
