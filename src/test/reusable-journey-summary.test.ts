import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ tokenGroup: { findMany: vi.fn() }, reusableToken: { findMany: vi.fn() }, reusableTokenRedemption: { findMany: vi.fn() } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
import { reusable } from '@/lib/daily-evaluation-summary/reusable';
import { summaryWindow } from '@/lib/daily-evaluation-summary/window';
import { readReusableSnapshot } from '@/lib/reusable-tokens/history-snapshot';

beforeEach(() => { vi.clearAllMocks(); });
describe('resumen de QR por grupo', () => {
  it('distingue disponibilidad actual, grupos históricos y eventos estimados', async () => {
    const current = { id: 'new', name: 'Grupo actual', color: '#123456', locked: false, sortOrder: 0 };
    const locked = { id: 'locked', name: 'Grupo bloqueado', color: null, locked: true, sortOrder: 1 };
    db.tokenGroup.findMany.mockResolvedValue([current, locked]);
    const base = { disabled: false, expiresAt: new Date('2099-01-01Z'), maxUses: 10, usedCount: 3, startTime: null, endTime: null, prize: { id: 'p', label: 'Premio actual', active: true }, _count: { redemptions: 1 } };
    db.reusableToken.findMany.mockResolvedValue([
      { ...base, id: 't1', groupId: 'new' },
      { ...base, id: 't2', groupId: 'locked', usedCount: 10, _count: { redemptions: 10 } },
      { ...base, id: 't3', groupId: null, expiresAt: new Date('2000-01-01Z'), usedCount: 0, _count: { redemptions: 0 } },
    ]);
    const token = { groupId: 'new', group: { id: 'new', name: 'Grupo actual', color: '#123456' }, prize: { id: 'p', label: 'Premio actual' } };
    const old = { version: 1, group: { id: 'old', name: 'Grupo original', color: null }, prize: { id: 'p-old', label: 'Premio original' } };
    db.reusableTokenRedemption.findMany.mockResolvedValue([
      { note: JSON.stringify({ reusableSnapshot: old }), token },
      { note: null, token },
      { note: JSON.stringify({ reusableSnapshot: { version: 1, group: { id: 'new', name: 'Nombre anterior', color: null }, prize: { id: 'p', label: 'Etiqueta anterior' } } }), token },
      { note: JSON.stringify({ reusableSnapshot: { ...old, group: null } }), token },
      { note: JSON.stringify({ reusableSnapshot: { ...old, group: { id: 'locked', name: 'Grupo bloqueado', color: null } } }), token },
    ]);
    const result = await reusable(summaryWindow('2025-01-01'));
    expect(result.find(g => g.id === 'new')).toMatchObject({ totalTokens: 1, activeTokens: 1, remainingUses: 7, daySales: 2, estimatedEvents: 1, untrackedUses: 2, historicalNames: ['Nombre anterior'] });
    expect(result.find(g => g.id === 'old')).toMatchObject({ name: 'Grupo original', historicalOnly: true, daySales: 1, estimatedEvents: 0, activeTokens: 0 });
    expect(result.find(g => g.id === 'locked')).toMatchObject({ locked: true, daySales: 1, activeTokens: 0, remainingUses: 0 });
    expect(result.find(g => g.id === null)).toMatchObject({ totalTokens: 1, activeTokens: 0, daySales: 1, estimatedEvents: 0 });
    expect(result.find(g => g.id === 'new')?.prizes[0]).toMatchObject({ historicalLabels: ['Etiqueta anterior'] });
    expect(result.find(g => g.id === 'old')?.prizes[0]).toMatchObject({ label: 'Premio original', daySales: 1 });
  });
  it('trata notas antiguas o inválidas como historial sin fotografía', () => {
    expect(readReusableSnapshot(null)).toBeNull();
    expect(readReusableSnapshot('texto antiguo')).toBeNull();
    expect(readReusableSnapshot(JSON.stringify({ reusableSnapshot: { version: 1, group: {}, prize: {} } }))).toBeNull();
  });
});
