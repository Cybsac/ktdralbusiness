import type { GameCalendar } from "./calendar";
export interface AdminPrize {
  id: string;
  key: string;
  label: string;
  color: string | null;
  stock: number | null;
  active: boolean;
  gameEnabled: boolean;
  isReusable: boolean;
  hasTokens: boolean;
}
export interface AdminBatch {
  id: string;
  name: string;
  createdAt: string;
  validFrom: string | null;
  expiresAt: string | null;
  tokenCount: number;
}
export interface PrizeAdminData {
  calendar: GameCalendar;
  prizes: AdminPrize[];
  batches: AdminBatch[];
}
