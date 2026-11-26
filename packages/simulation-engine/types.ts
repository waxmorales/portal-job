/**
 * Portal Job — Pure Domain Contracts for Deterministic Simulation Engine
 *
 * Architectural Rule (ADR-001):
 * This module MUST remain framework-agnostic (zero React, Next.js, Supabase, or LLM imports).
 */

export type VerticalCode = "logistics" | "hr" | "operations";

export type SessionStatus =
  | "in_progress"
  | "paused"
  | "submitted"
  | "evaluated"
  | "abandoned"
  | "expired";

export type ViolationSeverity = "warning" | "critical";

export interface RuleViolation {
  code: string;
  severity: ViolationSeverity;
  penaltyPoints: number;
  message: string;
  occurredAt: string;
}

export interface KpiBreakdown {
  accuracyPct: number;
  slaCompliancePct: number;
  protocolAdherencePct: number;
  efficiencyMultiplier: number;
  rawDurationSeconds: number;
  targetSlaSeconds: number;
}

export interface DeterministicEvaluation {
  engineVersion: string;
  inputHash: string;
  finalScore: number;
  passed: boolean;
  xpAwarded: number;
  kpiBreakdown: KpiBreakdown;
  ruleViolations: RuleViolation[];
}

export interface ActionEvent {
  sequenceNum: number;
  idempotencyKey: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

export interface ScoringWeights {
  accuracy: number;
  sla: number;
  protocol: number;
}

export interface LogisticsExpectedItem {
  sku: string;
  expectedBatch: string;
  requiredQty: number;
}

export interface LogisticsRubric {
  vertical: "logistics";
  targetSlaSeconds: number;
  baseXpReward: number;
  passingScore: number;
  minPlausibleSeconds: number;
  weights: ScoringWeights;
  requiredSafetyChecks: string[];
  expectedItems: LogisticsExpectedItem[];
  penalties: {
    missingPpe: number;
    wrongBatchRotation: number;
  };
}

export interface HrExpectedDecision {
  caseId: string;
  expectedAction: "SHORTLIST" | "ESCALATE_COMPLIANCE" | "REJECT_TECHNICAL_GAP";
}

export interface HrRubric {
  vertical: "hr";
  targetSlaSeconds: number;
  baseXpReward: number;
  passingScore: number;
  minPlausibleSeconds: number;
  weights: ScoringWeights;
  expectedDecisions: HrExpectedDecision[];
  penalties: {
    biasCriterionUsed: number;
    missedComplianceEscalation: number;
  };
}

export type ScenarioRubric = LogisticsRubric | HrRubric;

export interface SessionStateSnapshot {
  schemaVersion: number;
  vertical: VerticalCode;
  elapsedSeconds: number;
  currentZone?: string;
  completedCheckpoints: string[];
  metadata?: Record<string, unknown>;
}
