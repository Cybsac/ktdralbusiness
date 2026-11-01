import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({ reusableToken: { findMany: vi.fn(), count: vi.fn() } }));
const remove = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/reusable-tokens/deletion', () => ({ deleteUnusedReusableTokens: remove }));
vi.mock('@/lib/auth', () => ({ getSessionCookieFromRequest: () => 'cookie', verifySessionCookie: async () => ({}), requireRole: () => ({ ok: true }) }));
import { GET } from '@/app/api/admin/reusable-tokens/all/route';
import { POST } from '@/app/api/admin/reusable-tokens/bulk-delete/route';

const asOf = '2025-01-02T00:00:00.000Z';
beforeEach(() => { vi.clearAllMocks(); });
describe('depuración de tokens reutilizables', () => {
  it('pagina y cuenta seleccionables con el mismo filtro, excluyendo historial', async () => {
    db.reusableToken.findMany.mockResolvedValue([]);
    db.reusableToken.count.mockResolvedValueOnce(8).mockResolvedValueOnce(5);
    const response = await GET(new NextRequest(`http://localhost/api/admin/reusable-tokens/all?page=2&limit=3&usage=unused&search=promo&asOf=${encodeURIComponent(asOf)}`));
    expect(response.status).toBe(200);
    const find = db.reusableToken.findMany.mock.calls[0][0];
    expect(find).toMatchObject({ skip: 3, take: 3, where: { usedCount: 0, createdAt: { lte: new Date(asOf) } } });
    const eligible = db.reusableToken.count.mock.calls[1][0].where;
    expect(eligible.AND[1]).toEqual({ usedCount: 0, redemptions: { none: {} } });
    expect((await response.json())).toMatchObject({ eligible: 5, pagination: { total: 8, totalPages: 3 }, asOf });
  });
  it('procesa selección filtrada con límite y conserva la validación al borrar', async () => {
    db.reusableToken.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    remove.mockResolvedValue({ deleted: 1, skipped: 1 });
    const request = new NextRequest('http://localhost/api/admin/reusable-tokens/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { search: 'promo', usage: 'unused', asOf }, cursor: 'previous' }) });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(db.reusableToken.findMany.mock.calls[0][0]).toMatchObject({ take: 1000, orderBy: { id: 'asc' } });
    expect(db.reusableToken.findMany.mock.calls[0][0].where.AND).toContainEqual({ id: { gt: 'previous' } });
    expect(remove).toHaveBeenCalledWith(['a', 'b']);
    expect(await response.json()).toMatchObject({ deleted: 1, skipped: 1, nextCursor: null });
  });
  it('rechaza selecciones inválidas sin borrar', async () => {
    const request = new NextRequest('http://localhost/api/admin/reusable-tokens/bulk-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { usage: 'unused', asOf: 'no-date' } }) });
    expect((await POST(request)).status).toBe(400);
    expect(remove).not.toHaveBeenCalled();
  });
});
