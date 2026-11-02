import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ id: 'staff', role: 'STAFF' }));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  reusableTokenRedemption: { findMany: vi.fn() },
  token: { findMany: vi.fn() },
  tokenRedemption: { groupBy: vi.fn(), findMany: vi.fn() },
}));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({
  ALL_USER_ROLES: ['COLLAB', 'STAFF', 'COORDINATOR', 'ADMIN'],
  getUserSessionCookieFromRequest: () => 'session',
  verifyUserSessionCookie: async () => ({ userId: state.id, role: state.role }),
}));
import { GET as stats } from '@/app/api/user/journey/stats/route';
import { GET as history } from '@/app/api/user/journey/stats/history/route';
const user = { id: 'staff', username: 'staff', role: 'STAFF', person: { name: 'Ana', area: 'Caja' } };
const req = (path: string) => new NextRequest('http://localhost/api/user/journey/stats' + path);
beforeEach(() => {
  vi.clearAllMocks(); state.id = 'staff'; state.role = 'STAFF';
  db.user.findUnique.mockResolvedValue(user);
  db.user.findMany.mockResolvedValue([user]);
  db.reusableTokenRedemption.findMany.mockResolvedValue([]);
  db.token.findMany.mockResolvedValue([]);
  db.tokenRedemption.groupBy.mockResolvedValue([]);
  db.tokenRedemption.findMany.mockResolvedValue([]);
});
describe('actividad por colaborador', () => {
  it('cuenta solo operaciones atribuidas y separa reutilizables, pulseras, interactivos y llegadas', async () => {
    db.reusableTokenRedemption.findMany.mockResolvedValue([{ userId: 'staff', type: 'deliver', note: null, token: { group: { id: 'g', name: 'Barra', color: null } } }]);
    db.token.findMany.mockResolvedValue([{ deliveredByUserId: 'staff', batch: { staticTargetUrl: null } }, { deliveredByUserId: 'staff', batch: { staticTargetUrl: '/dinamica' } }]);
    db.tokenRedemption.groupBy.mockResolvedValue([{ by: 'staff', _count: { _all: 2 } }]);
    const res = await stats(req('?day=2025-01-01'));
    const data = await res.json();
    expect(data.me).toMatchObject({ reusableDeliveries: 1, rouletteDeliveries: 1, interactiveDeliveries: 1, birthdayRedemptions: 2, totalActions: 5, reusableGroups: [{ id: 'g', name: 'Barra', total: 1 }] });
    expect(data.scope).toBe('self');
  });
  it('rechaza fechas imposibles', async () => {
    expect((await stats(req('?day=2025-02-30'))).status).toBe(400);
    expect((await history(req('/history?day=2025-02-30&userId=staff'))).status).toBe(400);
  });
  it('restringe a coordinación el historial de administradores', async () => {
    state.id = 'coord'; state.role = 'COORDINATOR';
    db.user.findUnique.mockResolvedValueOnce({ ...user, id: 'coord', role: 'COORDINATOR' }).mockResolvedValueOnce({ ...user, id: 'admin', role: 'ADMIN' });
    expect((await history(req('/history?day=2025-01-01&userId=admin'))).status).toBe(403);
    expect(db.reusableTokenRedemption.findMany).not.toHaveBeenCalled();
  });
  it('identifica el registro host y filtra el grupo histórico correcto', async () => {
    db.tokenRedemption.findMany.mockResolvedValue([{ id: 'b', location: 'host', redeemedAt: new Date('2025-01-01T22:00:00Z'), reservation: { celebrantName: 'Sol', timeSlot: '22:00' } }]);
    const birthday = await (await history(req('/history?day=2025-01-01&userId=staff&category=birthday'))).json();
    expect(birthday.events[0]).toMatchObject({ type: 'host', groupName: 'Cumpleañero' });
    const snapshot = JSON.stringify({ reusableSnapshot: { version: 1, group: { id: 'old', name: 'Anterior', color: null }, prize: { id: 'p', label: 'Premio' } } });
    db.reusableTokenRedemption.findMany.mockResolvedValue([{ id: 'r', type: 'deliver', createdAt: new Date('2025-01-01T22:00:00Z'), note: snapshot, token: { prize: { label: 'Actual' }, group: { id: 'new', name: 'Nuevo' } } }]);
    const res = await history(req('/history?day=2025-01-01&userId=staff&category=reusable&group=%22old%22'));
    expect((await res.json()).events).toMatchObject([{ label: 'Premio', groupName: 'Anterior' }]);
  });
  it('filtra el historial de tokens interactivos por su lote', async () => {
    db.token.findMany.mockResolvedValue([{ id: 't', deliveredAt: new Date('2025-01-01T22:00:00Z'), prize: { label: 'Premio' } }]);
    const res = await history(req('/history?day=2025-01-01&userId=staff&category=interactive'));
    expect((await res.json()).events[0]).toMatchObject({ groupName: 'Tokens interactivos' });
    expect(db.token.findMany.mock.calls[0][0].where.batch).toEqual({ staticTargetUrl: { not: null } });
  });
});
