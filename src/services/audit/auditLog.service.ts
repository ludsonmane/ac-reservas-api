// src/services/audit/auditLog.service.ts
import { prisma } from '../../infrastructure/db/prisma';

export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'CHECKIN' 
  | 'NO_SHOW' 
  | 'QR_RENEW'
  | 'LOGIN'
  | 'LOGOUT';

export type AuditEntity = 
  | 'Reservation' 
  | 'Unit' 
  | 'Area' 
  | 'User' 
  | 'Block'
  | 'Guest';

export interface AuditLogInput {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  oldData?: any;
  newData?: any;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Registra uma ação no audit log
 */
export async function logAction(input: AuditLogInput) {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        userEmail: input.userEmail ?? null,
        oldData: input.oldData ?? undefined,
        newData: input.newData ?? undefined,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch (err) {
    // Não falha a operação principal se o log falhar
    console.error('[AuditLog] Erro ao registrar log:', err);
  }
}

/**
 * Helper para extrair info do request
 */
export function extractRequestInfo(req: any) {
  return {
    userId: req.user?.id ?? null,
    userName: req.user?.name ?? null,
    userEmail: req.user?.email ?? null,
    ip: req.ip || req.headers?.['x-forwarded-for'] || req.connection?.remoteAddress || null,
    userAgent: req.headers?.['user-agent'] || null,
  };
}

/**
 * Função helper para logar ação a partir de um request Express
 */
export async function logFromRequest(
  req: any,
  action: AuditAction,
  entity: AuditEntity,
  entityId?: string | null,
  oldData?: any,
  newData?: any
) {
  const info = extractRequestInfo(req);
  await logAction({
    action,
    entity,
    entityId,
    oldData,
    newData,
    ...info,
  });
}

export const auditService = {
  logAction,
  logFromRequest,
  extractRequestInfo,
};
