export const NAVIGATION_CATEGORIES = {
  internal: {
    label: "Operación interna",
    groups: [
      "reglamento",
      "noticias-internas",
      "resumen-de-jornada",
      "gestion-de-personal",
      "gestion-de-tareas",
      "gestion-de-inventario",
      "gestion-de-cumpleanos",
      "invitaciones-especiales",
      "produccion-multimedia",
    ],
  },
  commercial: {
    label: "Operación comercial",
    groups: [
      "estacion-operacion",
      "control-ingreso",
      "pulseras-tokenshow",
      "pulseras-interactivas",
      "tokens-reutilizables",
      "sorteos-qr",
      "mundial-2026",
      "dinamicas-publicas",
      "pedidos-musicales",
    ],
  },
  publicWeb: {
    label: "Web pública",
    groups: ["gestion-de-ofertas", "gestion-de-shows", "contenido-visual", "venta-de-tickets"],
  },
  other: { label: "Otros", groups: [] },
} as const;

export type NavigationCategory = keyof typeof NAVIGATION_CATEGORIES;

/** Explicitly ordered categories; unspecified tools retain their relative order. */
export function categorizeNavigation<T extends { id: string }>(
  groups: T[]
): Array<T & { category: NavigationCategory }> {
  const assigned = new Set<string>();
  const result: Array<T & { category: NavigationCategory }> = [];
  for (const category of Object.keys(NAVIGATION_CATEGORIES) as NavigationCategory[]) {
    for (const id of NAVIGATION_CATEGORIES[category].groups) {
      const group = groups.find((item) => item.id === id);
      if (group) {
        result.push({ ...group, category });
        assigned.add(id);
      }
    }
  }
  for (const group of groups)
    if (!assigned.has(group.id)) result.push({ ...group, category: "other" });
  return result;
}
