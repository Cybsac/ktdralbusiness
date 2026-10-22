import { AppAccessStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const APP_ACCESS_SCOPE = 'default';

export const APP_ACCESS_DEFAULTS = {
  publicTitle: 'Servicio temporalmente suspendido',
  publicMessage: 'El servicio no está disponible temporalmente. Estamos trabajando para restablecerlo.',
} as const;

export type AppAccessState = {
  scopeKey: string;
  status: AppAccessStatus;
  publicTitle: string;
  publicMessage: string;
  supportContact: string | null;
  resumeAt: string | null;
  updatedBy: string | null;
  updatedAt: string;
};

export function isAppAccessBlocked(status: AppAccessStatus | string): boolean {
  return status === AppAccessStatus.SUSPENDED || status === AppAccessStatus.MAINTENANCE;
}

function serializeState(record: {
  scopeKey: string;
  status: AppAccessStatus;
  publicTitle: string;
  publicMessage: string;
  supportContact: string | null;
  resumeAt: Date | null;
  updatedBy: string | null;
  updatedAt: Date;
}): AppAccessState {
  return {
    scopeKey: record.scopeKey,
    status: record.status,
    publicTitle: record.publicTitle,
    publicMessage: record.publicMessage,
    supportContact: record.supportContact,
    resumeAt: record.resumeAt?.toISOString() ?? null,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function getAppAccessState(): Promise<AppAccessState> {
  const record = await prisma.appAccessControl.upsert({
    where: { scopeKey: APP_ACCESS_SCOPE },
    update: {},
    create: {
      scopeKey: APP_ACCESS_SCOPE,
      publicTitle: APP_ACCESS_DEFAULTS.publicTitle,
      publicMessage: APP_ACCESS_DEFAULTS.publicMessage,
    },
  });

  return serializeState(record);
}

export type UpdateAppAccessInput = {
  status: AppAccessStatus;
  publicTitle: string;
  publicMessage: string;
  supportContact: string | null;
  resumeAt: Date | null;
  updatedBy: string | null;
};

export async function updateAppAccessState(input: UpdateAppAccessInput): Promise<AppAccessState> {
  const record = await prisma.appAccessControl.upsert({
    where: { scopeKey: APP_ACCESS_SCOPE },
    update: input,
    create: { scopeKey: APP_ACCESS_SCOPE, ...input },
  });

  return serializeState(record);
}
