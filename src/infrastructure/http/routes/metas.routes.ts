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
  fetchEngineCampaigns,
  aggregateContextSends,
  type EngineDailyUsage,
  type ContextSends,
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
    type SlugUsage = {
      messages: number;
      costUsd: number;
      daily: EngineDailyUsage[];
      // breakdown por categoria — base do preço unitário (confirmação=UTILITY, aniversário/reforço=MARKETING)
      utilityCostUsd: number;
      utilityVolume: number;
      marketingCostUsd: number;
      marketingVolume: number;
    };
    const newSlugUsage = (): SlugUsage => ({
      messages: 0, costUsd: 0, daily: [],
      utilityCostUsd: 0, utilityVolume: 0, marketingCostUsd: 0, marketingVolume: 0,
    });
    const usageBySlug = new Map<string, SlugUsage>();
    let fxRate = 0; // cotação spot (fallback p/ dias sem série diária)
    let dailyFx = new Map<string, number>(); // cotação histórica por dia (dia do disparo)
    let contextBySlug = new Map<string, ContextSends>(); // envios aniversário/reforço (campanha)
    let engineError: string | null = null;
    try {
      const [usage, fxDaily, campaigns] = await Promise.all([
        fetchEngineUsage(startSec, endSec),
        fetchUsdBrlDaily(startSec, endSec),
        fetchEngineCampaigns().catch(() => []),
      ]);
      dailyFx = fxDaily;
      fxRate = usage.fx?.rate_usd_brl || 0;
      contextBySlug = aggregateContextSends(campaigns, from.getTime(), to.getTime());
      for (const w of usage.wabas) {
        const slug = (w.slug || '').toLowerCase();
        const prev = usageBySlug.get(slug) || newSlugUsage();
        prev.messages += Number(w.total_messages) || 0;
        prev.costUsd += Number(w.total_cost) || 0;
        if (Array.isArray(w.daily)) prev.daily.push(...w.daily);
        const util = w.breakdown?.UTILITY;
        const mkt = w.breakdown?.MARKETING;
        if (util) { prev.utilityCostUsd += Number(util.cost) || 0; prev.utilityVolume += Number(util.volume) || 0; }
        if (mkt) { prev.marketingCostUsd += Number(mkt.cost) || 0; prev.marketingVolume += Number(mkt.volume) || 0; }
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

      const engSlug = toEngineSlug(u.slug, u.name);
      const eng = usageBySlug.get(engSlug);
      const envios = eng?.messages ?? null;
      const gastoWhatsappUsd = eng ? Number(eng.costUsd.toFixed(4)) : null;
      // Converte USD→BRL pela cotação do dia de cada disparo (carry-back em dias
      // sem pregão); se a WABA não tiver série diária, usa a cotação spot.
      const gastoWhatsappCents = eng
        ? dailyUsdToBrlCents(eng.daily, dailyFx, fxRate) ??
          (fxRate > 0 ? Math.round(eng.costUsd * fxRate * 100) : null)
        : null;

      // ── Gasto de "contexto de reserva" (estimativa) ───────────────────────────
      // Confirmação (UTILITY, transacional) ≈ 1 por reserva criada.
      // Aniversário + Reforço (MARKETING, campanha) = envios exatos do engine.
      // Custo = envios × preço unitário da categoria (cost/volume do billing).
      // Custo = fração dos envios do grupo dentro da categoria × custo da categoria
      // (teto de 100% — o gasto de contexto nunca ultrapassa o custo real da categoria).
      const ctx = contextBySlug.get(engSlug) || { aniversario: 0, reforco: 0 };
      const confirmacaoEnvios = total; // estimativa: 1 confirmação por reserva
      const anivReforcoEnvios = ctx.aniversario + ctx.reforco;
      const confirmUsd =
        eng && eng.utilityVolume > 0
          ? Math.min(confirmacaoEnvios / eng.utilityVolume, 1) * eng.utilityCostUsd
          : 0;
      const anivReforcoUsd =
        eng && eng.marketingVolume > 0
          ? Math.min(anivReforcoEnvios / eng.marketingVolume, 1) * eng.marketingCostUsd
          : 0;
      const ctxUsd = confirmUsd + anivReforcoUsd;
      // BRL do contexto = fração do custo total (ctxUsd/costUsd) aplicada ao gasto
      // total já convertido — mesmo câmbio do WA e garante contexto ≤ total.
      const reservaContextoGastoCents =
        eng && eng.costUsd > 0 && gastoWhatsappCents != null
          ? Math.round((ctxUsd / eng.costUsd) * gastoWhatsappCents)
          : eng && fxRate > 0
          ? Math.round(ctxUsd * fxRate * 100)
          : null;
      const reservaContexto = {
        confirmacaoEnvios,
        aniversarioEnvios: ctx.aniversario,
        reforcoEnvios: ctx.reforco,
        envios: confirmacaoEnvios + ctx.aniversario + ctx.reforco,
        gastoEstimadoCents: reservaContextoGastoCents,
      };

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
        reservaContexto,
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
      reservaContexto: {
        confirmacaoEnvios: unidades.reduce((a, u) => a + u.reservaContexto.confirmacaoEnvios, 0),
        aniversarioEnvios: unidades.reduce((a, u) => a + u.reservaContexto.aniversarioEnvios, 0),
        reforcoEnvios: unidades.reduce((a, u) => a + u.reservaContexto.reforcoEnvios, 0),
        envios: unidades.reduce((a, u) => a + u.reservaContexto.envios, 0),
        gastoEstimadoCents: unidades.some((u) => u.reservaContexto.gastoEstimadoCents != null)
          ? unidades.reduce((a, u) => a + (u.reservaContexto.gastoEstimadoCents || 0), 0)
          : null,
      },
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
