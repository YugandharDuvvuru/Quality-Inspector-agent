import { env } from "../config/env.js";

export function setSessionCookie(res, token, expiresAt) {
  res.cookie(env.AUTH_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(env.AUTH_COOKIE_NAME, baseCookieOptions());
}

export function extractSessionCookie(req) {
  const rawCookieHeader = req.get("cookie") || "";
  const cookies = rawCookieHeader.split(";").map((cookie) => cookie.trim()).filter(Boolean);

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1);

    if (name === env.AUTH_COOKIE_NAME) {
      return decodeURIComponent(value || "");
    }
  }

  return "";
}

function baseCookieOptions() {
  return {
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: "/",
  };
}
