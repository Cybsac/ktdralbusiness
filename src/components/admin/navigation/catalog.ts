import { categorizeNavigation, type NavigationCategory } from "./categories";
import type { NavigationIcon } from "./icons";
export type NavigationItem = {
  href: string;
  label: string;
  icon?: NavigationIcon;
  badge?: string;
  children?: NavigationItem[];
};
export type NavigationGroup = {
  id: string;
  title: string;
  category?: NavigationCategory;
  icon: NavigationIcon;
  items: NavigationItem[];
  purgeTitle?: string;
  kind?: "links" | "attendance" | "upgrade";
};
export function getNavigationGroups(
  basePath: "admin" | "u",
  userRole?: string,
  surface: "desktop" | "mobile" = "desktop"
): NavigationGroup[] {
  const pathPrefix = basePath === "admin" ? "/admin" : "/u";
  const groups: NavigationGroup[] = [
    ...(basePath === "admin" && ["ADMIN", "COORDINATOR"].includes(userRole || "") ? [{
      id: "estacion-operacion",
      title: "ESTACIÓN DE OPERACIÓN",
      icon: "qr" as const,
      items: [{ href: "/admin/estacion", label: "Abrir estación", icon: "qr" as const }],
    }] : []),
    ...(basePath === "admin" && surface === "mobile"
      ? [
          {
            id: "attendance",
            title: "MARCAR ENTRADA/SALIDA",
            icon: "clock" as const,
            kind: "attendance" as const,
            items: [
              { href: "/admin/assistance", label: "Marcar Entrada/Salida", icon: "check" as const },
            ],
          },
          {
            id: "scanner",
            title: "ESCÁNER MULTI-USO",
            icon: "qr" as const,
            items: [{ href: "/admin/scanner", label: "Escáner", icon: "qr" as const }],
          },
        ]
      : []),

    ...(basePath === "admin"
      ? [
          {
            id: "estadisticas-globales",
            title: "ESTADÍSTICAS GLOBALES",
            icon: "chart" as const,
            items: [
              {
                href: `${pathPrefix}/statics`,
                label: "Estadísticas Globales",
                icon: "chart" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "reglamento",
            title: "REGLAMENTO",
            icon: "book" as const,
            items: [
              {
                href: `${pathPrefix}/regulations`,
                label: "Reglamento Interno",
                icon: "book" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "noticias-internas",
            title: "NOTICIAS INTERNAS",
            icon: "book" as const,
            items: [
              { href: `${pathPrefix}/internalnews`, label: "Noticias", icon: "book" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin" || ["ADMIN", "COORDINATOR"].includes(userRole || "")
      ? [
          {
            id: "resumen-de-jornada",
            title: "RESUMEN DE JORNADA",
            icon: "checkSmall" as const,
            items: [
              {
                href: `${pathPrefix}/daily-evaluation`,
                label: "Resumen de Jornada",
                icon: "checkSmall" as const,
              },
              {
                href: `${pathPrefix}/weekly-evaluation`,
                label: "Resumen Semanal",
                icon: "chart" as const,
              },
              { href: `${pathPrefix}/evolucion`, label: "Evolución", icon: "chart" as const },
            ],
          },
        ]
      : []),
    {
      id: "pulseras-tokenshow",
      purgeTitle: "Eliminar lotes Tokenshow",
      title: "PULSERAS TOKENSHOW",
      icon: "roulette" as const,
      items:
        basePath === "admin"
          ? [
              { href: `${pathPrefix}/tokens`, label: "Panel de Control", icon: "chart" as const },
              {
                href: `${pathPrefix}/prizes`,
                label: "Gestionar premios",
                icon: "starSmall" as const,
              },
              { href: `${pathPrefix}/roulettebatches`, label: "Lotes", icon: "box" as const },
              {
                href: `${pathPrefix}/printroulette`,
                label: "Imprimir Pulseras",
                icon: "checkSmall" as const,
              },
              { href: `${pathPrefix}/themes`, label: "Temas", icon: "starSmall" as const },
              {
                href: `${pathPrefix}/roulettebatches/purge`,
                label: "Purge",
                icon: "check" as const,
              },
            ]
          : [{ href: `${pathPrefix}/tokens`, label: "Panel de Control", icon: "chart" as const }],
    },
    ...(basePath === "admin"
      ? [
          {
            id: "pulseras-interactivas",
            title: "PULSERAS INTERACTIVAS",
            icon: "box" as const,
            items: [
              {
                href: `${pathPrefix}/prizesstatics`,
                label: "Gestionar premios",
                icon: "starSmall" as const,
              },
              { href: `${pathPrefix}/static-batches`, label: "Lotes", icon: "box" as const },
              {
                href: `${pathPrefix}/static-batches/metrics`,
                label: "Métricas",
                icon: "chart" as const,
              },
              {
                href: `${pathPrefix}/printstatics`,
                label: "Imprimir Pulseras",
                icon: "checkSmall" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "tokens-reutilizables",
            title: "TOKENS REUTILIZABLES",
            icon: "qr" as const,
            items: [
              {
                href: `${pathPrefix}/reusable-tokens`,
                label: "Gestión de Tokens",
                icon: "qr" as const,
              },
              {
                href: `${pathPrefix}/reusable-tokens/purge`,
                label: "Purge",
                icon: "check" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "sorteos-qr",
            title: "SORTEOS QR",
            icon: "qr" as const,
            items: [
              { href: `${pathPrefix}/sorteos-qr?tab=batches`, label: "Lotes", icon: "qr" as const },
              {
                href: `${pathPrefix}/sorteos-qr?tab=policies`,
                label: "Políticas",
                icon: "checkSmall" as const,
              },
              { href: `${pathPrefix}/sorteos-qr/purge`, label: "Purge", icon: "box" as const },
              {
                href: `${pathPrefix}/sorteos-qr?tab=stats`,
                label: "Estadísticas",
                icon: "chart" as const,
              },
              { href: "/qr-generator", label: "Generador Público", icon: "starSmall" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "dinamicas-publicas",
            title: "DINÁMICAS PÚBLICAS",
            icon: "qr" as const,
            items: [
              {
                href: `${pathPrefix}/intercambiocliente`,
                label: "Intercambios",
                icon: "qr" as const,
              },
              {
                href: `${pathPrefix}/intercambiocliente?tab=lotes`,
                label: "Lotes",
                icon: "box" as const,
              },
              {
                href: `${pathPrefix}/intercambiocliente?tab=politicas`,
                label: "Políticas",
                icon: "checkSmall" as const,
              },
              {
                href: `${pathPrefix}/intercambiocliente?tab=stats`,
                label: "Estadísticas",
                icon: "chart" as const,
              },
              { href: "/intercambio", label: "Página Pública", icon: "starSmall" as const },
            ],
          },
          {
            id: "mundial-2026",
            title: "MUNDIAL 2026",
            icon: "starSmall" as const,
            items: [
              {
                href: `${pathPrefix}/mundial2026`,
                label: "Premios y liquidación",
                icon: "starSmall" as const,
              },
              {
                href: `${pathPrefix}/mundial2026/data`,
                label: "Data",
                icon: "usersSmall" as const,
              },
              { href: `${pathPrefix}/mundial/insights`, label: "Insights", icon: "chart" as const },
              { href: "/mundial2026", label: "Página pública", icon: "qr" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "gestion-de-ofertas",
            title: "GESTION DE OFERTAS",
            icon: "tag" as const,
            items: [
              { href: `${pathPrefix}/offers`, label: "Panel de Ofertas", icon: "tag" as const },
              { href: "/marketing#ofertas", label: "Ver en marketing", icon: "starSmall" as const },
            ],
          },
        ]
      : []),
    {
      id: "gestion-de-personal",
      title: "GESTIÓN DE PERSONAL",
      icon: "users" as const,
      items:
        basePath === "admin"
          ? [
              { href: `${pathPrefix}/users`, label: "Colaboradores", icon: "usersSmall" as const },
              ...(["ADMIN", "COORDINATOR"].includes(userRole || "")
                ? [
                    {
                      href: `${pathPrefix}/prize-authorization`,
                      label: "Autorización de canjes (OTP)",
                      icon: "settings" as const,
                    },
                  ]
                : []),
              {
                href: `${pathPrefix}/attendance`,
                label: "Control de Asistencia",
                icon: "chart" as const,
              },
            ]
          : [{ href: `${pathPrefix}/attendance`, label: "Mi Asistencia", icon: "chart" as const }],
    },
    ...(basePath === "admin"
      ? [
          {
            id: "gestion-de-tareas",
            title: "GESTIÓN DE TAREAS",
            icon: "check" as const,
            items: [
              // Put Brief del día first
              {
                href: `${pathPrefix}/day-brief`,
                label: "Brief del día",
                icon: "checkSmall" as const,
              },
              { href: `${pathPrefix}/tasks`, label: "Tareas", icon: "checkSmall" as const },
              {
                href: `${pathPrefix}/tasks/status`,
                label: "Métricas por colaborador",
                icon: "usersSmall" as const,
              },
              {
                href: `${pathPrefix}/tasks/metrics`,
                label: "Métricas de Tareas",
                icon: "chart" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "gestion-de-inventario",
            title: "GESTIÓN DE INVENTARIO",
            icon: "box" as const,
            items: [
              {
                href: `${pathPrefix}/inventory/suppliers`,
                label: "Proveedores",
                icon: "box" as const,
              },
              {
                href: `${pathPrefix}/inventory/stock`,
                label: "Control de Stock",
                icon: "box" as const,
              },
              {
                href: `${pathPrefix}/inventory/alerts`,
                label: "Alertas",
                icon: "checkSmall" as const,
              },
              { href: `${pathPrefix}/inventory/units`, label: "Unidades", icon: "box" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "gestion-de-cumpleanos",
            purgeTitle: "Eliminar reservas",
            title: "GESTIÓN DE CUMPLEAÑOS",
            icon: "cake" as const,
            items: [
              { href: `${pathPrefix}/birthdays`, label: "Reservas", icon: "cake" as const },
              {
                href: `${pathPrefix}/birthdays/packs`,
                label: "Gestión de packs",
                icon: "box" as const,
              },
              {
                href: `${pathPrefix}/birthdays/referrers`,
                label: "Referrers",
                icon: "users" as const,
              },
              {
                href: `${pathPrefix}/birthdays/referrers/metrics`,
                label: "Métricas",
                icon: "chart" as const,
              },
              {
                href: `${pathPrefix}/birthdays/special-bottle`,
                label: "Botella especial",
                icon: "settings" as const,
              },
              { href: `${pathPrefix}/birthdays/purge`, label: "Purge", icon: "check" as const },
            ],
          },
        ]
      : []),

    ...(basePath === "admin"
      ? [
          {
            id: "invitaciones-especiales",
            title: "INVITACIONES ESPECIALES",
            icon: "star" as const,
            items: [
              {
                href: `${pathPrefix}/generadorinvitaciones`,
                label: "Eventos",
                icon: "starSmall" as const,
              },
              {
                href: `${pathPrefix}/generadorinvitaciones/create`,
                label: "Crear evento",
                icon: "checkSmall" as const,
              },
              {
                href: `${pathPrefix}/generadorinvitaciones/stats`,
                label: "Estadísticas",
                icon: "chart" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "gestion-de-shows",
            title: "GESTIÓN DE SHOWS",
            icon: "film" as const,
            items: [
              { href: `${pathPrefix}/shows`, label: "Shows", icon: "filmSmall" as const },
              { href: "/marketing#shows", label: "Ver en marketing", icon: "starSmall" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "pedidos-musicales",
            title: "PEDIDOS MUSICALES",
            icon: "music" as const,
            items: [
              {
                href: `${pathPrefix}/music-orders`,
                label: "Pedidos Musicales",
                icon: "music" as const,
              },
              { href: `${pathPrefix}/dj/console`, label: "Consola DJ", icon: "settings" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "gestion-de-clientes",
            title: "GESTIÓN DE CLIENTES",
            icon: "users" as const,
            items: [
              { href: `${pathPrefix}/customers`, label: "Clientes", icon: "usersSmall" as const },
              { href: `${pathPrefix}/customers/visits`, label: "Visitas", icon: "chart" as const },
              {
                href: `${pathPrefix}/customers/analytics`,
                label: "Analíticas",
                icon: "chart" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "contenido-visual",
            title: "CONTENIDO VISUAL",
            icon: "film" as const,
            items: [
              {
                href: `${pathPrefix}/marketing/gallery`,
                label: "Galería de Fotos",
                icon: "filmSmall" as const,
              },
              {
                href: `${pathPrefix}/marketing-controls`,
                label: "Controles Marketing",
                icon: "starSmall" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "produccion-multimedia",
            title: "PRODUCCIÓN MULTIMEDIA",
            icon: "clock" as const,
            items: [
              { href: `${pathPrefix}/producciones`, label: "Tablero", icon: "filmSmall" as const },
              {
                href: `${pathPrefix}/producciones?view=list`,
                label: "Lista",
                icon: "checkSmall" as const,
              },
            ],
          },
        ]
      : [
          {
            id: "produccion-multimedia",
            title: "PRODUCCIÓN MULTIMEDIA",
            icon: "film" as const,
            items: [
              {
                href: `${pathPrefix}/producciones`,
                label: "🎬 Producciones",
                icon: "filmSmall" as const,
              },
              { href: "/u/producciones/ideas", label: "💡 Ideas", icon: "starSmall" as const },
              { href: "/u/producciones/tareas", label: "🔁 Tareas", icon: "checkSmall" as const },
            ],
          },
        ]),
    ...(basePath === "admin"
      ? [
          {
            id: "venta-de-tickets",
            title: "VENTA DE TICKETS",
            icon: "check" as const,
            items: [
              { href: `${pathPrefix}/tickets`, label: "Tickets", icon: "checkSmall" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "carta-pedidos",
            title: "CARTA & PEDIDOS",
            icon: "book" as const,
            items: [
              {
                href: `${pathPrefix}/mesas`,
                label: "Gestión de Mesas",
                icon: "checkSmall" as const,
              },
              { href: `${pathPrefix}/menu`, label: "Gestión de Menú", icon: "book" as const },
              { href: `${pathPrefix}/pedidos`, label: "Panel de Pedidos", icon: "chart" as const },
              { href: "/menu", label: "Menú Público", icon: "starSmall" as const },
            ],
          },
        ]
      : []),
    ...(basePath === "admin" && userRole === "ADMIN"
      ? [
          {
            id: "sistema",
            title: "SISTEMA",
            icon: "settings" as const,
            items: [
              {
                href: `${pathPrefix}/service-access`,
                label: "Acceso de la aplicación",
                icon: "settings" as const,
              },
            ],
          },
        ]
      : []),
    ...(basePath === "admin"
      ? [
          {
            id: "upgrade",
            title: "UPGRADE",
            icon: "star" as const,
            items: [
              { href: "#", label: "Personalización de la App", icon: "star" as const },
              { href: "#", label: "Gestión de Trivias", icon: "checkSmall" as const },
              { href: "#", label: "Gestión de Fidelidad", icon: "star" as const },
              { href: "#", label: "Gestión Wifi", icon: "qr" as const },
            ],
          },
        ]
      : []),
  ];

  const orderedGroups = basePath === "admin" ? categorizeNavigation(groups) : groups;
  return orderedGroups.map((group) => ({
    ...group,
    kind: group.kind ?? (group.id === "upgrade" ? "upgrade" : "links"),
  }));
}
