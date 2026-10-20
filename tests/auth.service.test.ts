import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/pool.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

const { query } = await import('../src/db/pool.js');
const authService = await import('../src/modules/auth/auth.service.js');
const mockedQuery = vi.mocked(query);

const user = { id: '9b2f3c1e-4c5d-4a8e-9f00-1a2b3c4d5e6f', email: 'ada@example.com', name: 'Ada', created_at: new Date() };

describe('auth.service', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('signs a token with the user id as subject', () => {
    const token = authService.signToken(user);
    const payload = jwt.decode(token) as jwt.JwtPayload;
    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe(user.email);
  });

  it('logs in with valid credentials and does not return the password hash', async () => {
    const password_hash = await bcrypt.hash('correct-horse', 4);
    mockedQuery.mockResolvedValueOnce({ rows: [{ ...user, password_hash }] } as never);

    const result = await authService.login('ADA@example.com', 'correct-horse');

    expect(result.user).toEqual(user);
    expect(result.user).not.toHaveProperty('password_hash');
    expect(mockedQuery.mock.calls[0]?.[1]).toEqual(['ada@example.com']);
  });

  it('rejects a wrong password', async () => {
    const password_hash = await bcrypt.hash('correct-horse', 4);
    mockedQuery.mockResolvedValueOnce({ rows: [{ ...user, password_hash }] } as never);

    await expect(authService.login(user.email, 'wrong')).rejects.toMatchObject({ status: 401 });
  });

  it('rejects an unknown email with the same error', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(authService.login('nobody@example.com', 'whatever')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
  });

  it('maps duplicate emails to 409 on register', async () => {
    mockedQuery.mockRejectedValueOnce(Object.assign(new Error('duplicate key'), { code: '23505' }));

    await expect(
      authService.register({ email: user.email, name: user.name, password: 'long-enough' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('auth.service password reset', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('stores a reset token for a known email', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [{ id: user.id, email: user.email }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await authService.requestPasswordReset(user.email);

    const [sql, params] = mockedQuery.mock.calls[1]!;
    expect(sql).toContain('INSERT INTO password_reset_tokens');
    expect(params?.[0]).toBe(user.id);
    expect(typeof params?.[1]).toBe('string');
  });

  it('rejects an unknown reset token', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [] } as never);

    await expect(authService.resetPassword('nope', 'new-password-123')).rejects.toMatchObject({ status: 400 });
  });

  it('updates the password hash and marks the token used', async () => {
    mockedQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'rt-1', user_id: user.id, token: 'abc', expires_at: new Date(Date.now() + 60_000) }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    await authService.resetPassword('abc', 'new-password-123');

    expect(mockedQuery.mock.calls[1]?.[0]).toContain('UPDATE users SET password_hash');
    expect(mockedQuery.mock.calls[2]?.[1]).toEqual(['rt-1']);
  });
});
