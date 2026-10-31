import { NAVIGATION_CATEGORIES, type NavigationCategory } from "./categories";

export function NavigationCategoryDivider({
  category,
  collapsed = false,
  first = false,
}: {
  category: NavigationCategory;
  collapsed?: boolean;
  first?: boolean;
}) {
  return (
    <div
      className={`col-span-full px-2 ${first ? "pb-2" : "mt-4 border-t border-slate-200/70 pb-2 pt-4 dark:border-slate-700/60"}`}
    >
      <p
        className={
          collapsed
            ? "sr-only"
            : "text-[10px] font-medium uppercase tracking-widest text-slate-400 dark:text-slate-500"
        }
      >
        {NAVIGATION_CATEGORIES[category].label}
      </p>
    </div>
  );
}
