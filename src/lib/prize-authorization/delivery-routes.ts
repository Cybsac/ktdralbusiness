// Only these final delivery handlers may authenticate a public request with a
// personal OTP. Administration pages and credential-management APIs stay private.
const deliveryPaths = [
  /^\/api\/admin\/reusable-tokens\/[^/]+\/deliver$/,
  /^\/api\/admin\/custom-qrs\/[^/]+\/redeem$/,
  /^\/api\/admin\/birthdays\/[^/]+\/courtesies$/,
  /^\/api\/admin\/offers\/validate-qr$/,
  /^\/api\/system\/mundial2026\/redeem$/,
];
export function isPrizeDeliveryPath(pathname: string) {
  return deliveryPaths.some((pattern) => pattern.test(pathname));
}
