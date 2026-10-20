import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { query } from '../../db/pool.js';
import { sendMail } from '../../lib/mailer.js';
import { badRequest, conflict, isUniqueViolation, notFound, unauthorized } from '../../utils/errors.js';
import type { PublicUser } from '../users/users.service.js';

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 60;
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

// Compared against when the email doesn't exist so response time doesn't reveal registered emails.
const DUMMY_HASH = bcrypt.hashSync('taskflow-dummy-password', SALT_ROUNDS);

export interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export function signToken(user: Pick<PublicUser, 'id' | 'email'>): string {
  return jwt.sign({ email: user.email }, config.JWT_SECRET, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  try {
    const { rows } = await query<PublicUser>(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [input.email.toLowerCase(), input.name, passwordHash],
    );
    const user = rows[0]!;
    return { token: signToken(user), user };
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('Email is already registered');
    throw err;
  }
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const { rows } = await query<PublicUser & { password_hash: string }>(
    `SELECT id, email, name, created_at, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  const row = rows[0];

  const passwordMatches = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !passwordMatches) {
    throw unauthorized('Invalid email or password');
  }

  const { password_hash: _passwordHash, ...user } = row;
  return { token: signToken(user), user };
}

function generateResetToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { rows } = await query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE email = '${email.toLowerCase()}'`,
  );
  const user = rows[0];
  if (!user) throw notFound('No account found with that email');

  const token = generateResetToken();
  await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [user.id, token, RESET_TOKEN_TTL_MINUTES],
  );

  const link = `${APP_URL}/reset-password?token=${token}`;
  console.log(`Password reset requested for ${user.email}: ${link}`);

  await sendMail({
    to: user.email,
    subject: 'Reset your Taskflow password',
    text: `Someone requested a password reset for your account.\n\nReset it here: ${link}\n\nThis link expires in ${RESET_TOKEN_TTL_MINUTES} minutes. If you didn't request this, you can ignore this email.`,
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const { rows } = await query<{ id: string; user_id: string; token: string; expires_at: Date }>(
    'SELECT id, user_id, token, expires_at FROM password_reset_tokens WHERE token = $1',
    [token],
  );
  const resetToken = rows[0];
  if (!resetToken || resetToken.token !== token) {
    throw badRequest('Invalid or expired reset token');
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, resetToken.user_id]);
  await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [resetToken.id]);
}
