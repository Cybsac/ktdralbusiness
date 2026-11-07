import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ user: { findUnique: vi.fn(), updateMany: vi.fn() } }));
const auth = vi.hoisted(() => ({ session: { userId: 'u1', role: 'STAFF', area: 'Caja' }, cookie: vi.fn() }));
const password = vi.hoisted(() => ({ compare: vi.fn(), hash: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({
  getUserSessionCookieFromRequest: () => 'cookie',
  verifyUserSessionCookie: async () => auth.session,
  createUserSessionCookie: auth.cookie,
  buildSetUserCookie: (value: string) => 'user_session=' + value,
}));
vi.mock('@/lib/log', () => ({ logEvent: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: { compare: password.compare, hash: password.hash } }));
import { PATCH } from '@/app/api/user/me/password/route';

const request = (body: unknown) => new Request('http://localhost/api/user/me/password', { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks();
  auth.session = { userId: 'u1', role: 'STAFF', area: 'Caja' };
  auth.cookie.mockResolvedValue('renewed');
  db.user.findUnique.mockResolvedValue({ id: 'u1', username: 'ana', passwordHash: 'old', forcePasswordChange: true });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  password.compare.mockResolvedValue(true);
  password.hash.mockResolvedValue('new-hash');
});
describe('cambio de contraseña del perfil', () => {
  it('renueva la sesión y elimina el cambio obligatorio tras guardar', async () => {
    const response = await PATCH(request({ currentPassword: 'anterior', newPassword: 'nueva-segura' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBe('user_session=renewed');
    expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'u1', passwordHash: 'old' }, data: { passwordHash: 'new-hash', forcePasswordChange: false } });
  });
  it('rechaza contraseña actual incorrecta sin modificar nada', async () => {
    password.compare.mockResolvedValue(false);
    expect((await PATCH(request({ currentPassword: 'incorrecta', newPassword: 'nueva-segura' }))).status).toBe(401);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it('valida tipos y el límite en bytes', async () => {
    expect((await PATCH(request({ currentPassword: 42, newPassword: 'nueva-segura' }))).status).toBe(400);
    expect((await PATCH(request({ currentPassword: 'actual', newPassword: '😀'.repeat(19) }))).status).toBe(400);
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });
  it('no pisa un cambio simultáneo de contraseña', async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const response = await PATCH(request({ currentPassword: 'actual', newPassword: 'nueva-segura' }));
    expect(response.status).toBe(409);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});
