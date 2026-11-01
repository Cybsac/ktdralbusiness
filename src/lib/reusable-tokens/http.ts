import { apiError } from "@/lib/apiError";
export class ReusableTokenError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409
  ) {
    super(message);
  }
}
export function reusableFailure(error: unknown) {
  if (error instanceof ReusableTokenError)
    return apiError(error.code, error.message, undefined, error.status);
  console.error("Reusable token operation failed", error);
  return apiError("REUSABLE_OPERATION_FAILED", "No se pudo completar la operación", undefined, 500);
}
