import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionSessionStatus,
  evaluateSimulation,
  SIMULATION_ENGINE_VERSION,
} from "./scoring-contract.ts";
import type { ActionEvent, HrRubric, LogisticsRubric } from "./types.ts";

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

const hrRubric: HrRubric = {
  vertical: "hr",
  targetSlaSeconds: 600,
  baseXpReward: 300,
  passingScore: 75,
  minPlausibleSeconds: 30,
  weights: { accuracy: 0.45, sla: 0.25, protocol: 0.3 },
  expectedDecisions: [
    { caseId: "CASE-01", expectedAction: "SHORTLIST" },
    { caseId: "CASE-02", expectedAction: "ESCALATE_COMPLIANCE" },
    { caseId: "CASE-03", expectedAction: "REJECT_TECHNICAL_GAP" },
  ],
  penalties: { biasCriterionUsed: 30, missedComplianceEscalation: 20 },
};

test("logistics perfect run is deterministic and earns full SLA bonus", () => {
  const events: ActionEvent[] = [
    {
      sequenceNum: 1,
      idempotencyKey: "k1",
      eventType: "SAFETY_PPE_EQUIPPED",
      payload: { item: "ppe_helmet" },
      occurredAt: "2026-11-26T05:00:10Z",
    },
    {
      sequenceNum: 2,
      idempotencyKey: "k2",
      eventType: "SAFETY_PPE_EQUIPPED",
      payload: { item: "ppe_vest" },
      occurredAt: "2026-11-26T05:00:15Z",
    },
    {
      sequenceNum: 3,
      idempotencyKey: "k3",
      eventType: "ITEM_PICKED",
      payload: { sku: "SKU-104", batch: "LOT-2026-01", qty: 2 },
      occurredAt: "2026-11-26T05:02:00Z",
    },
    {
      sequenceNum: 4,
      idempotencyKey: "k4",
      eventType: "ITEM_PICKED",
      payload: { sku: "SKU-209", batch: "LOT-2026-02", qty: 1 },
      occurredAt: "2026-11-26T05:04:00Z",
    },
  ];

  const eval1 = evaluateSimulation(logisticsRubric, events, 360);
  const eval2 = evaluateSimulation(logisticsRubric, [...events].reverse(), 360);

  assert.equal(eval1.engineVersion, SIMULATION_ENGINE_VERSION);
  assert.equal(eval1.finalScore, 100);
  assert.equal(eval1.passed, true);
  assert.equal(eval1.xpAwarded, 288);
  assert.equal(eval1.ruleViolations.length, 0);
  assert.equal(eval1.inputHash, eval2.inputHash);
  assert.deepEqual(eval1, eval2);
});

test("logistics missing PPE applies explicit penalty without crashing", () => {
  const events: ActionEvent[] = [
    {
      sequenceNum: 1,
      idempotencyKey: "k1",
      eventType: "ITEM_PICKED",
      payload: { sku: "SKU-104", batch: "LOT-2026-01", qty: 2 },
      occurredAt: "2026-11-26T05:02:00Z",
    },
  ];

  const result = evaluateSimulation(logisticsRubric, events, 400);
  assert.equal(result.passed, false);
  assert.ok(result.ruleViolations.some((v) => v.code === "MISSING_PPE_HELMET"));
  assert.ok(result.ruleViolations.some((v) => v.code === "MISSING_PPE_VEST"));
});

test("HR bias detection triggers critical violation", () => {
  const events: ActionEvent[] = [
    {
      sequenceNum: 1,
      idempotencyKey: "h1",
      eventType: "HR_CASE_DECISION",
      payload: { caseId: "CASE-01", action: "SHORTLIST", usedProtectedAttribute: false },
      occurredAt: "2026-11-26T05:01:00Z",
    },
    {
      sequenceNum: 2,
      idempotencyKey: "h2",
      eventType: "HR_CASE_DECISION",
      payload: { caseId: "CASE-02", action: "SHORTLIST", usedProtectedAttribute: true },
      occurredAt: "2026-11-26T05:02:00Z",
    },
  ];

  const result = evaluateSimulation(hrRubric, events, 200);
  assert.equal(result.passed, false);
  assert.ok(result.ruleViolations.some((v) => v.code === "BIAS_CRITERION_DETECTED"));
  assert.ok(result.ruleViolations.some((v) => v.code === "MISSED_COMPLIANCE_ESCALATION"));
});

test("anti-tamper rejects implausibly fast completions", () => {
  const events: ActionEvent[] = [
    {
      sequenceNum: 1,
      idempotencyKey: "fast1",
      eventType: "SAFETY_PPE_EQUIPPED",
      payload: { item: "ppe_helmet" },
      occurredAt: "2026-11-26T05:00:01Z",
    },
  ];

  assert.throws(() => evaluateSimulation(logisticsRubric, events, 3), /Anti-tamper/);
});

test("session state machine blocks transitions out of terminal evaluated state", () => {
  assert.equal(canTransitionSessionStatus("in_progress", "submitted"), true);
  assert.equal(canTransitionSessionStatus("submitted", "evaluated"), true);
  assert.equal(canTransitionSessionStatus("evaluated", "in_progress"), false);
  assert.equal(canTransitionSessionStatus("abandoned", "submitted"), false);
});
