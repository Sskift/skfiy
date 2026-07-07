import { readRecord } from "./cli-record-utils.js";

export function sanitizeTokenFree(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTokenFree(item));
  }

  const record = readRecord(value);
  if (record) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(record)) {
      if (item === undefined) {
        continue;
      }
      sanitized[key] = isSensitiveFieldName(key)
        ? "[redacted]"
        : sanitizeTokenFree(item);
    }

    return sanitized;
  }

  return typeof value === "string" ? sanitizeSensitiveString(value) : value;
}

export function sanitizeDashboardUrlForOutput(value: string): string {
  try {
    const url = new URL(value);

    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveFieldName(key)) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return sanitizeSensitiveString(value);
  }
}

export function sanitizeSensitiveString(value: string): string {
  return value
    .replace(
      /\b(?:token|access_token|refresh_token|id_token|api_key|authorization|cookie)=([^&\s"']+)/gi,
      "redacted=[redacted]"
    )
    .replace(
      /\b(?:authorization|bearer|basic)\s+[-._~+/=A-Za-z0-9]+/gi,
      "redacted [redacted]"
    );
}

export function isSensitiveFieldName(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");

  return new Set([
    "token",
    "accesstoken",
    "refreshtoken",
    "idtoken",
    "apikey",
    "authorization",
    "cookie",
    "setcookie",
    "secret",
    "clientsecret",
    "password"
  ]).has(normalized);
}
