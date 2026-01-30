// src/infrastructure/http/routes/audit.routes.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../middlewares/requireAuth';

export const auditRouter = Router();

/**
 * GET /v1/audit
 * Lista logs de auditoria com filtros e paginação
 * Apenas ADMIN pode ver
 */
auditRouter.get(
  '/',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res, next) => {
    try {
      const {
        page = '1',
        pageSize = '50',
        action,
        entity,
        entityId,
        userId,
        startDate,
        endDate,
        search,
      } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const size = Math.min(100, Math.max(1, parseInt(String(pageSize), 10) || 50));
      const skip = (pageNum - 1) * size;

      // Monta filtros
      const where: any = {};

      if (action) {
        where.action = String(action);
      }

      if (entity) {
        where.entity = String(entity);
      }

      if (entityId) {
        where.entityId = String(entityId);
      }

      if (userId) {
        where.userId = String(userId);
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(String(startDate));
        }
        if (endDate) {
          where.createdAt.lte = new Date(String(endDate));
        }
      }

      if (search) {
        const s = String(search);
        where.OR = [
          { userName: { contains: s } },
          { userEmail: { contains: s } },
          { entityId: { contains: s } },
        ];
      }

      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: size,
        }),
        prisma.auditLog.count({ where }),
      ]);

      res.json({
        items,
        total,
        page: pageNum,
        pageSize: size,
        totalPages: Math.ceil(total / size),
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /v1/audit/:id
 * Retorna um log específico
 */
auditRouter.get(
  '/:id',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const log = await prisma.auditLog.findUnique({ where: { id } });
      
      if (!log) {
        return res.status(404).json({ error: 'Log não encontrado.' });
      }

      res.json(log);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /v1/audit/entity/:entity/:entityId
 * Retorna histórico de um registro específico
 */
auditRouter.get(
  '/entity/:entity/:entityId',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res, next) => {
    try {
      const { entity, entityId } = req.params;

      const logs = await prisma.auditLog.findMany({
        where: { entity, entityId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      res.json(logs);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /v1/audit/stats
 * Estatísticas dos logs
 */
auditRouter.get(
  '/stats/summary',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res, next) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalLogs, todayLogs, byAction, byEntity] = await Promise.all([
        prisma.auditLog.count(),
        prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
        prisma.auditLog.groupBy({
          by: ['action'],
          _count: { action: true },
          orderBy: { _count: { action: 'desc' } },
          take: 10,
        }),
        prisma.auditLog.groupBy({
          by: ['entity'],
          _count: { entity: true },
          orderBy: { _count: { entity: 'desc' } },
        }),
      ]);

      res.json({
        totalLogs,
        todayLogs,
        byAction: byAction.map((a) => ({ action: a.action, count: a._count.action })),
        byEntity: byEntity.map((e) => ({ entity: e.entity, count: e._count.entity })),
      });
    } catch (err) {
      next(err);
    }
  }
);
