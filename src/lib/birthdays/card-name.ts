/** The invitation card shows the first part of the celebrant's registered name. */
export function birthdayCardName(name: string): string {
  return name.trim().split(/\s+/)[0] || "";
}
