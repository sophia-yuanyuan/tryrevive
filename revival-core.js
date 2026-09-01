(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TryReviveCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SCHEMA_VERSION = 2;
  const PROJECT_STATUSES = Object.freeze(["brief", "running", "evidence", "completed", "paused", "finished"]);
  const EVIDENCE_TRUST_LEVELS = Object.freeze(["claimed", "observed", "verified"]);
  const TRANSITIONS = Object.freeze({
    brief: ["running", "paused"],
    running: ["brief", "evidence", "paused"],
    evidence: ["running", "completed", "paused"],
    completed: ["brief", "paused", "finished"],
    paused: ["brief", "finished"],
    finished: ["brief"]
  });

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function asText(value, fallback) {
    const text = String(value == null ? "" : value).trim();
    return text || (fallback || "");
  }

  function asTimestamp(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : (fallback || Date.now());
  }

  function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function createContextSnapshot(input) {
    const source = input && typeof input === "object" ? input : {};
    const now = asTimestamp(source.capturedAt, Date.now());
    return {
      id: asText(source.id, uid("snapshot")),
      schemaVersion: SCHEMA_VERSION,
      sourceType: asText(source.sourceType, "manual"),
      sourceRef: asText(source.sourceRef),
      summary: asText(source.summary),
      data: source.data && typeof source.data === "object" ? source.data : {},
      capturedAt: now,
      createdAt: asTimestamp(source.createdAt, now)
    };
  }

  function createActionContract(input) {
    const source = input && typeof input === "object" ? input : {};
    const text = asText(source.text || source.deliverable);
    const doneDefinition = asText(
      source.doneDefinition ||
      (Array.isArray(source.doneCriteria) ? source.doneCriteria[0] : "")
    );
    const minutes = clampNumber(source.minutes || source.timeboxMinutes, 1, 45, 10);
    const doneCriteria = Array.isArray(source.doneCriteria)
      ? source.doneCriteria.map(item => asText(item)).filter(Boolean)
      : (doneDefinition ? [doneDefinition] : []);
    const createdBy = source.createdBy && typeof source.createdBy === "object"
      ? source.createdBy
      : { type: "local_rule", id: "revival-rule-v1" };
    const executor = source.executor && typeof source.executor === "object"
      ? source.executor
      : { kind: "human", capability: null };

    return {
      id: asText(source.id, uid("action")),
      schemaVersion: SCHEMA_VERSION,
      kind: "action_contract",
      text,
      deliverable: text,
      minutes,
      timeboxMinutes: minutes,
      doneDefinition: doneDefinition || doneCriteria[0] || "",
      doneCriteria,
      rationale: asText(source.rationale),
      sourceSnapshotId: asText(source.sourceSnapshotId) || null,
      createdBy,
      executor,
      requiresApproval: Boolean(source.requiresApproval),
      status: asText(source.status, "proposed"),
      isSprint: Boolean(source.isSprint),
      createdAt: asTimestamp(source.createdAt, Date.now())
    };
  }

  function validateActionContract(action) {
    const errors = [];
    if (!action || typeof action !== "object") return { valid: false, errors: ["动作不存在"] };
    if (asText(action.kind) !== "action_contract") errors.push("动作类型必须是 action_contract");
    if (!asText(action.text || action.deliverable)) errors.push("必须只有一个明确交付动作");
    const criteria = Array.isArray(action.doneCriteria)
      ? action.doneCriteria.map(item => asText(item)).filter(Boolean)
      : [];
    if (!asText(action.doneDefinition) && !criteria.length) errors.push("必须包含完成标准");
    const minutes = Number(action.minutes || action.timeboxMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 45) errors.push("时间盒必须在 1–45 分钟之间");
    return { valid: errors.length === 0, errors };
  }

  function createEvidenceRecord(input) {
    const source = input && typeof input === "object" ? input : {};
    const trust = EVIDENCE_TRUST_LEVELS.includes(source.trust) ? source.trust : "claimed";
    return {
      id: asText(source.id, uid("evidence")),
      schemaVersion: SCHEMA_VERSION,
      type: asText(source.type, "text"),
      note: asText(source.note),
      link: asText(source.link),
      file: source.file && typeof source.file === "object" ? source.file : null,
      trust,
      verification: source.verification && typeof source.verification === "object"
        ? source.verification
        : {
            status: trust,
            validator: trust === "claimed" ? "self_report" : "browser_observation",
            checkedAt: Date.now(),
            reason: trust === "claimed" ? "用户自述，尚未连接外部验证器" : "浏览器观察到本地成果元数据"
          },
      actionId: asText(source.actionId) || null,
      contextSnapshotId: asText(source.contextSnapshotId) || null,
      createdAt: asTimestamp(source.createdAt, Date.now())
    };
  }

  function createReturnPlan(input) {
    const source = input && typeof input === "object" ? input : {};
    const dueAt = Number(source.dueAt);
    if (!Number.isFinite(dueAt) || dueAt <= 0) return null;
    return {
      id: asText(source.id, uid("return")),
      schemaVersion: SCHEMA_VERSION,
      dueAt,
      channel: asText(source.channel, "in_app"),
      status: asText(source.status, "scheduled"),
      lastNotifiedAt: Number(source.lastNotifiedAt) || null,
      createdAt: asTimestamp(source.createdAt, Date.now())
    };
  }

  function createManualSnapshotFromProject(project) {
    const source = project && typeof project === "object" ? project : {};
    return createContextSnapshot({
      sourceType: "manual",
      sourceRef: source.toolLink || "",
      summary: [
        source.goal ? `目标：${source.goal}` : "",
        source.lastProgress ? `最后进展：${source.lastProgress}` : "",
        source.lastCompleted ? `最后成果：${source.lastCompleted}` : "",
        source.obstacle ? `具体阻力：${source.obstacle}` : ""
      ].filter(Boolean).join("\n"),
      data: {
        goal: asText(source.goal),
        lastProgress: asText(source.lastProgress),
        lastCompleted: asText(source.lastCompleted),
        blocker: asText(source.blocker, "context")
      },
      capturedAt: asTimestamp(source.createdAt, Date.now())
    });
  }

  function normalizeProject(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const now = Date.now();
    const status = PROJECT_STATUSES.includes(source.status) ? source.status : "brief";
    const snapshots = Array.isArray(source.contextSnapshots)
      ? source.contextSnapshots.filter(Boolean).map(createContextSnapshot)
      : [];
    if (!snapshots.length) snapshots.push(createManualSnapshotFromProject(source));
    const activeContextSnapshotId = snapshots.some(item => item.id === source.activeContextSnapshotId)
      ? source.activeContextSnapshotId
      : snapshots[snapshots.length - 1].id;
    const evidence = Array.isArray(source.evidence)
      ? source.evidence.filter(Boolean).map(createEvidenceRecord)
      : [];
    const action = source.action ? createActionContract({
      ...source.action,
      sourceSnapshotId: source.action.sourceSnapshotId || activeContextSnapshotId
    }) : null;
    const actionHistory = Array.isArray(source.actionHistory)
      ? source.actionHistory.filter(Boolean).map(createActionContract)
      : [];
    const returnPlan = source.returnPlan
      ? createReturnPlan(source.returnPlan)
      : createReturnPlan({ dueAt: source.reminderAt, channel: "in_app" });

    return {
      ...source,
      id: asText(source.id, uid("project")),
      schemaVersion: SCHEMA_VERSION,
      revision: Math.max(1, Number(source.revision) || 1),
      status,
      blocker: asText(source.blocker, "context"),
      evidence,
      sessions: Array.isArray(source.sessions) ? source.sessions.filter(Boolean) : [],
      contextSnapshots: snapshots.slice(-20),
      activeContextSnapshotId,
      action,
      currentActionId: action ? action.id : null,
      actionHistory: actionHistory.slice(-50),
      returnPlan,
      reminderAt: returnPlan ? returnPlan.dueAt : (Number(source.reminderAt) || null),
      createdAt: asTimestamp(source.createdAt, now),
      updatedAt: asTimestamp(source.updatedAt, now)
    };
  }

  function createProject(input) {
    return normalizeProject({
      ...(input && typeof input === "object" ? input : {}),
      schemaVersion: SCHEMA_VERSION,
      revision: 1
    });
  }

  function createStore(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const projects = Array.isArray(source.projects)
      ? source.projects.filter(Boolean).map(normalizeProject)
      : [];
    const activeProjectId = projects.some(project => project.id === source.activeProjectId)
      ? source.activeProjectId
      : (projects[0] ? projects[0].id : null);
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: Math.max(1, Number(source.revision) || 1),
      activeProjectId,
      projects,
      events: Array.isArray(source.events) ? source.events.filter(Boolean).slice(-500) : [],
      draftConversation: source.draftConversation && typeof source.draftConversation === "object"
        ? source.draftConversation
        : null
    };
  }

  function migrateStore(raw) {
    return createStore(raw);
  }

  function canTransition(from, to) {
    if (from === to) return true;
    return Boolean(TRANSITIONS[from] && TRANSITIONS[from].includes(to));
  }

  function transitionProject(project, nextStatus) {
    if (!project || typeof project !== "object") throw new Error("项目不存在");
    if (!PROJECT_STATUSES.includes(nextStatus)) throw new Error(`未知项目状态：${nextStatus}`);
    const current = PROJECT_STATUSES.includes(project.status) ? project.status : "brief";
    if (!canTransition(current, nextStatus)) {
      throw new Error(`不允许从 ${current} 进入 ${nextStatus}`);
    }
    project.status = nextStatus;
    project.revision = Math.max(1, Number(project.revision) || 1) + 1;
    project.updatedAt = Date.now();
    return project;
  }

  function assignAction(project, input) {
    if (!project || typeof project !== "object") throw new Error("项目不存在");
    const action = createActionContract({
      ...(input && typeof input === "object" ? input : {}),
      sourceSnapshotId: input?.sourceSnapshotId || project.activeContextSnapshotId || null
    });
    const validation = validateActionContract(action);
    if (!validation.valid) throw new Error(validation.errors.join("；"));
    if (!Array.isArray(project.actionHistory)) project.actionHistory = [];
    if (project.action && project.action.id !== action.id) {
      project.actionHistory.push(createActionContract(project.action));
      project.actionHistory = project.actionHistory.slice(-50);
    }
    project.action = action;
    project.currentActionId = action.id;
    project.revision = Math.max(1, Number(project.revision) || 1) + 1;
    project.updatedAt = Date.now();
    return action;
  }

  function addContextSnapshot(project, input) {
    if (!project || typeof project !== "object") throw new Error("项目不存在");
    const snapshot = createContextSnapshot(input);
    if (!Array.isArray(project.contextSnapshots)) project.contextSnapshots = [];
    project.contextSnapshots.push(snapshot);
    project.contextSnapshots = project.contextSnapshots.slice(-20);
    project.activeContextSnapshotId = snapshot.id;
    project.revision = Math.max(1, Number(project.revision) || 1) + 1;
    project.updatedAt = Date.now();
    return snapshot;
  }

  function getActiveContextSnapshot(project) {
    if (!project || !Array.isArray(project.contextSnapshots)) return null;
    return project.contextSnapshots.find(item => item.id === project.activeContextSnapshotId)
      || project.contextSnapshots[project.contextSnapshots.length - 1]
      || null;
  }

  function addEvidence(project, input) {
    if (!project || typeof project !== "object") throw new Error("项目不存在");
    const evidence = createEvidenceRecord({
      ...(input && typeof input === "object" ? input : {}),
      actionId: input?.actionId || project.currentActionId || project.action?.id || null,
      contextSnapshotId: input?.contextSnapshotId || project.activeContextSnapshotId || null
    });
    if (!Array.isArray(project.evidence)) project.evidence = [];
    project.evidence.push(evidence);
    project.revision = Math.max(1, Number(project.revision) || 1) + 1;
    project.updatedAt = Date.now();
    return evidence;
  }

  function setReturnPlan(project, input) {
    if (!project || typeof project !== "object") throw new Error("项目不存在");
    const plan = createReturnPlan(input);
    project.returnPlan = plan;
    project.reminderAt = plan ? plan.dueAt : null;
    project.revision = Math.max(1, Number(project.revision) || 1) + 1;
    project.updatedAt = Date.now();
    return plan;
  }

  function buildResumePacket(project) {
    const normalized = normalizeProject(project);
    const snapshot = getActiveContextSnapshot(normalized);
    const evidence = normalized.evidence[normalized.evidence.length - 1] || null;
    return {
      projectId: normalized.id,
      projectName: asText(normalized.name, "未命名项目"),
      status: normalized.status,
      lastKnownProgress: evidence?.note || normalized.lastProgress || normalized.lastCompleted || "",
      blocker: normalized.blocker,
      currentAction: normalized.action,
      contextSnapshotId: snapshot?.id || null,
      returnDueAt: normalized.returnPlan?.dueAt || null,
      evidenceTrust: evidence?.trust || null,
      generatedAt: Date.now()
    };
  }

  function mergeStores(baseRaw, incomingRaw) {
    const base = createStore(baseRaw);
    const incoming = createStore(incomingRaw);
    const projects = new Map();
    [...base.projects, ...incoming.projects].forEach(project => {
      const existing = projects.get(project.id);
      if (!existing || Number(project.updatedAt) >= Number(existing.updatedAt)) {
        projects.set(project.id, normalizeProject(project));
      }
    });
    const events = new Map();
    [...base.events, ...incoming.events].forEach(event => {
      if (event && event.id) events.set(event.id, event);
    });
    const mergedProjects = [...projects.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    const preferredActive = incoming.activeProjectId || base.activeProjectId;
    return createStore({
      schemaVersion: SCHEMA_VERSION,
      revision: Math.max(base.revision, incoming.revision) + 1,
      activeProjectId: mergedProjects.some(project => project.id === preferredActive)
        ? preferredActive
        : (mergedProjects[0]?.id || null),
      projects: mergedProjects,
      events: [...events.values()].sort((a, b) => Number(a.at) - Number(b.at)).slice(-500),
      draftConversation: incoming.draftConversation || base.draftConversation || null
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    PROJECT_STATUSES,
    EVIDENCE_TRUST_LEVELS,
    TRANSITIONS,
    uid,
    createStore,
    migrateStore,
    createProject,
    normalizeProject,
    createContextSnapshot,
    createActionContract,
    validateActionContract,
    createEvidenceRecord,
    createReturnPlan,
    canTransition,
    transitionProject,
    assignAction,
    addContextSnapshot,
    getActiveContextSnapshot,
    addEvidence,
    setReturnPlan,
    buildResumePacket,
    mergeStores
  });
});
