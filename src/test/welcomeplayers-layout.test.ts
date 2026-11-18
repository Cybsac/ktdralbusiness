import { describe, expect, it } from "vitest";
import { getWelcomePlayersWheelSize, resolveWelcomePlayersDisplayMode } from "@/lib/welcomeplayers/layout";

describe("diseño adaptable de la ruleta", () => {
  it("detecta pantallas verticales grandes y aprovecha su ancho", () => {
    const mode = resolveWelcomePlayersDisplayMode(1080, 1920, "auto");
    expect(mode).toBe("kiosk");
    expect(getWelcomePlayersWheelSize({ width: 1080, height: 1920, displayMode: mode })).toBeGreaterThan(850);
  });
  it("se adapta a un tótem con resolución CSS reducida", () => {
    const mode = resolveWelcomePlayersDisplayMode(540, 960, "auto");
    expect(getWelcomePlayersWheelSize({ width: 540, height: 960, displayMode: mode })).toBeGreaterThan(450);
  });
  it("mantiene la ruleta dentro de móviles pequeños y respeta el modo elegido", () => {
    expect(resolveWelcomePlayersDisplayMode(1080, 1920, "compact")).toBe("compact");
    const size = getWelcomePlayersWheelSize({ width: 320, height: 568, displayMode: "compact" });
    expect(size).toBeLessThan(320);
    expect(size).toBeLessThan(568 / 2);
  });
});
