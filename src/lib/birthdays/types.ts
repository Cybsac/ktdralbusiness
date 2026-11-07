import type {
  BirthdayReservation,
  BirthdayPack,
  InviteToken,
  CourtesyItem,
  PhotoDeliverable,
} from "@prisma/client";
import type { BirthdayReservationSource } from "./attribution";
export type CreateReservationInput = {
  celebrantName: string;
  phone: string;
  documento: string;
  email?: string | null;
  birthDate?: string;
  date: Date;
  timeSlot: string;
  packId: string;
  guestsPlanned: number;
  wantsPhotoSession?: boolean;
  referrerId?: string;
  createdBy?: string;
  reservationSource?: BirthdayReservationSource;
  createdByUserId?: string;
  isAdmin?: boolean;
};

export type ListReservationFilters = {
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string; // match celebrantName | phone | documento
  packId?: string;
};

export type Pagination = {
  page?: number;
  pageSize?: number;
  sortBy?: "status" | "createdAt" | "date";
};

export type ReservationWithRelations = BirthdayReservation & {
  pack: BirthdayPack;
  inviteTokens: InviteToken[];
  courtesyItems: CourtesyItem[];
  photoDeliveries: PhotoDeliverable[];
  createdByUser?: { id: string; username: string; person: { name: string | null } | null } | null;
};

export type RedeemContext = { by?: string; device?: string; location?: string };
