// Si Math AI — L1 ads request builders.
//
// PURE, exactly like meta-publish.core.ts: these functions return WriteRequest
// objects and can no more contact Meta than a string constant can.
//
// Specification: docs/engineering/meta-marketing-integration.md §6, §10.1.
//
// =====================================================================
// TWO PROPERTIES EVERY BUILDER HERE ENFORCES
// =====================================================================
// 1. STATUS IS ALWAYS 'PAUSED'. It is not a parameter. Going live is a
//    separate, deliberate call the owner makes in Ads Manager or through a
//    future explicit action — never a field on a creation request, because a
//    field is one typo away from spending money.
//
// 2. VALIDATE-ONLY IS THE DEFAULT. execution_options: ['validate_only'] asks
//    Meta to check the payload and create NOTHING. A builder that creates for
//    real requires passing validateOnly: false, which is an act of intent
//    rather than an omission.
//
// Neither property is checked only here: tests/meta-isolation.test.mjs asserts
// both against the real shipped bytes, and refuses a PAUSED default that has
// been softened to a parameter.
// =====================================================================

import type { WriteRequest } from './meta-graph.core.ts';
import { BuildError } from './meta-publish.core.ts';

/** Objectives this project has reason to use. A closed list, because a
 *  mistyped objective is a rejected ad set discovered late, and because an
 *  objective nobody chose deliberately should not be reachable. */
export const ALLOWED_OBJECTIVES = [
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_LEADS',
  'OUTCOME_AWARENESS',
] as const;

export type AdObjective = typeof ALLOWED_OBJECTIVES[number];

/** Normalise `act_` prefixing so both spellings reach the same path. */
export function normalizeAdAccount(id: string): string {
  const t = (id || '').trim();
  if (!t) throw new BuildError('adAccountId is required');
  return t.startsWith('act_') ? t : `act_${t}`;
}

/**
 * Build a campaign creation request.
 *
 * `validateOnly` defaults to TRUE: Meta validates the payload and persists
 * nothing, which is the only ads write L1 is permitted to make.
 */
export function buildCampaign(args: {
  adAccountId: string;
  name: string;
  objective: AdObjective;
  /** Account minor units per day. Checked against the configured hard ceiling. */
  dailyBudget?: number;
  /** The hard ceiling from META_ADS_MAX_DAILY_BUDGET. 0 means unset, and an
   *  unset ceiling refuses EVERY budget — a spend limit nobody configured is
   *  not a licence to spend without one. */
  maxDailyBudget: number;
  validateOnly?: boolean;
}): WriteRequest {
  const account = normalizeAdAccount(args.adAccountId);
  if (!args.name || !args.name.trim()) throw new BuildError('campaign name is required');
  if (!(ALLOWED_OBJECTIVES as readonly string[]).includes(args.objective)) {
    throw new BuildError(
      `objective '${args.objective}' is not in the allowed list: ${ALLOWED_OBJECTIVES.join(', ')}`);
  }

  if (args.dailyBudget !== undefined) {
    if (!Number.isInteger(args.dailyBudget) || args.dailyBudget <= 0) {
      throw new BuildError('dailyBudget must be a positive integer in account minor units');
    }
    if (!args.maxDailyBudget) {
      throw new BuildError(
        'META_ADS_MAX_DAILY_BUDGET is not set. A daily budget cannot be requested until a ' +
        'hard ceiling exists — refusing rather than defaulting to unlimited.');
    }
    if (args.dailyBudget > args.maxDailyBudget) {
      throw new BuildError(
        `dailyBudget ${args.dailyBudget} exceeds META_ADS_MAX_DAILY_BUDGET ${args.maxDailyBudget}`);
    }
  }

  const validateOnly = args.validateOnly !== false;

  return {
    method: 'POST',
    path: `${account}/campaigns`,
    body: {
      name: args.name,
      objective: args.objective,
      // NOT a parameter. See the header.
      status: 'PAUSED',
      // Meta REQUIRES this field; omitting it is a rejection, not a default.
      // Exam preparation is not a special category, so the empty list is the
      // correct declaration rather than a placeholder.
      special_ad_categories: [],
      ...(args.dailyBudget !== undefined ? { daily_budget: args.dailyBudget } : {}),
      ...(validateOnly ? { execution_options: ['validate_only'] } : {}),
    },
    capability: 'ads',
    summary: `${validateOnly ? 'VALIDATE-ONLY' : 'CREATE'} campaign '${args.name}' ` +
      `(${args.objective}, PAUSED) on ${account}`,
  };
}

/** Normalise an ad account id for comparison.
 *
 *  Coerced and trimmed before the act_ prefix is applied, because `id` is only
 *  ANNOTATED as a string — Graph is not obliged to honour that, and a numeric
 *  id compared strictly against a string is a comparison that silently fails
 *  while both values are identical. That exact bug already cost this project
 *  one false diagnosis on the System User check; a repeat here would silently
 *  disarm a guard protecting a live ad account. */
export function normalizeAccountId(v: unknown): string {
  if (v === null || v === undefined) return '';
  const t = String(v).trim();
  if (!t) return '';
  return t.startsWith('act_') ? t : `act_${t}`;
}

/** True when `target` is one of the ad accounts the Business Portfolio owns or
 *  is a client of — which makes it a LIVE account, whatever any environment
 *  variable says about which account is "the live one".
 *
 *  A sandbox account is created under the App and is not owned by the
 *  business, so this separates the two without relying on configuration that
 *  has already proven ambiguous.
 *
 *  Pure, so the guard it implements is unit-testable without a network and
 *  cannot be silently neutered: an earlier version lived inline in the runner
 *  and could be disabled with `if (false && ...)` while every check stayed
 *  green. */
export function isBusinessOwned(target: unknown, accounts: readonly unknown[]): boolean {
  const t = normalizeAccountId(target);
  if (!t) return false;
  for (const a of accounts) {
    const id = a && typeof a === 'object' ? (a as { id?: unknown }).id : a;
    if (normalizeAccountId(id) === t) return true;
  }
  return false;
}

/** Read-side helper: the insights query string. Returned as params for
 *  client.get(), NOT as a WriteRequest — reading performance is not a write
 *  and must not travel through the write path. */
export function insightsParams(args: {
  datePreset?: string; level?: 'account' | 'campaign' | 'adset' | 'ad';
} = {}): Record<string, string> {
  return {
    fields: 'impressions,clicks,spend,ctr,cpc,cpm',
    date_preset: args.datePreset ?? 'last_30d',
    level: args.level ?? 'account',
  };
}
