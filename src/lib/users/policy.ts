import { ALLOWED_AREAS } from "@/lib/areas";
function positive(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}
export const USER_ROLES = ["COLLAB", "STAFF", "COORDINATOR", "ADMIN"] as const;
export type ManagedRole = (typeof USER_ROLES)[number];
export const USER_POLICY = {
  passwordMin: 8,
  passwordMax: 72,
  bcryptRounds: positive(process.env.USER_PASSWORD_HASH_ROUNDS, 10),
  recoveryCodeLength: 6,
  recoveryLifetimeMs: positive(process.env.USER_RECOVERY_LIFETIME_MS, 10 * 60 * 1000),
  temporaryPasswordBytes: 18,
  maxPageSize: 100,
  defaultPageSize: 25,
  maxBackupBytes: positive(process.env.USER_BACKUP_MAX_BYTES, 5 * 1024 * 1024),
  maxBackupRows: positive(process.env.USER_BACKUP_MAX_ROWS, 1000),
  transactionTimeoutMs: positive(process.env.USER_TRANSACTION_TIMEOUT_MS, 120000),
} as const;
export const ROLE_CHOICES = USER_ROLES.map((id) => ({
  id,
  name: { COLLAB: "Colaborador", STAFF: "Staff", COORDINATOR: "Coordinador", ADMIN: "Admin" }[id],
}));
export const AREA_CHOICES = ALLOWED_AREAS.map((id) => ({ id, name: id }));
export function canManageTarget(
  actor: { userId: string; role: string },
  target: { id: string; role: string }
) {
  return (
    actor.role === "ADMIN" ||
    (actor.role === "COORDINATOR" &&
      (target.role === "STAFF" || target.role === "COLLAB" || actor.userId === target.id)) ||
    (actor.role === "STAFF" && target.role === "COLLAB")
  );
}
export const assignableRoles = (role: string) =>
  ROLE_CHOICES.filter((choice) => role === "ADMIN" || ["STAFF", "COLLAB"].includes(choice.id));
