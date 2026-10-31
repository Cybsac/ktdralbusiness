"use client";

export const PRIZE_AUTH_EVENT = "prize-authorization-request";
export type PrizeAuthorizationRequest = {
  submit: (_code: string) => Promise<Response>;
  resolve: (_response: Response) => void;
};
export async function prizeAuthorizedFetch(
  input: string,
  init: NonNullable<Parameters<typeof fetch>[1]> = {}
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status !== 428) return response;
  const error = await response
    .clone()
    .json()
    .catch(() => null);
  if (error?.code !== "PRIZE_OTP_REQUIRED") return response;
  return new Promise((resolve) => {
    const detail: PrizeAuthorizationRequest = {
      resolve,
      submit: async (code) => {
        const headers = new Headers(init.headers);
        headers.set("x-prize-otp", code);
        return fetch(input, { ...init, headers });
      },
    };
    window.dispatchEvent(new CustomEvent(PRIZE_AUTH_EVENT, { detail }));
  });
}
