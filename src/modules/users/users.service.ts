import { query } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  created_at: Date;
}

const PUBLIC_COLUMNS = 'id, email, name, created_at';

export async function getUserById(id: string): Promise<PublicUser> {
  const { rows } = await query<PublicUser>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  const user = rows[0];
  if (!user) throw notFound('User not found');
  return user;
}

export async function findUserByEmail(email: string): Promise<PublicUser | null> {
  const { rows } = await query<PublicUser>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  return rows[0] ?? null;
}
