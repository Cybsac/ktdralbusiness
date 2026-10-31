import type { NavigationGroup, NavigationItem } from "./catalog";

function flatten(items: NavigationItem[]): NavigationItem[] {
  return items.flatMap((item) => (item.children?.length ? flatten(item.children) : [item]));
}
/** Longest segment boundary first, then explicit query parameters. One active destination. */
export function getActiveNavigationHref(groups: NavigationGroup[], pathname: string, search = "") {
  const current = new URLSearchParams(search);
  const path = pathname.replace(/\/$/, "") || "/";
  let active: string | null = null;
  let best = -1;
  for (const item of groups.flatMap((group) => flatten(group.items))) {
    if (item.href === "#") continue;
    const [hrefPath, query = ""] = item.href.split("#")[0].split("?");
    if (path !== hrefPath && !path.startsWith(`${hrefPath}/`)) continue;
    const required = new URLSearchParams(query);
    if ([...required].some(([name, value]) => current.get(name) !== value)) continue;
    const score = hrefPath.length * 100 + [...required].length;
    if (score > best) {
      best = score;
      active = item.href;
    }
  }
  return active;
}
