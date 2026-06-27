// src/infrastructure/http/routes/metas.routes.ts
//
// GET /v1/metas — "Dados de Metas" (somente ADMIN)
//
// Agrega, por unidade e período, os indicadores da tela de metas:
//   - reservas            : qtd de reservas no período
//   - envios              : qtd de mensagens WhatsApp (volume billing do engine, por WABA)
//   - gastoWhatsappUsd    : custo das mensagens (USD, Meta pricing_analytics)
//   - gastoWhatsappCents  : mesmo custo convertido p/ BRL em centavos (via FX do engine)
//   - faturamentoCents    : Σ zigBillingCents das reservas do período (billing Zig)
//   - ticketMedioCents    : faturamento / qtd de reservas faturadas
//   - canceladas + cancelamentoPct : status CANCELLED
//   - checkins            : status CHECKED_IN
//   - checkinsSemMesa     : CHECKED_IN sem mesa (tables vazio)
//
// Query params:
//   from       ISO date/datetime (obrigatório p/ filtrar; default = início do dia atual)
//   to         ISO date/datetime (default = agora)
//   unitId     filtra uma unidade específica (opcional)
//   dateField  'reservationDate' (default) | 'createdAt'
//
// Obs.: envios/gasto vêm do engine (proxy server-side); se o engine falhar, os
// indicadores de reserva ainda são retornados e `engineError` é preenchido.

import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../middlewares/requireAuth';
import {
  fetchEngineUsage,
  fetchUsdBrlDaily,
  dailyUsdToBrlCents,
  toEngineSlug,
  type EngineDailyUsage,
} from '../../../services/engineBilling.service';

export const metasRouter = Router();

type DateField = 'reservationDate' | 'createdAt';

function parseDate(value: unknown, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? fallback : d;
}

