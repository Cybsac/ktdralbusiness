import { getPrizeOperator } from "@/lib/prize-authorization/service";
export async function invitationOperator(req: Request, write = false) {
  const operator = await getPrizeOperator(req);
  return operator &&
    (write
      ? ["ADMIN", "COORDINATOR", "STAFF"]
      : ["ADMIN", "COORDINATOR", "STAFF", "COLLAB"]
    ).includes(operator.role)
    ? operator
    : null;
}
