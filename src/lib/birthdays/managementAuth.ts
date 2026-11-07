import { getPrizeOperator } from "@/lib/prize-authorization/service";
/** Read/edit permissions stay shared with the collaborator portal; account activity is checked. */
export const birthdayManager = (req: Request) => getPrizeOperator(req);
export async function birthdayAdministrator(req: Request) {
  const user = await birthdayManager(req);
  return user && ["ADMIN", "COORDINATOR", "STAFF"].includes(user.role) ? user : null;
}

/** Catalog configuration is restricted independently from reservation operations. */
export async function birthdayPackAdministrator(req: Request) {
  const user = await birthdayManager(req);
  return user?.role === "ADMIN" ? user : null;
}
