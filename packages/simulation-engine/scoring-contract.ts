/**
 * Portal Job — Reference Pure-TypeScript Deterministic Scoring & State Transition Contract
 *
 * Demonstrates strict separation between deterministic numeric computation and
 * downstream AI pedagogical interpretation (ADR-001).
 */

import type {
  ActionEvent,
  DeterministicEvaluation,
  HrRubric,
  LogisticsRubric,
  RuleViolation,
  ScenarioRubric,
  SessionStatus,
} from "./types.ts";

export const SIMULATION_ENGINE_VERSION = "1.0.0";

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

/**
 * Deterministic 64-bit FNV-1a canonical digest (zero external dependencies)
 * used in blueprint mode to bind an evaluation record to its exact ordered inputs.
 */
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
        message: `Protocolo EPP incompleto: falta '${reqCheck}'.`,
        occurredAt: events[0]?.occurredAt ?? new Date(0).toISOString(),
      });
    }
  }

  const totalRequiredQty = rubric.expectedItems.reduce((sum, item) => sum + item.requiredQty, 0);
  const totalCorrectQty = rubric.expectedItems.reduce((sum, item) => {
    const picked = pickedCounts.get(item.sku) ?? 0;
    return sum + Math.min(picked, item.requiredQty);
  }, 0);

  const accuracyPct = totalRequiredQty > 0 ? roundTwo((totalCorrectQty / totalRequiredQty) * 100) : 100;
  const slaCompliancePct = computeSlaCompliance(elapsedSeconds, rubric.targetSlaSeconds);
  const protocolAdherencePct =
    rubric.requiredSafetyChecks.length > 0
      ? roundTwo((matchedSafety / rubric.requiredSafetyChecks.length) * 100)
      : 100;

  return finalizeScore(rubric, accuracyPct, slaCompliancePct, protocolAdherencePct, elapsedSeconds, violations);
}

function evaluateHr(
  rubric: HrRubric,
  events: readonly ActionEvent[],
  elapsedSeconds: number
): Omit<DeterministicEvaluation, "engineVersion" | "inputHash"> {
  const violations: RuleViolation[] = [];
  const decisions = new Map<string, string>();
  let biasFlags = 0;

  for (const evt of events) {
    if (evt.eventType === "HR_CASE_DECISION") {
      const caseId = typeof evt.payload.caseId === "string" ? evt.payload.caseId : "";
      const action = typeof evt.payload.action === "string" ? evt.payload.action : "";
      const usedProtectedAttribute = evt.payload.usedProtectedAttribute === true;

      if (usedProtectedAttribute) {
        biasFlags += 1;
        violations.push({
          code: "BIAS_CRITERION_DETECTED",
          severity: "critical",
          penaltyPoints: rubric.penalties.biasCriterionUsed,
          message: `Uso de criterio no objetivo/sesgado detectado en el caso ${caseId}.`,
          occurredAt: evt.occurredAt,
        });
      }

      if (caseId) {
        decisions.set(caseId, action);
      }
    }
  }

  let correctCount = 0;
  for (const exp of rubric.expectedDecisions) {
    const actual = decisions.get(exp.caseId);
    if (actual === exp.expectedAction) {
      correctCount += 1;
    } else if (exp.expectedAction === "ESCALATE_COMPLIANCE") {
      violations.push({
        code: "MISSED_COMPLIANCE_ESCALATION",
        severity: "critical",
        penaltyPoints: rubric.penalties.missedComplianceEscalation,
        message: `Caso ${exp.caseId} requería escalamiento obligatorio de cumplimiento.`,
        occurredAt: events[events.length - 1]?.occurredAt ?? new Date(0).toISOString(),
      });
    }
  }

  const totalCases = rubric.expectedDecisions.length;
  const accuracyPct = totalCases > 0 ? roundTwo((correctCount / totalCases) * 100) : 100;
  const slaCompliancePct = computeSlaCompliance(elapsedSeconds, rubric.targetSlaSeconds);
  const protocolAdherencePct = biasFlags === 0 ? 100 : clamp(100 - biasFlags * 50, 0, 100);

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

  const core =
    rubric.vertical === "logistics"
      ? evaluateLogistics(rubric, ordered, elapsedSeconds)
      : evaluateHr(rubric, ordered, elapsedSeconds);

  return {
    engineVersion: SIMULATION_ENGINE_VERSION,
    inputHash: computeCanonicalInputHash(rubric, ordered),
    ...core,
  };
}
