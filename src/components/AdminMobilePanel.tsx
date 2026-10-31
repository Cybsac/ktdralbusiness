"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";

import { getNavigationGroups } from "@/components/admin/navigation/catalog";
import { NAVIGATION_ICONS } from "@/components/admin/navigation/icons";
import { getActiveNavigationHref } from "@/components/admin/navigation/matching";
import { NavigationCategoryDivider } from "@/components/admin/navigation/NavigationCategoryDivider";
import { useNavigationExpansion } from "@/components/admin/navigation/useNavigationExpansion";
import { AdminMobileHeader } from "@/components/AdminMobileHeader";
import { cn } from "@/lib/utils";

// Dynamic import to avoid SSR issues
const SharedAutoAttendanceCard = dynamic(
  () => import("@/components/attendance/SharedAutoAttendanceCard"),
  { ssr: false }
);

interface AdminMobilePanelProps {
  basePath?: "admin" | "u";
  userInfo?: {
    role: string;
    displayName: string;
    dni?: string | null;
    area?: string | null;
    jobTitle?: string | null;
    code?: string | null;
  } | null;
}

export default function AdminMobilePanel({ basePath = "admin", userInfo }: AdminMobilePanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<"herramientas" | "upgrade" | "purge">("herramientas");
  const allGroups = useMemo(
    () => getNavigationGroups(basePath, userInfo?.role, "mobile"),
    [basePath, userInfo?.role]
  );
  const activeHref = getActiveNavigationHref(
    allGroups,
    pathname || "",
    searchParams?.toString() || ""
  );
  const { expanded: expandedGroups, toggle: toggleGroup } = useNavigationExpansion(
    allGroups,
    activeHref,
    `${basePath}:mobile`
  );
  const sidebarGroups = allGroups
    .filter((group) => {
      if (activeTab === "upgrade") {
        return group.kind === "upgrade";
      }
      if (activeTab === "purge") {
        return group.items.some((item) => item.href.includes("/purge"));
      }
      return group.kind !== "upgrade";
    })
    .map((group) => {
      if (activeTab === "purge" && group.purgeTitle) return { ...group, title: group.purgeTitle };
      return group;
    });

  useEffect(() => {
    if (activeHref)
      setActiveTab(activeHref.split("?")[0].endsWith("/purge") ? "purge" : "herramientas");
  }, [activeHref, allGroups]);

  const isItemActive = (href: string) => activeHref === href;

  return (
    <div className="block md:hidden min-h-screen bg-slate-50 dark:bg-slate-900 p-2 sm:p-3 lg:p-6">
      {/* Header similar to /u layout */}
      <AdminMobileHeader userInfo={userInfo} basePath={basePath} />

      <div className="max-w-7xl mx-auto">
        {/* Tabs */}
        <div className="mb-4 sm:mb-6">
          <div
            role="tablist"
            aria-label="Secciones del menú"
            onKeyDown={(event) => {
              const tabs = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              );
              const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              tabs[next]?.focus();
              tabs[next]?.click();
            }}
            className="flex space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg"
          >
            <button
              role="tab"
              aria-selected={activeTab === "herramientas"}
              aria-controls="mobile-navigation-panel"
              tabIndex={activeTab === "herramientas" ? 0 : -1}
              onClick={() => setActiveTab("herramientas")}
              className={cn(
                "flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors",
                activeTab === "herramientas"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              Herramientas
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "purge"}
              aria-controls="mobile-navigation-panel"
              tabIndex={activeTab === "purge" ? 0 : -1}
              onClick={() => setActiveTab("purge")}
              className={cn(
                "flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors",
                activeTab === "purge"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/30"
              )}
            >
              Purge
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "upgrade"}
              aria-controls="mobile-navigation-panel"
              tabIndex={activeTab === "upgrade" ? 0 : -1}
              onClick={() => setActiveTab("upgrade")}
              className={cn(
                "flex-1 py-2 px-3 text-sm font-medium rounded-md transition-colors relative",
                activeTab === "upgrade"
                  ? "bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <span className="flex items-center justify-center">
                Upgrade!
                {(activeTab === "herramientas" || activeTab === "purge") && (
                  <span className="ml-2 w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Subtítulo para Upgrade */}
        {activeTab === "upgrade" && (
          <div className="mb-4 sm:mb-6 text-center">
            <p className="text-sm sm:text-base text-amber-700 dark:text-amber-300 font-medium">
              🚀 Estas son herramientas premium que puedes desbloquear contactando con nuestro
              equipo de desarrollo
            </p>
            <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400 mt-1">
              Mejora tu experiencia con funciones avanzadas de gestión
            </p>
          </div>
        )}

        {/* Subtítulo para Purge */}
        {activeTab === "purge" && (
          <div className="mb-4 sm:mb-6 text-center">
            <p className="text-sm sm:text-base text-red-700 dark:text-red-300 font-medium">
              ⚠️ Herramientas de limpieza y mantenimiento del sistema
            </p>
            <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 mt-1">
              Usa con precaución - estas acciones no se pueden deshacer
            </p>
          </div>
        )}

        {/* Grid de categorías */}
        <div
          id="mobile-navigation-panel"
          role="tabpanel"
          aria-label={activeTab}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6"
        >
          {sidebarGroups.map((group, index) => (
            <Fragment key={group.id}>
              {activeTab === "herramientas" &&
                group.category &&
                sidebarGroups[index - 1]?.category !== group.category && (
                  <NavigationCategoryDivider category={group.category} first={index === 0} />
                )}
              <div
                className={cn(
                  "bg-white dark:bg-slate-800 rounded-lg sm:rounded-xl shadow-md sm:shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden",
                  group.id === "scanner"
                    ? "col-span-full sm:col-span-2 lg:col-span-3 xl:col-span-4"
                    : ""
                )}
              >
                {/* Header de la categoría */}
                {group.kind === "attendance" ? (
                  <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-base sm:text-lg font-semibold">{group.title}</h2>
                  </div>
                ) : group.id === "scanner" ? (
                  <Link
                    href={`${basePath === "admin" ? "/admin" : "/u"}/scanner`}
                    className="block p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                        {NAVIGATION_ICONS[group.icon]}
                      </div>
                      <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {group.title}
                      </h2>
                    </div>
                  </Link>
                ) : activeTab === "purge" ? (
                  <Link
                    href={group.items.find((item) => item.href.includes("/purge"))?.href || "#"}
                    className="block p-3 sm:p-4 border-b border-red-200 dark:border-red-800 bg-gradient-to-r from-red-50 to-red-50 dark:from-red-900/20 dark:to-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="p-1.5 sm:p-2 bg-red-100 dark:bg-red-900/40 rounded-lg text-red-600 dark:text-red-400">
                        {NAVIGATION_ICONS.box}
                      </div>
                      <h2 className="text-base sm:text-lg font-semibold text-red-800 dark:text-red-200 uppercase">
                        {group.title}
                      </h2>
                      <svg
                        className="h-5 w-5 text-red-500 dark:text-red-400 ml-auto"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </Link>
                ) : (
                  <button
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={expandedGroups.has(group.id)}
                    aria-controls={`mobile-navigation-${group.id}`}
                    className="w-full p-3 sm:p-4 border-b border-slate-200 dark:border-slate-700 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                          {NAVIGATION_ICONS[group.icon]}
                        </div>
                        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {group.title}
                        </h2>
                      </div>
                      <svg
                        className={cn(
                          "h-5 w-5 text-slate-500 dark:text-slate-400 transition-transform",
                          expandedGroups.has(group.id) ? "rotate-180" : ""
                        )}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </button>
                )}

                {/* Items de la categoría */}
                {(group.kind === "attendance" ||
                  (activeTab !== "purge" && expandedGroups.has(group.id))) && (
                  <div id={`mobile-navigation-${group.id}`} className="p-3 sm:p-4">
                    {group.kind === "attendance" ? (
                      <SharedAutoAttendanceCard showDynamicTitle={false} basePath="/admin" />
                    ) : (
                      <div className="space-y-2">
                        {group.items.map((item, itemIndex) => (
                          <Link
                            key={`${group.title}-${itemIndex}`}
                            href={item.href}
                            tabIndex={item.href === "#" ? -1 : undefined}
                            aria-current={isItemActive(item.href) ? "page" : undefined}
                            aria-disabled={item.href === "#" || undefined}
                            onClick={
                              item.href === "#" ? (event) => event.preventDefault() : undefined
                            }
                            className={cn(
                              "flex items-center space-x-3 p-2 sm:p-3 rounded-lg transition-all duration-200",
                              isItemActive(item.href)
                                ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                                : "hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-transparent"
                            )}
                          >
                            <div
                              className={cn(
                                "p-1 sm:p-1.5 rounded-md",
                                isItemActive(item.href)
                                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400"
                                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                              )}
                            >
                              {item.icon && NAVIGATION_ICONS[item.icon]}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span
                                className={cn(
                                  "text-sm font-medium block truncate",
                                  isItemActive(item.href)
                                    ? "text-blue-900 dark:text-blue-100"
                                    : "text-slate-900 dark:text-slate-100"
                                )}
                              >
                                {item.label}
                              </span>
                              {item.badge && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-amber-100 to-yellow-100 dark:from-amber-900/40 dark:to-yellow-900/40 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 mt-1">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            <svg
                              className={cn(
                                "h-4 w-4 flex-shrink-0",
                                isItemActive(item.href)
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-slate-400 dark:text-slate-500"
                              )}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Fragment>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-6 sm:mt-8 lg:mt-12 text-center">
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Panel de administración móvil · Go Lounge
          </p>
        </div>
      </div>
    </div>
  );
}
