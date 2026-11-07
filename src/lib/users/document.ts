export const DOCUMENT_TYPES = ["DNI", "CE", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_TYPE_CHOICES = [
  { id: "DNI", name: "DNI peruano" },
  { id: "CE", name: "Carnet de extranjería" },
  { id: "OTHER", name: "Otro documento" },
] as const;
export const DOCUMENT_SEX_CODE_CHOICES = [
  { id: "1", name: "Código 1" },
  { id: "2", name: "Código 2" },
] as const;
export function normalizeDocumentNumber(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/[\s-]/g, "")
    .toUpperCase();
}
export function isValidDocumentNumber(value: string, type: string | null | undefined) {
  return type === "DNI" ? /^\d{8}$/.test(value) : /^[A-Z0-9]{3,30}$/.test(value);
}
