/**
 * PortalJob & HaSociaJob — Pure-TypeScript Deterministic Scoring Engine
 *
 * Covers all 4 real thematic modules:
 *  - Logistics (FEFO Picking + PPE Safety + SLA)
 *  - Administration (Operational Reporting + Digital Skills + Data Protection)
 *  - Sales (Needs Discovery + Objection Handling + Commercial Ethics)
 *  - HaSociaJob (Communication, Leadership, Problem Solving, Adaptability)
 */

import type {
  ActionEvent,
  AdministrationRubric,
  DeterministicEvaluation,
  HasociajobRubric,
  LogisticsRubric,
  RuleViolation,
  SalesRubric,
  ScenarioRubric,
  SessionStatus,
} from "./types.ts";

export const SIMULATION_ENGINE_VERSION = "1.1.0";

const ALLOWED_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  in_progress: ["in_progress", "paused", "submitted", "abandoned", "expired"],
  paused: ["in_progress", "submitted", "abandoned", "expired"],
  submitted: ["evaluated"],
  evaluated: [],
  abandoned: [],
  expired: [],
};

/** Validates whether a session lifecycle transition is permitted by backend invariants. */
export function canTransitionSessionStatus(from: SessionStatus, to: SessionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Deterministic 64-bit FNV-1a canonical digest binding inputs to outputs. */
export function computeCanonicalInputHash(rubric: ScenarioRubric, events: readonly ActionEvent[]): string {
  const canonical = JSON.stringify({
    engineVersion: SIMULATION_ENGINE_VERSION,
    rubric,
    events: [...events].sort((a, b) => a.sequenceNum - b.sequenceNum),
  });

  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;

  for (let i = 0; i < canonical.length; i++) {
    hash ^= BigInt(canonical.charCodeAt(i));
    hash = (hash * prime) & mask;
  }

  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function computeSlaCompliance(elapsedSeconds: number, targetSlaSeconds: number): number {
  if (elapsedSeconds <= targetSlaSeconds) return 100;
  const maxAllowed = targetSlaSeconds * 2;
  if (elapsedSeconds >= maxAllowed) return 0;
  const ratioOver = (elapsedSeconds - targetSlaSeconds) / targetSlaSeconds;
  return roundTwo(clamp((1 - ratioOver) * 100, 0, 100));
}

function validateChronologyAndAntiTamper(
  events: readonly ActionEvent[],
  elapsedSeconds: number,
  minPlausibleSeconds: number
): void {
  if (events.length === 0) {
    throw new Error("Anti-tamper: cannot evaluate an empty event log");
  }
  if (elapsedSeconds < minPlausibleSeconds) {
    throw new Error(
      `Anti-tamper: elapsedSeconds (${elapsedSeconds}s) is below plausible minimum (${minPlausibleSeconds}s)`
    );
  }
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (prev && curr && curr.sequenceNum <= prev.sequenceNum) {
      throw new Error("Integrity error: session events must have strictly increasing sequenceNum");
    }
  }
}

function evaluateLogistics(
  rubric: LogisticsRubric,
  events: readonly ActionEvent[],
  elapsedSeconds: number
): Omit<DeterministicEvaluation, "engineVersion" | "inputHash"> {
  const violations: RuleViolation[] = [];
  const equippedSafety = new Set<string>();
  const pickedCounts = new Map<string, number>();

  for (const evt of events) {
    if (evt.eventType === "SAFETY_PPE_EQUIPPED" && typeof evt.payload.item === "string") {
      equippedSafety.add(evt.payload.item);
    }

    if (evt.eventType === "ITEM_PICKED") {
      const sku = typeof evt.payload.sku === "string" ? evt.payload.sku : "";
      const batch = typeof evt.payload.batch === "string" ? evt.payload.batch : "";
      const qty = typeof evt.payload.qty === "number" ? evt.payload.qty : 1;

      const expected = rubric.expectedItems.find((item) => item.sku === sku);
      if (expected) {
        if (batch !== expected.expectedBatch) {
          violations.push({
            code: "WRONG_FEFO_BATCH",
            severity: "warning",
            penaltyPoints: rubric.penalties.wrongBatchRotation,
            message: `Lote incorrecto para ${sku}: recibido '${batch}', esperado '${expected.expectedBatch}'.`,
            occurredAt: evt.occurredAt,
          });
        } else {
          pickedCounts.set(sku, (pickedCounts.get(sku) ?? 0) + qty);
        }
      }
    }
  }

  let matchedSafety = 0;
  for (const reqCheck of rubric.requiredSafetyChecks) {
    if (equippedSafety.has(reqCheck)) {
      matchedSafety += 1;
    } else {
      violations.push({
        code: `MISSING_${reqCheck.toUpperCase()}`,
        severity: "critical",
        penaltyPoints: rubric.penalties.missingPpe,
        message: `Protocolo de seguridad laboral incompleto: falta '${reqCheck}'.`,
        occurredAt: events[0]?.occurredAt ?? new Date(0).toISOString(),
      });
    }
  }

  const totalRequiredQty = rubric.expectedItems.reduce((sum, item) => sum + item.requiredQty, 0);
  const totalCorrectQty = rubric.expectedItems.reduce((sum, item) => {
    return sum + Math.min(pickedCounts.get(item.sku) ?? 0, item.requiredQty);
  }, 0);

  const accuracyPct = totalRequiredQty > 0 ? roundTwo((totalCorrectQty / totalRequiredQty) * 100) : 100;
  const slaCompliancePct = computeSlaCompliance(elapsedSeconds, rubric.targetSlaSeconds);
  const protocolAdherencePct =
    rubric.requiredSafetyChecks.length > 0
      ? roundTwo((matchedSafety / rubric.requiredSafetyChecks.length) * 100)
      : 100;

  return finalizeScore(rubric, accuracyPct, slaCompliancePct, protocolAdherencePct, elapsedSeconds, violations);
}

function evaluateAdministration(
  rubric: AdministrationRubric,
  events: readonly ActionEvent[],
  elapsedSeconds: number
): Omit<DeterministicEvaluation, "engineVersion" | "inputHash"> {
  const violations: RuleViolation[] = [];
  const checkedRecords = new Map<string, string>();
  const digitalActions = new Set<string>();
  let exposedDataCount = 0;

  for (const evt of events) {
    if (evt.eventType === "REPORT_RECORD_AUDITED") {
      const recordId = typeof evt.payload.recordId === "string" ? evt.payload.recordId : "";
      const status = typeof evt.payload.status === "string" ? evt.payload.status : "";
      if (recordId) checkedRecords.set(recordId, status);
    }

    if (evt.eventType === "DIGITAL_ACTION_EXECUTED" && typeof evt.payload.action === "string") {
      digitalActions.add(evt.payload.action);
    }

    if (evt.eventType === "REPORT_SUBMITTED" && evt.payload.unverified === true) {
      violations.push({
        code: "UNVERIFIED_REPORT_SUBMITTED",
        severity: "warning",
        penaltyPoints: rubric.penalties.unverifiedReportSubmitted,
        message: "Se envió un reporte operativo sin completar la conciliación documental.",
        occurredAt: evt.occurredAt,
      });
    }

    if (evt.eventType === "PII_SHARED_UNMASKED") {
      exposedDataCount += 1;
      violations.push({
        code: "DATA_EXPOSURE_RISK",
        severity: "critical",
        penaltyPoints: rubric.penalties.dataExposureRisk,
        message: "Incumplimiento de protección de datos: se exportó información personal sin anonimizar.",
        occurredAt: evt.occurredAt,
      });
    }
  }

  let correctRecords = 0;
  for (const exp of rubric.expectedChecks) {
    if (checkedRecords.get(exp.recordId) === exp.expectedStatus) {
      correctRecords += 1;
    }
  }

  let matchedDigital = 0;
  for (const action of rubric.requiredDigitalActions) {
    if (digitalActions.has(action)) matchedDigital += 1;
  }

  const accuracyPct =
    rubric.expectedChecks.length > 0 ? roundTwo((correctRecords / rubric.expectedChecks.length) * 100) : 100;
  const slaCompliancePct = computeSlaCompliance(elapsedSeconds, rubric.targetSlaSeconds);
  const digitalScore =
    rubric.requiredDigitalActions.length > 0
      ? (matchedDigital / rubric.requiredDigitalActions.length) * 100
      : 100;
  const protocolAdherencePct = roundTwo(clamp(digitalScore - exposedDataCount * 50, 0, 100));

  return finalizeScore(rubric, accuracyPct, slaCompliancePct, protocolAdherencePct, elapsedSeconds, violations);
}

function evaluateSales(
  rubric: SalesRubric,
  events: readonly ActionEvent[],
  elapsedSeconds: number
): Omit<DeterministicEvaluation, "engineVersion" | "inputHash"> {
  const violations: RuleViolation[] = [];
  const discoveryDone = new Set<string>();
  const objectionResponses = new Map<string, string>();
  let misleadingClaims = 0;

  for (const evt of events) {
    if (evt.eventType === "DISCOVERY_STEP_COMPLETED" && typeof evt.payload.step === "string") {
      discoveryDone.add(evt.payload.step);
    }

    if (evt.eventType === "OBJECTION_HANDLED") {
      const objectionId = typeof evt.payload.objectionId === "string" ? evt.payload.objectionId : "";
      const strategy = typeof evt.payload.strategy === "string" ? evt.payload.strategy : "";
      if (objectionId) objectionResponses.set(objectionId, strategy);
    }

    if (evt.eventType === "COMMERCIAL_CLAIM_MADE" && evt.payload.misleading === true) {
      misleadingClaims += 1;
      violations.push({
        code: "MISLEADING_SALES_CLAIM",
        severity: "critical",
        penaltyPoints: rubric.penalties.misleadingSalesClaim,
        message: "Se realizó una promesa comercial falsa o contraria a las condiciones reales.",
        occurredAt: evt.occurredAt,
      });
    }
  }

  let discoveryMatched = 0;
  for (const reqStep of rubric.requiredDiscoverySteps) {
    if (discoveryDone.has(reqStep)) {
      discoveryMatched += 1;
    } else {
      violations.push({
        code: "SKIPPED_NEEDS_DISCOVERY",
        severity: "warning",
        penaltyPoints: rubric.penalties.skippedDiscovery,
        message: `Omitido paso de diagnóstico comercial: '${reqStep}'.`,
        occurredAt: events[0]?.occurredAt ?? new Date(0).toISOString(),
      });
    }
  }

  let objectionsMatched = 0;
  for (const exp of rubric.expectedObjectionResponses) {
    if (objectionResponses.get(exp.objectionId) === exp.expectedStrategy) {
      objectionsMatched += 1;
    }
  }

  const accuracyPct =
    rubric.expectedObjectionResponses.length > 0
      ? roundTwo((objectionsMatched / rubric.expectedObjectionResponses.length) * 100)
      : 100;
  const slaCompliancePct = computeSlaCompliance(elapsedSeconds, rubric.targetSlaSeconds);
  const discoveryRatio =
    rubric.requiredDiscoverySteps.length > 0
      ? (discoveryMatched / rubric.requiredDiscoverySteps.length) * 100
      : 100;
  const protocolAdherencePct = roundTwo(clamp(discoveryRatio - misleadingClaims * 50, 0, 100));

  return finalizeScore(rubric, accuracyPct, slaCompliancePct, protocolAdherencePct, elapsedSeconds, violations);
}

function evaluateHasociajob(
  rubric: HasociajobRubric,
  events: readonly ActionEvent[],
  elapsedSeconds: number
): Omit<DeterministicEvaluation, "engineVersion" | "inputHash"> {
  const violations: RuleViolation[] = [];
  const decisions = new Map<string, string>();
  let collaborativePenaltyCount = 0;

  for (const evt of events) {
    if (evt.eventType === "HASOCIAJOB_DECISION") {
      const situationId = typeof evt.payload.situationId === "string" ? evt.payload.situationId : "";
      const action = typeof evt.payload.action === "string" ? evt.payload.action : "";
      const nonCollaborative = evt.payload.nonCollaborative === true;
      const avoidedLeadership = evt.payload.avoidedLeadership === true;

      if (nonCollaborative) {
        collaborativePenaltyCount += 1;
        violations.push({
          code: "NON_COLLABORATIVE_ESCALATION",
          severity: "critical",
          penaltyPoints: rubric.penalties.nonCollaborativeEscalation,
          message: `Respuesta confrontacional o sin comunicación efectiva en ${situationId}.`,
          occurredAt: evt.occurredAt,
        });
      }

      if (avoidedLeadership) {
        collaborativePenaltyCount += 1;
        violations.push({
          code: "LEADERSHIP_AVOIDANCE",
          severity: "warning",
          penaltyPoints: rubric.penalties.leadershipAvoidance,
          message: `Evitación de responsabilidad y resolución colaborativa en ${situationId}.`,
          occurredAt: evt.occurredAt,
        });
      }

      if (situationId) decisions.set(situationId, action);
    }
  }

  let correctCount = 0;
  for (const exp of rubric.expectedSituations) {
    if (decisions.get(exp.situationId) === exp.expectedAction) {
      correctCount += 1;
    }
  }

  const accuracyPct =
    rubric.expectedSituations.length > 0
      ? roundTwo((correctCount / rubric.expectedSituations.length) * 100)
      : 100;
  const slaCompliancePct = computeSlaCompliance(elapsedSeconds, rubric.targetSlaSeconds);
  const protocolAdherencePct = roundTwo(clamp(100 - collaborativePenaltyCount * 35, 0, 100));

  return finalizeScore(rubric, accuracyPct, slaCompliancePct, protocolAdherencePct, elapsedSeconds, violations);
}

function finalizeScore(
  rubric: ScenarioRubric,
  accuracyPct: number,
  slaCompliancePct: number,
  protocolAdherencePct: number,
  elapsedSeconds: number,
  ruleViolations: RuleViolation[]
): Omit<DeterministicEvaluation, "engineVersion" | "inputHash"> {
  const weighted =
    rubric.weights.accuracy * accuracyPct +
    rubric.weights.sla * slaCompliancePct +
    rubric.weights.protocol * protocolAdherencePct;

  const totalPenalty = ruleViolations.reduce((sum, v) => sum + v.penaltyPoints, 0);
  const finalScore = roundTwo(clamp(weighted - totalPenalty, 0, 100));
  const passed = finalScore >= rubric.passingScore;
  const efficiencyMultiplier = elapsedSeconds <= rubric.targetSlaSeconds ? 1.15 : 1.0;

  const xpAwarded = passed
    ? Math.round(rubric.baseXpReward * (0.6 + 0.4 * (finalScore / 100)) * efficiencyMultiplier)
    : Math.max(25, Math.round(rubric.baseXpReward * 0.15));

  return {
    finalScore,
    passed,
    xpAwarded,
    kpiBreakdown: {
      accuracyPct,
      slaCompliancePct,
      protocolAdherencePct,
      efficiencyMultiplier,
      rawDurationSeconds: elapsedSeconds,
      targetSlaSeconds: rubric.targetSlaSeconds,
    },
    ruleViolations,
  };
}

/**
 * Pure entry point executed server-side on session submission.
 * Deterministic: identical inputs always produce identical scores, KPIs, and inputHash.
 */
export function evaluateSimulation(
  rubric: ScenarioRubric,
  events: readonly ActionEvent[],
  elapsedSeconds: number
): DeterministicEvaluation {
  const ordered = [...events].sort((a, b) => a.sequenceNum - b.sequenceNum);
  validateChronologyAndAntiTamper(ordered, elapsedSeconds, rubric.minPlausibleSeconds);

  let core: Omit<DeterministicEvaluation, "engineVersion" | "inputHash">;
  switch (rubric.vertical) {
    case "logistics":
      core = evaluateLogistics(rubric, ordered, elapsedSeconds);
      break;
    case "administration":
      core = evaluateAdministration(rubric, ordered, elapsedSeconds);
      break;
    case "sales":
      core = evaluateSales(rubric, ordered, elapsedSeconds);
      break;
    case "hasociajob":
      core = evaluateHasociajob(rubric, ordered, elapsedSeconds);
      break;
  }

  return {
    engineVersion: SIMULATION_ENGINE_VERSION,
    inputHash: computeCanonicalInputHash(rubric, ordered),
    ...core,
  };
}
