import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rows: [] as any[],
  create: vi.fn(),
  read: vi.fn(),
  colors: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    prize: { findMany: mock.read, create: mock.create },
    $transaction: (fn: any) =>
      fn({ prize: { create: mock.create, findMany: mock.read }, gamePrizeCatalogItem: { findMany: mock.colors } }),
  },
}));
vi.mock("@/lib/prize-games/management-access", () => ({
  requirePrizeManagement: async () => null,
}));
import { POST } from "./prizes/route";
const request = (body: unknown) =>
  new Request("https://fixture.test/api/prizes", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mock.rows = [];
  mock.colors.mockImplementation(async () =>
    mock.rows
      .filter((row) => row.gameCatalogItems)
      .reverse()
      .map((prize) => ({ prize: { color: prize.color } }))
  );
  mock.read.mockImplementation(async () => mock.rows);
  mock.create.mockImplementation(async ({ data }: any) => {
    const row = { id: `id-${data.key}`, ...data };
    mock.rows.push(row);
    return row;
  });
});
describe("actual prize creation contract with storage simulated", () => {
  it("creates a new physical prize in this preparation with its own stock, never global stock", async () => {
    const response = await POST(
      new Request(`https://fixture.test/api/prizes?scope=game`, {
        method: "POST",
        body: JSON.stringify({ label: "Premio de hoy", stock: 7 }),
      })
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      label: "Premio de hoy",
      stock: 7,
    });
    expect(mock.create.mock.calls[0][0].data).toMatchObject({
      stock: 0,
      staticEnabled: false,
      gameEnabled: true,
      active: true,
      gameCatalogItems: { create: { stock: 7 } },
    });
    expect(mock.create.mock.calls[0][0].data.color).toMatch(/^#[0-9A-F]{6}$/);
    expect(mock.read).not.toHaveBeenCalled();
  });
  it("assigns distinguishable colors automatically and rejects unrelated controls", async () => {
    const send = (body: unknown) =>
      POST(
        new Request(`https://fixture.test/api/prizes?scope=game`, {
          method: "POST",
          body: JSON.stringify(body),
        })
      );
    await send({ label: "A", stock: 3 });
    await send({ label: "B", stock: 4 });
    expect(mock.rows[0].color).not.toBe(mock.rows[1].color);
    for (const extra of [
      { color: "#FFFFFF" },
      { active: false },
      { staticEnabled: true },
      { gameEnabled: false },
    ])
      expect((await send({ label: "X", stock: 1, ...extra })).status).toBe(400);
    for (const body of [{ label: "X" }, { label: "X", stock: null }])
      expect((await send(body)).status).toBe(400);
    expect(mock.create).toHaveBeenCalledTimes(2);
  });

  it("creates sequential keys using the real handler", async () => {
    const first = await (await POST(request({ label: "A" }))).json();
    const second = await (await POST(request({ label: "B" }))).json();
    expect([first.key, second.key]).toEqual(["premio1", "premio2"]);
  });
  it("reuses a free key without colliding with existing records", async () => {
    mock.rows = [{ key: "premio1" }, { key: "premio3" }];
    expect((await (await POST(request({ label: "A" }))).json()).key).toBe("premio2");
  });
  it("recomputes after a competing creation wins the same key", async () => {
    mock.create.mockImplementationOnce(async () => {
      mock.rows.push({ key: "premio1" });
      throw { code: "P2002", meta: { target: ["key"] } };
    });
    expect((await (await POST(request({ label: "A" }))).json()).key).toBe("premio2");
  });
  it("rejects invalid stock before writing", async () => {
    expect((await POST(request({ label: "A", stock: -1 }))).status).toBe(400);
    expect(mock.create).not.toHaveBeenCalled();
  });
});

it("assigns automatic colors and isolated identity to static prizes", async () => {
  const response = await POST(new Request("https://fixture.test/api/prizes?scope=static", {method:"POST", body:JSON.stringify({label:"Premio interactivo",stock:3})}));
  expect(response.status).toBe(201);
  const saved = mock.create.mock.calls[0][0].data;
  expect(saved).toMatchObject({stock:3,active:true,staticEnabled:true,gameEnabled:false,isReusable:false});
  expect(saved.key).toMatch(/^static_/);
  expect(saved.color).toMatch(/^#[0-9A-F]{6}$/);
});
