import { authenticateToken } from "../services/authService.js";
import { extractSessionCookie } from "../utils/sessionCookie.js";

export async function requireAuth(req, _res, next) {
  try {
    const token = extractAuthToken(req);

    if (!token) {
      const error = new Error("Authentication required");
      error.statusCode = 401;
      throw error;
    }

    req.authToken = token;
    req.user = await authenticateToken(token);
    return next();
  } catch (error) {
    return next(error);
  }
}

export function extractAuthToken(req) {
  return extractSessionCookie(req) || extractBearerToken(req);
}

export function extractBearerToken(req) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return "";
  }

  return token.trim();
}
