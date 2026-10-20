import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { query } from '../../db/pool.js';
import { conflict, isUniqueViolation, unauthorized } from '../../utils/errors.js';
import type { PublicUser } from '../users/users.service.js';

const SALT_ROUNDS = 12;

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
