import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ session: { userId: 'c', role: 'COORDINATOR' } as { userId: string; role: string } | null }));
const db = vi.hoisted(() => ({ user: { findMany: vi.fn() }, $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn() }));
const activity = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'cookie', verifyUserSessionCookie: async () => state.session }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/activity-milestones/service', () => ({ readActivityMilestones: activity.read }));
vi.mock('@/lib/log', () => ({ logEvent: vi.fn() }));
import { GET as userGET } from '@/app/api/user/activity-milestones/route';
import { GET as adminGET, POST as adminPOST } from '@/app/api/admin/activity-milestones/route';
const userRequest = (query = '') => new NextRequest('http://localhost/api/user/activity-milestones' + query);
const adminRequest = (body: unknown) => new NextRequest('http://localhost/api/admin/activity-milestones', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks(); state.session = { userId: 'c', role: 'COORDINATOR' };
  db.user.findMany.mockResolvedValue([{ id: 'c', role: 'COORDINATOR', username: 'c', person: { name: 'C', area: null } }, { id: 's', role: 'STAFF', username: 's', person: { name: 'S', area: null } }, { id: 'a', role: 'ADMIN', username: 'a', person: { name: 'A', area: null } }]);
  activity.read.mockImplementation(async ids => ({ rules: [], users: ids.map((userId: string) => ({ userId, total: 0, points: 0, awards: [], next: null })) }));
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(1);
  db.$transaction.mockImplementation(async fn => fn(db));
});
describe('permisos y configuración de hitos', () => {
  it('limita el resumen de coordinación y evita exponer administradores', async () => {
    const response = await userGET(userRequest('?scope=team'));
    expect(response.status).toBe(200);
    expect(activity.read).toHaveBeenCalledWith(['c', 's']);
  });
  it('no permite a colaboradores solicitar el equipo ni modificar hitos', async () => {
    state.session = { userId: 's', role: 'STAFF' };
    expect((await userGET(userRequest('?scope=team'))).status).toBe(403);
    expect((await adminGET(new NextRequest('http://localhost/api/admin/activity-milestones'))).status).toBe(403);
    expect((await adminPOST(adminRequest({ action: 'create', threshold: 50, points: 5 }))).status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('valida reglas y crea hitos en una transacción', async () => {
    state.session = { userId: 'a', role: 'ADMIN' };
    expect((await adminPOST(adminRequest({ action: 'create', threshold: -1, points: 5 }))).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    expect((await adminPOST(adminRequest({ action: 'create', threshold: 1000, points: 50 }))).status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
