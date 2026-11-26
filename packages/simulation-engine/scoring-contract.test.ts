import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionSessionStatus,
  evaluateSimulation,
  SIMULATION_ENGINE_VERSION,
} from "./scoring-contract.ts";
import type {
  ActionEvent,
  AdministrationRubric,
  HasociajobRubric,
  LogisticsRubric,
  SalesRubric,
} from "./types.ts";

const logisticsRubric: LogisticsRubric = {
  vertical: "logistics",
  targetSlaSeconds: 480,
  baseXpReward: 250,
  passingScore: 70,
  minPlausibleSeconds: 20,
  weights: { accuracy: 0.45, sla: 0.3, protocol: 0.25 },
  requiredSafetyChecks: ["ppe_helmet", "ppe_vest"],
  expectedItems: [
    { sku: "SKU-104", expectedBatch: "LOT-2026-01", requiredQty: 2 },
    { sku: "SKU-209", expectedBatch: "LOT-2026-02", requiredQty: 1 },
  ],
  penalties: { missingPpe: 25, wrongBatchRotation: 15 },
};

const adminRubric: AdministrationRubric = {
  vertical: "administration",
  targetSlaSeconds: 540,
  baseXpReward: 260,
  passingScore: 75,
  minPlausibleSeconds: 25,
  weights: { accuracy: 0.5, sla: 0.25, protocol: 0.25 },
  expectedChecks: [
    { recordId: "INV-101", expectedStatus: "RECONCILED" },
    { recordId: "INV-102", expectedStatus: "FLAG_DISCREPANCY" },
  ],
  requiredDigitalActions: ["export_pivot_summary", "mask_pii_fields"],
  penalties: { unverifiedReportSubmitted: 20, dataExposureRisk: 30 },
};

const salesRubric: SalesRubric = {
  vertical: "sales",
  targetSlaSeconds: 420,
  baseXpReward: 280,
  passingScore: 75,
  minPlausibleSeconds: 20,
  weights: { accuracy: 0.45, sla: 0.25, protocol: 0.3 },
  requiredDiscoverySteps: ["ask_budget_need", "verify_use_case"],
  expectedObjectionResponses: [
    { objectionId: "OBJ-PRICE", expectedStrategy: "VALUE_ROI_BREAKDOWN" },
    { objectionId: "OBJ-SUPPORT", expectedStrategy: "SLA_WARRANTY_PROOF" },
  ],
  penalties: { misleadingSalesClaim: 35, skippedDiscovery: 15 },
};

const hasociajobRubric: HasociajobRubric = {
  vertical: "hasociajob",
  targetSlaSeconds: 600,
  baseXpReward: 300,
  passingScore: 75,
  minPlausibleSeconds: 25,
  weights: { accuracy: 0.45, sla: 0.2, protocol: 0.35 },
  expectedSituations: [
    { situationId: "SIT-TEAM-CONFLICT", expectedAction: "ACTIVE_LISTENING_MEDIATION" },
    { situationId: "SIT-SCOPE-CHANGE", expectedAction: "ADAPTIVE_REPRIORITIZATION" },
  ],
  penalties: { nonCollaborativeEscalation: 25, leadershipAvoidance: 20 },
};

test("logistics perfect run is deterministic and earns full SLA bonus", () => {
  const events: ActionEvent[] = [
    { sequenceNum: 1, idempotencyKey: "k1", eventType: "SAFETY_PPE_EQUIPPED", payload: { item: "ppe_helmet" }, occurredAt: "2026-11-26T05:00:10Z" },
    { sequenceNum: 2, idempotencyKey: "k2", eventType: "SAFETY_PPE_EQUIPPED", payload: { item: "ppe_vest" }, occurredAt: "2026-11-26T05:00:15Z" },
    { sequenceNum: 3, idempotencyKey: "k3", eventType: "ITEM_PICKED", payload: { sku: "SKU-104", batch: "LOT-2026-01", qty: 2 }, occurredAt: "2026-11-26T05:02:00Z" },
    { sequenceNum: 4, idempotencyKey: "k4", eventType: "ITEM_PICKED", payload: { sku: "SKU-209", batch: "LOT-2026-02", qty: 1 }, occurredAt: "2026-11-26T05:04:00Z" },
  ];

  const eval1 = evaluateSimulation(logisticsRubric, events, 360);
  const eval2 = evaluateSimulation(logisticsRubric, [...events].reverse(), 360);

  assert.equal(eval1.engineVersion, SIMULATION_ENGINE_VERSION);
  assert.equal(eval1.finalScore, 100);
  assert.equal(eval1.passed, true);
  assert.equal(eval1.xpAwarded, 288);
  assert.equal(eval1.inputHash, eval2.inputHash);
  assert.deepEqual(eval1, eval2);
});

