import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from '@/lib/auth';
import { businessDayWindowUtc, currentBusinessDay } from '@/lib/attendanceDay';
import { STATION_INVITATION_TTL_MS } from './contracts';

export async function stationUser(req: Request) {
  const session = await verifyUserSessionCookie(getUserSessionCookieFromRequest(req));
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, username: true, person: { select: { name: true, active: true } } } });
  return user?.person?.active ? { id: user.id, role: user.role, name: user.person?.name || user.username } : null;
}
export const hashInvitation = (token: string) => createHash('sha256').update(token).digest('hex');
export const createInvitation = () => ({ token: randomBytes(32).toString('base64url'), expiresAt: new Date(Date.now() + STATION_INVITATION_TTL_MS) });
export const stationExpiry = () => businessDayWindowUtc(currentBusinessDay()).endUtc;
