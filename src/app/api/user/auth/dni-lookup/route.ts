import { employeeDniLookup } from "@/lib/cluzter/employee-lookup";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Public self-registration lookup, explicitly enabled without phone OTP. */
export async function POST(req: Request) {
  const address =
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  return employeeDniLookup(req, address, true);
}
