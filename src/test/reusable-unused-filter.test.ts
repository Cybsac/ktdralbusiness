import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), reusableToken: { count: vi.fn() }, reusablePrize: { findMany: vi.fn() }, tokenGroup: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/auth', () => ({ getSessionCookieFromRequest: () => 'cookie', verifySessionCookie: async () => ({}), requireRole: () => ({ ok: true }) }));
import { GET } from '@/app/api/admin/reusable-tokens/recent/route';

beforeEach(() => { vi.clearAllMocks(); db.$queryRaw.mockResolvedValue([]); db.reusableToken.count.mockResolvedValue(3); db.reusablePrize.findMany.mockResolvedValue([]); db.tokenGroup.findMany.mockResolvedValue([]); });
describe('filtro de tokens sin usos', () => {
  it('aplica el filtro al conteo y a la consulta paginada', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/reusable-tokens/recent?page=2&limit=2&usage=unused'));
    expect(response.status).toBe(200);
    expect(db.reusableToken.count).toHaveBeenCalledWith({ where: { usedCount: 0 } });
    const [parts, flag, ...values] = db.$queryRaw.mock.calls[0];
    expect(parts.join('?')).toContain('rt."usedCount" = 0');
    expect(flag).toBe(true);
    expect(values.slice(-2)).toEqual([2, 2]);
    expect((await response.json()).pagination).toMatchObject({ page: 2, total: 3, totalPages: 2 });
  });
  it('mantiene la lista completa por defecto', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/reusable-tokens/recent'));
    expect(response.status).toBe(200);
    expect(db.reusableToken.count).toHaveBeenCalledWith({ where: {} });
    expect(db.$queryRaw.mock.calls[0][1]).toBe(false);
  });
  it('busca nombre de premio, ID y grupo en todas las páginas', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/reusable-tokens/recent?search=Barra'));
    expect(response.status).toBe(200);
    const where = db.reusableToken.count.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ group: { is: { name: { contains: 'Barra', mode: 'insensitive' } } } });
    expect(where.OR).toContainEqual({ prize: { label: { contains: 'Barra', mode: 'insensitive' } } });
    expect(db.$queryRaw.mock.calls[0][0].join('?')).toContain('FROM "TokenGroup"');
    expect(db.$queryRaw.mock.calls[0]).toContain('Barra');
  });
  it.each(['newest', 'oldest', 'most_used', 'least_used'])('aplica el orden %s antes de paginar', async (sort) => {
    const response = await GET(new NextRequest(`http://localhost/api/admin/reusable-tokens/recent?page=2&limit=2&sort=${sort}`));
    expect(response.status).toBe(200);
    const [parts, ...values] = db.$queryRaw.mock.calls[0];
    expect(parts.join('?')).toContain('ORDER BY');
    expect(parts.join('?')).toContain('rt."usedCount"');
    expect(values).toContain(sort);
    expect(values.slice(-2)).toEqual([2, 2]);
  });
  it('rechaza órdenes desconocidos', async () => {
    expect((await GET(new NextRequest('http://localhost/api/admin/reusable-tokens/recent?sort=invalid'))).status).toBe(400);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