test("administration penalizes unmasked PII data exposure", () => {
  const events: ActionEvent[] = [
    { sequenceNum: 1, idempotencyKey: "a1", eventType: "REPORT_RECORD_AUDITED", payload: { recordId: "INV-101", status: "RECONCILED" }, occurredAt: "2026-11-26T05:01:00Z" },
    { sequenceNum: 2, idempotencyKey: "a2", eventType: "PII_SHARED_UNMASKED", payload: { field: "dni" }, occurredAt: "2026-11-26T05:02:00Z" },
  ];

  const result = evaluateSimulation(adminRubric, events, 300);
  assert.equal(result.passed, false);
  assert.ok(result.ruleViolations.some((v) => v.code === "DATA_EXPOSURE_RISK"));
});

test("sales rewards consultative discovery and ethical objection handling", () => {
  const events: ActionEvent[] = [
    { sequenceNum: 1, idempotencyKey: "s1", eventType: "DISCOVERY_STEP_COMPLETED", payload: { step: "ask_budget_need" }, occurredAt: "2026-11-26T05:00:30Z" },
    { sequenceNum: 2, idempotencyKey: "s2", eventType: "DISCOVERY_STEP_COMPLETED", payload: { step: "verify_use_case" }, occurredAt: "2026-11-26T05:01:00Z" },
    { sequenceNum: 3, idempotencyKey: "s3", eventType: "OBJECTION_HANDLED", payload: { objectionId: "OBJ-PRICE", strategy: "VALUE_ROI_BREAKDOWN" }, occurredAt: "2026-11-26T05:02:00Z" },
    { sequenceNum: 4, idempotencyKey: "s4", eventType: "OBJECTION_HANDLED", payload: { objectionId: "OBJ-SUPPORT", strategy: "SLA_WARRANTY_PROOF" }, occurredAt: "2026-11-26T05:03:00Z" },
  ];

  const result = evaluateSimulation(salesRubric, events, 300);
  assert.equal(result.finalScore, 100);
  assert.equal(result.passed, true);
});

test("HaSociaJob flags non-collaborative escalation while preserving clean passing paths", () => {
  const cleanEvents: ActionEvent[] = [
    { sequenceNum: 1, idempotencyKey: "h1", eventType: "HASOCIAJOB_DECISION", payload: { situationId: "SIT-TEAM-CONFLICT", action: "ACTIVE_LISTENING_MEDIATION" }, occurredAt: "2026-11-26T05:01:00Z" },
    { sequenceNum: 2, idempotencyKey: "h2", eventType: "HASOCIAJOB_DECISION", payload: { situationId: "SIT-SCOPE-CHANGE", action: "ADAPTIVE_REPRIORITIZATION" }, occurredAt: "2026-11-26T05:02:00Z" },
  ];
  const clean = evaluateSimulation(hasociajobRubric, cleanEvents, 300);
  assert.equal(clean.finalScore, 100);
  assert.equal(clean.passed, true);

  const badEvents: ActionEvent[] = [
    { sequenceNum: 1, idempotencyKey: "hb1", eventType: "HASOCIAJOB_DECISION", payload: { situationId: "SIT-TEAM-CONFLICT", action: "BLAME_PEER", nonCollaborative: true }, occurredAt: "2026-11-26T05:01:00Z" },
  ];
  const failed = evaluateSimulation(hasociajobRubric, badEvents, 300);
  assert.equal(failed.passed, false);
  assert.ok(failed.ruleViolations.some((v) => v.code === "NON_COLLABORATIVE_ESCALATION"));
});

test("anti-tamper and session state machine enforce invariants", () => {
  assert.throws(
    () =>
      evaluateSimulation(
        logisticsRubric,
        [{ sequenceNum: 1, idempotencyKey: "f1", eventType: "SAFETY_PPE_EQUIPPED", payload: { item: "ppe_helmet" }, occurredAt: "2026-11-26T05:00:01Z" }],
        3
      ),
    /Anti-tamper/
  );
  assert.equal(canTransitionSessionStatus("in_progress", "submitted"), true);
  assert.equal(canTransitionSessionStatus("evaluated", "in_progress"), false);
});
