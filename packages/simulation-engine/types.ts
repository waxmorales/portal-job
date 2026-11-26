/**
 * PortalJob & HaSociaJob — Pure Domain Contracts for Deterministic Simulation Engine
 *
 * Architectural Rule (ADR-001):
 * Zero React, Next.js, Supabase, or LLM imports.
 */

export type VerticalCode = "administration" | "logistics" | "sales" | "hasociajob";

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

interface BaseRubric {
  targetSlaSeconds: number;
  baseXpReward: number;
  passingScore: number;
  minPlausibleSeconds: number;
  weights: ScoringWeights;
}

export interface LogisticsExpectedItem {
  sku: string;
  expectedBatch: string;
  requiredQty: number;
}

export interface LogisticsRubric extends BaseRubric {
  vertical: "logistics";
  requiredSafetyChecks: string[];
  expectedItems: LogisticsExpectedItem[];
  penalties: {
    missingPpe: number;
    wrongBatchRotation: number;
  };
}

export interface AdminExpectedCheck {
  recordId: string;
  expectedStatus: "RECONCILED" | "FLAG_DISCREPANCY";
}

export interface AdministrationRubric extends BaseRubric {
  vertical: "administration";
  expectedChecks: AdminExpectedCheck[];
  requiredDigitalActions: string[];
  penalties: {
    unverifiedReportSubmitted: number;
    dataExposureRisk: number;
  };
}

export interface SalesExpectedObjection {
  objectionId: string;
  expectedStrategy: string;
}

export interface SalesRubric extends BaseRubric {
  vertical: "sales";
  requiredDiscoverySteps: string[];
  expectedObjectionResponses: SalesExpectedObjection[];
  penalties: {
    misleadingSalesClaim: number;
    skippedDiscovery: number;
  };
}

export interface HasociajobExpectedSituation {
  situationId: string;
  expectedAction: string;
}

export interface HasociajobRubric extends BaseRubric {
  vertical: "hasociajob";
  expectedSituations: HasociajobExpectedSituation[];
  penalties: {
    nonCollaborativeEscalation: number;
    leadershipAvoidance: number;
  };
}

export type ScenarioRubric =
  | LogisticsRubric
  | AdministrationRubric
  | SalesRubric
  | HasociajobRubric;

export interface SessionStateSnapshot {
  schemaVersion: number;
  vertical: VerticalCode;
  elapsedSeconds: number;
  currentZone?: string;
  completedCheckpoints: string[];
  metadata?: Record<string, unknown>;
}
