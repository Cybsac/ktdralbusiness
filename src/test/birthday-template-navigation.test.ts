import { describe, expect, it } from "vitest";

import { getNavigationGroups } from "@/components/admin/navigation/catalog";
import { getActiveNavigationHref } from "@/components/admin/navigation/matching";

describe("navegación de plantilla de cumpleaños", () => {
  it.each(["desktop", "mobile"] as const)("muestra la sección a ADMIN en %s", (surface) => {
    const groups = getNavigationGroups("admin", "ADMIN", surface);
    const group = groups.find((item) => item.id === "gestion-de-cumpleanos");
    expect(group?.items.some((item) => item.href === "/admin/birthdays/template")).toBe(true);
    expect(getActiveNavigationHref(groups, "/admin/birthdays/template")).toBe(
      "/admin/birthdays/template"
    );
  });
  it.each(["COORDINATOR", "STAFF", "COLLAB"])("oculta la sección a %s", (role) => {
    const groups = getNavigationGroups("admin", role);
    expect(
      groups
        .flatMap((group) => group.items)
        .some((item) => item.href === "/admin/birthdays/template")
    ).toBe(false);
  });
});
