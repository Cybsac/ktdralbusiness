import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROULETTE_CONFIG } from '../../src/lib/experiences/roulette-config';
import { GAME_POLICY, PrizeGameError } from '../../src/lib/prize-games/contracts';
import { gamePrizeAccessPath } from '../../src/lib/prize-games/links';

const mock = vi.hoisted(() => ({ config: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), prizes: vi.fn() }));
vi.mock('@/lib/config', () => ({ getSystemConfig: mock.config }));
vi.mock('@/lib/prisma', () => ({ prisma: { token: { findUnique: mock.findUnique, findMany: mock.findMany, groupBy: mock.groupBy }, prize: { findMany: mock.prizes } } }));
import { loadPublicGame } from '../../src/lib/prize-games/public-load';

const prize = { id: 'test-prize', key: 'prize', label: 'Synthetic result', color: null, active: true };
function row(overrides: Record<string, unknown> = {}) {
  return { id: 'fixture', batchId: 'fixture-batch', prizeId: prize.id, prize, assignedPrize: null, expiresAt: new Date(Date.now() + 60_000), batch: { experienceType: 'roulette', functionalDate: null }, revealedAt: null, redeemedAt: null, deliveredAt: null, disabled: false, pairedNextTokenId: null, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  mock.config.mockResolvedValue({ tokensEnabled: true });
  mock.findUnique.mockResolvedValue(row());
  mock.findMany.mockResolvedValue([]);
  mock.groupBy.mockResolvedValue([{ prizeId: prize.id, _count: { _all: 1 } }]);
  mock.prizes.mockResolvedValue([prize]);
});
afterEach(() => vi.useRealTimers());

describe('public game server load', () => {
  it('reads the initial token once and creates configured presentation sectors only while playable', async () => {
    const result = await loadPublicGame('fixture');
    expect(mock.findUnique).toHaveBeenCalledTimes(1);
    expect(result.data?.elements).toHaveLength(GAME_POLICY.minimumRouletteSegments);
    expect(mock.groupBy).toHaveBeenCalledTimes(1);
  });
  it.each([{ revealedAt: new Date() }, { deliveredAt: new Date() }, { disabled: true }])('does not query live inventory for historical or blocked data: %j', async overrides => {
    mock.findUnique.mockResolvedValue(row(overrides));
    const result = await loadPublicGame('fixture');
    expect(result.data?.elements).toHaveLength(1);
    expect(result.data?.token.prize.id).toBe(prize.id);
    expect(mock.groupBy).not.toHaveBeenCalled();
    expect(mock.prizes).not.toHaveBeenCalled();
  });
  it('does not read anything for an empty link', async () => {
    expect((await loadPublicGame('')).error).toBeDefined();
    expect(mock.findUnique).not.toHaveBeenCalled();
  });
  it('returns the original domain error and does not retry on entry', async () => {
    mock.findUnique.mockRejectedValue(new PrizeGameError('NOT_FOUND', 'Token no encontrado', 404));
    expect((await loadPublicGame('fixture')).error?.code).toBe('NOT_FOUND');
    expect(mock.findUnique).toHaveBeenCalledTimes(1);
  });
  it('bounds stalled server reads without a second query', async () => {
    vi.useFakeTimers();
    mock.findUnique.mockReturnValue(new Promise(() => {}));
    const result = loadPublicGame('fixture');
    await vi.advanceTimersByTimeAsync(ROULETTE_CONFIG.requestTimeoutMs);
    expect((await result).error?.code).toBe('GAME_TIMEOUT');
    expect(mock.findUnique).toHaveBeenCalledTimes(1);
  });
  it('preserves the existing access link and optional selected theme', () => {
    expect(gamePrizeAccessPath('fixture')).toBe('/marketing/ruleta?tokenId=fixture');
    expect(gamePrizeAccessPath('fixture', 'christmas')).toBe('/marketing/ruleta?tokenId=fixture&theme=christmas');
  });
});
