import catalog from "./catalog.json";

type System = "inei" | "reniec";
type Place = { department: string; province: string; district: string };
const indexes: Record<System, Map<string, Place[]>> = { inei: new Map(), reniec: new Map() };

for (const [inei, reniec, department, province, district] of catalog) {
  const place = { department, province, district };
  for (const [system, code] of [["inei", inei], ["reniec", reniec]] as const) {
    if (!/^\d{6}$/.test(code)) continue;
    const entries = indexes[system].get(code) || [];
    entries.push(place);
    indexes[system].set(code, entries);
  }
}

const samePlace = (a: Place, b: Place) => a.department === b.department && a.province === b.province && a.district === b.district;
function uniquePlace(system: System, code: string): Place | null {
  const places = indexes[system].get(code) || [];
  return places.length && places.every((place) => samePlace(place, places[0])) ? places[0] : null;
}

/** Resolve only unambiguous codes; the provider's code system must be confirmed before configuration. */
export function resolveBirthplace(code: string | null, system?: string): Place | null {
  if (!code || !/^\d{6}$/.test(code)) return null;
  if (system === "inei" || system === "reniec") return uniquePlace(system, code);
  const inei = uniquePlace("inei", code);
  const reniec = uniquePlace("reniec", code);
  return inei && reniec && samePlace(inei, reniec) ? inei : null;
}
