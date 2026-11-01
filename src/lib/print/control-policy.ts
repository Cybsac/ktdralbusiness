export const PRINT_CONTROL_POLICY = {
  recentBatches: 10,
  maxTemplateBytes: 10 * 1024 * 1024,
  imageTypes: ["image/png", "image/jpeg", "image/webp"],
  downloadReleaseMs: 60_000,
} as const;
export type PrintBatchKind = "roulette" | "static";
export interface PrintBatchSummary {
  id: string;
  description: string | null;
  createdAt: string;
  total: number;
  printable: number;
}
