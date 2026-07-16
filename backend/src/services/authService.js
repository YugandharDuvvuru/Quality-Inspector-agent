import crypto from "crypto";
import { isDatabaseReady } from "../db/connection.js";
import {
  createSession,
  createUser,
  findActiveSessionByTokenHash,
  findUserByEmail,
  normalizeEmail,
  normalizeRole,
  pruneExpiredSessionsForUser,
  revokeSessionByTokenHash,
} from "../repositories/userRepository.js";
import { env } from "../config/env.js";

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SCRYPT_COST = 16384;

export async function registerUser({ name, mobile, email, password, role }) {
  ensureAuthDatabaseReady();

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    const error = new Error("An account already exists for this email");
    error.statusCode = 409;
    throw error;
  }

  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(password, passwordSalt);
  const user = await createUser({
    fullName: name.trim(),
    mobile: mobile.trim(),
    email: normalizedEmail,
    role: normalizeRole(role),
    passwordHash,
    passwordSalt,
  });
  const session = await issueSession(user.id);

  return {
    user,
    token: session.token,
    expires_at: session.expiresAt,
  };
}

export async function loginUser({ email, password }) {
  ensureAuthDatabaseReady();

  const userRecord = await findUserByEmail(email);

  if (!userRecord) {
    throwInvalidCredentialsError();
  }

  const passwordHash = await hashPassword(password, userRecord.password_salt);
  const passwordMatches = timingSafeEqual(passwordHash, userRecord.password_hash);

  if (!passwordMatches) {
    throwInvalidCredentialsError();
  }

  await pruneExpiredSessionsForUser(userRecord.id);
  const session = await issueSession(userRecord.id);

  return {
    user: {
      id: userRecord.id,
      name: userRecord.full_name,
      mobile: userRecord.mobile,
      email: userRecord.email,
      role: userRecord.role || "VIEWER",
      created_at: userRecord.created_at,
    },
    token: session.token,
    expires_at: session.expiresAt,
  };
}

export async function authenticateToken(token) {
  ensureAuthDatabaseReady();

  const tokenHash = hashSessionToken(token);
  const session = await findActiveSessionByTokenHash(tokenHash);

  if (!session) {
    const error = new Error("Authentication required");
    error.statusCode = 401;
    throw error;
  }

  return session.user;
}

export async function logoutUser(token) {
  ensureAuthDatabaseReady();
  await revokeSessionByTokenHash(hashSessionToken(token));
}

function ensureAuthDatabaseReady() {
  if (!isDatabaseReady()) {
    const error = new Error("Authentication database is not ready");
    error.statusCode = 503;
    throw error;
  }
}

async function issueSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + env.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000);

  await createSession({
    userId,
    tokenHash,
    expiresAt,
  });

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  };
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      String(password),
      salt,
      PASSWORD_KEY_LENGTH,
      { N: PASSWORD_SCRYPT_COST },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey.toString("hex"));
      }
    );
  });
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), "hex");
  const rightBuffer = Buffer.from(String(right), "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function throwInvalidCredentialsError() {
  const error = new Error("Invalid email or password");
  error.statusCode = 401;
  throw error;
}
