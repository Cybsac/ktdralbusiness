"use client";
import { BatchPrintControl } from "@/components/admin/print/BatchPrintControl";
export function PrintControlClient() {
  return <BatchPrintControl kind="roulette" backHref="/admin/roulettebatches" />;
}
