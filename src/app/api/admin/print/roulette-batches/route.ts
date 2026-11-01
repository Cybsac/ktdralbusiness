import { readPrintBatches } from "@/lib/print/batches";
export const dynamic = "force-dynamic";
// Keep existing consumers compatible while both panels use the shared endpoint.
export function GET(req: Request) {
  return readPrintBatches(req, "roulette");
}
