/** Access to the collaborator QR list. Area names are normalized only for case and spacing. */
export function canAccessReusableTokens(role: string | null | undefined, area: string | null | undefined): boolean {
  if (role === 'ADMIN' || role === 'COORDINATOR') return true;
  return role === 'STAFF' && ['ANIMACIÓN', 'MULTIMEDIA'].includes((area || '').trim().toLocaleUpperCase('es-PE'));
}
