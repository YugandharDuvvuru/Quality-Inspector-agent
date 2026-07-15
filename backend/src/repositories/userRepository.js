import { query, withTransaction } from "../db/connection.js";

export async function createUser({ fullName, mobile, email, passwordHash, passwordSalt }) {
  const result = await query(
    `
      INSERT INTO app_users (
        full_name,
        mobile,
        email,
        password_hash,
        password_salt,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, full_name, mobile, email, created_at
    `,
    [fullName, mobile, normalizeEmail(email), passwordHash, passwordSalt]
  );

  return mapUser(result.rows[0]);
}

export async function findUserByEmail(email) {
  const result = await query(
    `
      SELECT id, full_name, mobile, email, password_hash, password_salt, created_at
      FROM app_users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizeEmail(email)]
  );

  return result.rows[0] || null;
}

export async function createSession({ userId, tokenHash, expiresAt }) {
  await query(
    `
      INSERT INTO user_sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt]
  );
}

export async function findActiveSessionByTokenHash(tokenHash) {
  const result = await query(
    `
      SELECT
        s.id AS session_id,
        s.expires_at,
        u.id,
        u.full_name,
        u.mobile,
        u.email,
        u.created_at
      FROM user_sessions s
      JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return {
    sessionId: row.session_id,
    expiresAt: row.expires_at,
    user: mapUser(row),
  };
}

export async function revokeSessionByTokenHash(tokenHash) {
  await query(
    `
      UPDATE user_sessions
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `,
    [tokenHash]
  );
}

export async function pruneExpiredSessionsForUser(userId) {
  await withTransaction(async (client) => {
    await client.query(
      `
        UPDATE user_sessions
        SET revoked_at = NOW()
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND expires_at <= NOW()
      `,
      [userId]
    );
  });
}

export function mapUser(row) {
  return {
    id: row.id,
    name: row.full_name,
    mobile: row.mobile,
    email: row.email,
    created_at: row.created_at,
  };
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
