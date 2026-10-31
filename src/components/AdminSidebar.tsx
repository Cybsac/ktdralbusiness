"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { getNavigationGroups } from "@/components/admin/navigation/catalog";
import { NAVIGATION_ICONS as ICONS } from "@/components/admin/navigation/icons";
import { getActiveNavigationHref } from "@/components/admin/navigation/matching";
import { NavigationCategoryDivider } from "@/components/admin/navigation/NavigationCategoryDivider";
import { useNavigationExpansion } from "@/components/admin/navigation/useNavigationExpansion";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

interface AdminSidebarProps {
  isCollapsed?: boolean;
  onToggle?: () => void;
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

export function AdminSidebar({
  isCollapsed = false,
  onToggle,
  basePath = "admin",
  userInfo,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const groups = useMemo(
    () => getNavigationGroups(basePath, userInfo?.role),
    [basePath, userInfo?.role]
  );
  const activeHref = getActiveNavigationHref(
    groups,
    pathname || "",
    searchParams?.toString() || ""
  );
  const { expanded, toggle } = useNavigationExpansion(groups, activeHref, basePath);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isCollapsed) return;
    const frame = requestAnimationFrame(() => {
      const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active || !navRef.current) return;
      const item = active.getBoundingClientRect(),
        container = navRef.current.getBoundingClientRect();
      if (item.top < container.top || item.bottom > container.bottom)
        active.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeHref, isCollapsed]);
  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        // Use window.location for full page reload to re-evaluate server-side layout
        window.location.href = "/u/login";
      } else {
        window.location.href = "/u/login";
      }
    } catch {
      window.location.href = "/u/login";
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col h-dvh bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700">
        {!isCollapsed && (
          <div className="min-w-0 flex flex-1 items-center space-x-2">
            <div className="shrink-0 w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">
                {userInfo ? userInfo.displayName.charAt(0).toUpperCase() : "U"}
              </span>
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-semibold text-sm truncate">
                {userInfo ? userInfo.displayName : "Cargando..."}
              </span>
              {userInfo && userInfo.role !== "GUEST" && (
                <div className="space-y-0.5 mt-1">
                  {userInfo.dni && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      DNI: {userInfo.dni}
                    </span>
                  )}
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">
                    Rol: {userInfo.role}
                  </span>
                  {userInfo.area && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      Área: {userInfo.area}
                    </span>
                  )}
                  {userInfo.jobTitle && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 block">
                      Cargo: {userInfo.jobTitle}
                    </span>
                  )}
                </div>
              )}
              {userInfo && userInfo.role === "GUEST" && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{userInfo.role}</span>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          aria-label={isCollapsed ? "Expandir menú" : "Contraer menú"}
          aria-expanded={!isCollapsed}
          onClick={onToggle}
          className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      {/* Theme Toggle Container */}
      <div className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Tema</span>
          )}
          <ThemeToggle compact={isCollapsed} />
        </div>
      </div>

      <nav
        aria-label="Navegación de administración"
        ref={navRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-3"
      >
        <div className={cn("space-y-2", isCollapsed ? "px-1" : "px-3")}>
          {groups.map((group, index) => {
            const open = !isCollapsed && expanded.has(group.id);
            const active = group.items.some((item) => item.href === activeHref);
            const upgrade = group.kind === "upgrade";
            return (
              <section key={group.id}>
                {group.category && groups[index - 1]?.category !== group.category && (
                  <NavigationCategoryDivider
                    category={group.category}
                    collapsed={isCollapsed}
                    first={index === 0}
                  />
                )}
                <button
                  type="button"
                  aria-label={group.title}
                  title={isCollapsed ? group.title : undefined}
                  aria-expanded={open}
                  aria-controls={`navigation-${basePath}-${group.id}`}
                  onClick={() => {
                    if (isCollapsed) onToggle?.();
                    toggle(group.id, isCollapsed);
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2",
                    isCollapsed && "justify-center",
                    upgrade
                      ? "text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800",
                    active && "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                  )}
                >
                  <span className="shrink-0" aria-hidden="true">
                    {ICONS[group.icon]}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className="min-w-0 flex-1 break-words">{group.title}</span>
                      <span
                        aria-hidden="true"
                        className={cn("shrink-0 transition-transform", open && "rotate-90")}
                      >
                        ›
                      </span>
                    </>
                  )}
                </button>
                <div
                  id={`navigation-${basePath}-${group.id}`}
                  hidden={!open}
                  className="ml-3 space-y-1 border-l border-slate-200 pl-2 dark:border-slate-700"
                >
                  {group.items.map((item) =>
                    item.href === "#" ? (
                      <span
                        key={item.label}
                        aria-disabled="true"
                        className="block px-2 py-2 text-sm text-slate-400"
                      >
                        {item.label}
                      </span>
                    ) : (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={activeHref === item.href ? "page" : undefined}
                        className={cn(
                          "flex min-h-10 items-center gap-2 rounded-md px-2 py-2 text-sm focus-visible:outline focus-visible:outline-2",
                          activeHref === item.href
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        )}
                      >
                        <span className="shrink-0" aria-hidden="true">
                          {item.icon && ICONS[item.icon]}
                        </span>
                        <span className="min-w-0 flex-1 break-words">{item.label}</span>
                        {item.badge && <span className="text-xs">{item.badge}</span>}
                      </Link>
                    )
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </nav>

      {/* Scanner Button - Prominent and separated */}
      {basePath === "admin" && (
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
          <Link
            href="/admin/scanner"
            aria-label="Escanear códigos"
            title={isCollapsed ? "Escanear códigos" : undefined}
            className={cn(
              "w-full flex items-center justify-center space-x-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-[1.02]",
              isCollapsed ? "px-3" : ""
            )}
          >
            <span className="flex-shrink-0">{ICONS.qr}</span>
            {!isCollapsed && (
              <div className="flex flex-col items-center">
                <span className="font-semibold text-sm">Escanear Códigos</span>
                <span className="text-xs opacity-90">Acceso rápido al scanner</span>
              </div>
            )}
          </Link>
        </div>
      )}

      {/* Footer with Logout */}
      <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className={cn(
            "w-full flex items-center space-x-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors",
            isCollapsed && "justify-center px-2",
            isLoggingOut && "opacity-50 cursor-not-allowed"
          )}
          aria-label="Cerrar sesión"
        >
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          {!isCollapsed && <span>{isLoggingOut ? "Saliendo..." : "Cerrar sesión"}</span>}
        </button>
      </div>
    </div>
  );
}
