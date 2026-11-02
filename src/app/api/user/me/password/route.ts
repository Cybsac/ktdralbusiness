// Compatibility endpoint: both password-change screens use the same validation,
// audit and session renewal.
import { POST } from '@/app/api/user/auth/change-password/route';

export const dynamic = 'force-dynamic';
export async function PATCH(request: Request) {
  return POST(request);
}
