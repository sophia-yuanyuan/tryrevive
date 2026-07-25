"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../revival-core.js");

function legacyProject(overrides = {}) {
  return {
    id: "legacy-project",
    name: "Legacy project",
    goal: "Ship a recoverable prototype",
    lastProgress: "The static demo works",
    obstacle: "The next step is unclear",
    blocker: "context",
    status: "brief",
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides
  };
}

test("migrates a legacy store into ProjectState v2 without losing context", () => {
  const store = core.migrateStore({
    activeProjectId: "legacy-project",
    projects: [legacyProject()]
  });

  assert.equal(store.schemaVersion, 2);
  assert.equal(store.activeProjectId, "legacy-project");
  assert.equal(store.projects.length, 1);

  const project = store.projects[0];
  assert.equal(project.schemaVersion, 2);
  assert.equal(project.goal, "Ship a recoverable prototype");
  assert.equal(project.contextSnapshots.length, 1);
  assert.equal(project.contextSnapshots[0].sourceType, "manual");
  assert.equal(project.activeContextSnapshotId, project.contextSnapshots[0].id);
});

test("accepts only a bounded single-action contract with a completion standard", () => {
  const valid = core.createActionContract({
    text: "Write the first acceptance test",
    minutes: 12,
    doneCriteria: ["The test fails for the missing behavior"]
  });

  assert.deepEqual(core.validateActionContract(valid), { valid: true, errors: [] });

  const missingDeliverable = core.createActionContract({
    text: "",
    minutes: 12,
    doneCriteria: ["A result exists"]
  });
  assert.equal(core.validateActionContract(missingDeliverable).valid, false);

  const unbounded = { ...valid, minutes: 90, timeboxMinutes: 90 };
  assert.equal(core.validateActionContract(unbounded).valid, false);
});

test("enforces the revival state machine and preserves action history", () => {
  const project = core.createProject(legacyProject());
  const firstAction = core.assignAction(project, {
    text: "Write one status note",
    minutes: 8,
    doneCriteria: ["A dated note is saved"]
  });

  assert.equal(project.currentActionId, firstAction.id);
  core.transitionProject(project, "running");
  core.transitionProject(project, "evidence");
  core.transitionProject(project, "completed");
  assert.equal(project.status, "completed");

  assert.throws(
    () => core.transitionProject(project, "running"),
    /completed|running/
  );

  core.transitionProject(project, "brief");
  const secondAction = core.assignAction(project, {
    text: "Open the next issue",
    minutes: 5,
    doneCriteria: ["One issue URL is selected"]
  });
  assert.equal(project.actionHistory.length, 1);
  assert.equal(project.actionHistory[0].id, firstAction.id);
  assert.equal(project.currentActionId, secondAction.id);
});

test("binds evidence and a return plan to the current action and context", () => {
  const project = core.createProject(legacyProject());
  const action = core.assignAction(project, {
    text: "Create one commit",
    minutes: 15,
    doneCriteria: ["A commit URL exists"]
  });

  const evidence = core.addEvidence(project, {
    type: "link",
    link: "https://github.com/example/repo/commit/abcdef1",
    note: "Implemented the action",
    trust: "verified",
    verification: {
      status: "verified",
      validator: "github-public-api",
      checkedAt: Date.now(),
      reason: "Fresh commit in the connected repository"
    }
  });
  const dueAt = Date.now() + 60_000;
  const returnPlan = core.setReturnPlan(project, {
    dueAt,
    channel: "calendar"
  });

  assert.equal(evidence.actionId, action.id);
  assert.equal(evidence.contextSnapshotId, project.activeContextSnapshotId);
  assert.equal(evidence.trust, "verified");
  assert.equal(returnPlan.dueAt, dueAt);
  assert.equal(project.reminderAt, dueAt);
});

test("merges stores by project revision time and produces a resume packet", () => {
  const older = core.createStore({
    activeProjectId: "same-project",
    projects: [
      legacyProject({
        id: "same-project",
        lastProgress: "Old progress",
        updatedAt: 1_700_000_000_000
      })
    ],
    events: [{ id: "event-1", at: 1 }]
  });
  const newer = core.createStore({
    activeProjectId: "same-project",
    projects: [
      legacyProject({
        id: "same-project",
        lastProgress: "New progress",
        updatedAt: 1_800_000_000_000
      })
    ],
    events: [{ id: "event-2", at: 2 }]
  });

  const merged = core.mergeStores(older, newer);
  assert.equal(merged.projects.length, 1);
  assert.equal(merged.projects[0].lastProgress, "New progress");
  assert.deepEqual(merged.events.map(event => event.id), ["event-1", "event-2"]);

  const packet = core.buildResumePacket(merged.projects[0]);
  assert.equal(packet.projectId, "same-project");
  assert.equal(packet.lastKnownProgress, "New progress");
  assert.ok(packet.contextSnapshotId);
});
