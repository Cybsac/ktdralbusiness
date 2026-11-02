import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ session: vi.fn(), findGroup: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getUserSessionCookieFromRequest: () => 'session', verifyUserSessionCookie: mocks.session }));
vi.mock('@/lib/prisma', () => ({ prisma: { tokenGroup: { findUnique: mocks.findGroup } } }));
import { GET } from '@/app/api/admin/daily-evaluation/reusable/[groupId]/route';

const request = () => new NextRequest('http://localhost/api/admin/daily-evaluation/reusable/group');
const params = { params: { groupId: 'group' } };
const token = { id: 'rt_1', maxUses: 10, usedCount: 2, expiresAt: new Date('2099-01-01'), disabled: false, startTime: null, endTime: null, prize: { label: 'Premio', active: true } };

beforeEach(() => { vi.clearAllMocks(); });
describe('QR disponibles de un grupo', () => {
  it('exige una sesión con acceso a los QR', async () => {
    mocks.session.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: 'COLLAB' });
    expect((await GET(request(), params)).status).toBe(401);
    expect((await GET(request(), params)).status).toBe(403);
    expect(mocks.findGroup).not.toHaveBeenCalled();
  });
  it('no expone grupos bloqueados', async () => {
    mocks.session.mockResolvedValue({ role: 'ADMIN' });
    mocks.findGroup.mockResolvedValue({ locked: true, tokens: [token] });
    expect((await GET(request(), params)).status).toBe(404);
  });
  it('solo devuelve QR vigentes y utilizables', async () => {
    mocks.session.mockResolvedValue({ role: 'STAFF', area: 'Animación' });
    mocks.findGroup.mockResolvedValue({ locked: false, tokens: [token, { ...token, id: 'exhausted', usedCount: 10 }, { ...token, id: 'inactive', prize: { ...token.prize, active: false } }, { ...token, id: 'expired', expiresAt: new Date('2000-01-01') }] });
    const response = await GET(request(), params);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ tokens: [{ id: 'rt_1', label: 'Premio', usedCount: 2, maxUses: 10 }] });
  });
});