function startOfTodaySP(): Date {
  // início do dia atual (00:00) — usamos a hora local do servidor como aproximação
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

metasRouter.get('/', requireAuth, requireRole(['ADMIN']), async (req, res, next) => {
  try {
    const now = new Date();
    const from = parseDate(req.query.from, startOfTodaySP());
    const to = parseDate(req.query.to, now);
    const unitId = req.query.unitId ? String(req.query.unitId) : undefined;
    const dateField: DateField =
      req.query.dateField === 'createdAt' ? 'createdAt' : 'reservationDate';

    // ── filtro base de reservas ────────────────────────────────────────────────
    const baseWhere: any = { [dateField]: { gte: from, lte: to } };
    if (unitId) baseWhere.unitId = unitId;

    // unidades alvo
    const units = await prisma.unit.findMany({
      where: unitId ? { id: unitId } : { isActive: true },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });

    // ── agregações no banco (groupBy por unitId) ──────────────────────────────
    const [
      totalByUnit,
      cancelledByUnit,
      checkedInByUnit,
      semMesaByUnit,
      faturamentoByUnit,
    ] = await Promise.all([
      // total de reservas
      prisma.reservation.groupBy({
        by: ['unitId'],
        where: baseWhere,
        _count: { _all: true },
      }),
      // canceladas
      prisma.reservation.groupBy({
        by: ['unitId'],
        where: { ...baseWhere, status: 'CANCELLED' },
        _count: { _all: true },
      }),
      // check-ins
      prisma.reservation.groupBy({
        by: ['unitId'],
        where: { ...baseWhere, status: 'CHECKED_IN' },
        _count: { _all: true },
      }),
      // check-ins SEM mesa
      prisma.reservation.groupBy({
        by: ['unitId'],
        where: {
          ...baseWhere,
          status: 'CHECKED_IN',
          OR: [{ tables: null }, { tables: '' }],
        },
        _count: { _all: true },
      }),
      // faturamento (Σ zigBillingCents) + qtd faturadas + pessoas faturadas
      prisma.reservation.groupBy({
        by: ['unitId'],
        where: { ...baseWhere, zigBillingCents: { not: null } },
        _sum: { zigBillingCents: true, people: true },
        _count: { _all: true },
      }),
    ]);

    const idx = <T extends { unitId: string | null }>(rows: T[]) => {
      const m = new Map<string, T>();
      for (const r of rows) if (r.unitId) m.set(r.unitId, r);
      return m;
    };
    const totalMap = idx(totalByUnit);
    const cancelledMap = idx(cancelledByUnit);
    const checkedInMap = idx(checkedInByUnit);
    const semMesaMap = idx(semMesaByUnit);
    const fatMap = idx(faturamentoByUnit);

    // ── engine: envios + gasto por WABA (1 chamada cobrindo todas as unidades) ──
    const startSec = Math.floor(from.getTime() / 1000);
    const endSec = Math.floor(to.getTime() / 1000);
    type SlugUsage = { messages: number; costUsd: number; daily: EngineDailyUsage[] };
    const usageBySlug = new Map<string, SlugUsage>();
    let fxRate = 0; // cotação spot (fallback p/ dias sem série diária)
    let dailyFx = new Map<string, number>(); // cotação histórica por dia (dia do disparo)
    let engineError: string | null = null;
    try {
      const [usage, fxDaily] = await Promise.all([
        fetchEngineUsage(startSec, endSec),
        fetchUsdBrlDaily(startSec, endSec),
      ]);
      dailyFx = fxDaily;
      fxRate = usage.fx?.rate_usd_brl || 0;
      for (const w of usage.wabas) {
        const slug = (w.slug || '').toLowerCase();
        const prev = usageBySlug.get(slug) || { messages: 0, costUsd: 0, daily: [] };
        prev.messages += Number(w.total_messages) || 0;
        prev.costUsd += Number(w.total_cost) || 0;
        if (Array.isArray(w.daily)) prev.daily.push(...w.daily);
        usageBySlug.set(slug, prev);
      }
    } catch (e: any) {
      engineError = e?.message || 'Falha ao consultar o engine';
    }

    // ── monta linha por unidade ────────────────────────────────────────────────
    const unidades = units.map((u) => {
      const total = totalMap.get(u.id)?._count._all || 0;
      const canceladas = cancelledMap.get(u.id)?._count._all || 0;
      const checkins = checkedInMap.get(u.id)?._count._all || 0;
      const checkinsSemMesa = semMesaMap.get(u.id)?._count._all || 0;

      const fatRow = fatMap.get(u.id);
      const faturamentoCents = fatRow?._sum.zigBillingCents || 0;
      const faturadas = fatRow?._count._all || 0;
      const pessoasFaturadas = fatRow?._sum.people || 0;
      const ticketMedioCents = faturadas > 0 ? Math.round(faturamentoCents / faturadas) : 0;
      const ticketPorPessoaCents =
        pessoasFaturadas > 0 ? Math.round(faturamentoCents / pessoasFaturadas) : 0;

      const eng = usageBySlug.get(toEngineSlug(u.slug, u.name));
      const envios = eng?.messages ?? null;
      const gastoWhatsappUsd = eng ? Number(eng.costUsd.toFixed(4)) : null;
      // Converte USD→BRL pela cotação do dia de cada disparo (carry-back em dias
      // sem pregão); se a WABA não tiver série diária, usa a cotação spot.
      const gastoWhatsappCents = eng
        ? dailyUsdToBrlCents(eng.daily, dailyFx, fxRate) ??
          (fxRate > 0 ? Math.round(eng.costUsd * fxRate * 100) : null)
        : null;

      return {
        unitId: u.id,
        unitName: u.name,
        unitSlug: u.slug,
        reservas: total,
        envios,
        gastoWhatsappUsd,
        gastoWhatsappCents,
        faturamentoCents,
        faturadas,
        ticketMedioCents,
        ticketPorPessoaCents,
        canceladas,
        cancelamentoPct: total > 0 ? Number(((canceladas / total) * 100).toFixed(1)) : 0,
        checkins,
        checkinsSemMesa,
      };
    });

    // ── totais ────────────────────────────────────────────────────────────────
    const sum = (k: keyof (typeof unidades)[number]) =>
      unidades.reduce((acc, u) => acc + (Number(u[k]) || 0), 0);
    const totReservas = sum('reservas');
    const totFaturadas = sum('faturadas');
    const totFaturamento = sum('faturamentoCents');
    const totCanceladas = sum('canceladas');

    const totals = {
      reservas: totReservas,
      envios: unidades.some((u) => u.envios != null)
        ? unidades.reduce((a, u) => a + (u.envios || 0), 0)
        : null,
      gastoWhatsappCents: unidades.some((u) => u.gastoWhatsappCents != null)
        ? unidades.reduce((a, u) => a + (u.gastoWhatsappCents || 0), 0)
        : null,
      gastoWhatsappUsd: unidades.some((u) => u.gastoWhatsappUsd != null)
        ? Number(unidades.reduce((a, u) => a + (u.gastoWhatsappUsd || 0), 0).toFixed(4))
        : null,
      faturamentoCents: totFaturamento,
      faturadas: totFaturadas,
      ticketMedioCents: totFaturadas > 0 ? Math.round(totFaturamento / totFaturadas) : 0,
      canceladas: totCanceladas,
      cancelamentoPct:
        totReservas > 0 ? Number(((totCanceladas / totReservas) * 100).toFixed(1)) : 0,
      checkins: sum('checkins'),
      checkinsSemMesa: sum('checkinsSemMesa'),
    };

    // só é "histórico" se houve série diária (do engine) E cotação por dia (AwesomeAPI)
    const fxHistorical =
      dailyFx.size > 0 && [...usageBySlug.values()].some((u) => u.daily.length > 0);

    res.json({
      period: { from: from.toISOString(), to: to.toISOString(), dateField },
      fxRate: fxRate || null,
      fxHistorical,
      engineError,
      unidades,
      totals,
    });
  } catch (err) {
    next(err);
  }
});
