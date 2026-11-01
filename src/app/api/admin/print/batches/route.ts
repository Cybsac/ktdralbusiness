import { readPrintBatches } from "@/lib/print/batches";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  return readPrintBatches(req);
}
