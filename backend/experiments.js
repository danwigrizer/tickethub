import { Router } from 'express';
import { getDB } from './db.js';

const router = Router();

// Will be set by init()
let sessions = null;
let requestLogs = null;
let loadConfig = null;
let getGlobalListingOverrides = null;

function generateExperimentId() {
  return `exp_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ========== DB Helpers ==========

async function getExperiment(id) {
  const db = getDB();
  return db.collection('experiments').findOne({ id });
}

async function getAllExperiments() {
  const db = getDB();
  return db.collection('experiments').find().toArray();
}

async function saveExperiment(exp) {
  const db = getDB();
  await db.collection('experiments').updateOne(
    { id: exp.id },
    { $set: exp },
    { upsert: true }
  );
}

async function deleteExperiment(id) {
  const db = getDB();
  await db.collection('experiments').deleteOne({ id });
}

// ========== Assignment Logic ==========

async function assignVariant(sessionId, experiment) {
  // Sticky: check existing assignment
  if (experiment.assignments[sessionId]) {
    return experiment.assignments[sessionId];
  }

  // Deterministic hash of sessionId + experimentId -> bucket 0-99
  let hash = 0;
  const key = sessionId + experiment.id;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  const bucket = Math.abs(hash) % 100;

  // Walk variants, accumulate traffic percentages
  let cumulative = 0;
  let variantId = experiment.variants[0]?.id || 'control';
  for (const variant of experiment.variants) {
    cumulative += variant.trafficPercent;
    if (bucket < cumulative) {
      variantId = variant.id;
      break;
    }
  }

  // Persist assignment
  experiment.assignments[sessionId] = variantId;
  await saveExperiment(experiment);
  return variantId;
}

// ========== Config Resolution ==========

export async function resolveExperimentConfig(sessionId) {
  const globalOverrides = getGlobalListingOverrides ? await getGlobalListingOverrides() : {};

  // Find the running experiment (only one allowed)
  const allExperiments = await getAllExperiments();
  const activeExperiment = allExperiments.find(e => e.status === 'running');

  if (!activeExperiment) {
    return { config: await loadConfig(), experimentId: null, variantId: null, listingOverrides: globalOverrides };
  }

  // Check targeting rules
  const session = sessions.get(sessionId);
  if (activeExperiment.targeting?.agentOnly && session && !session.isAgent) {
    return { config: await loadConfig(), experimentId: null, variantId: null, listingOverrides: globalOverrides };
  }
  if (activeExperiment.targeting?.regularOnly && session && session.isAgent) {
    return { config: await loadConfig(), experimentId: null, variantId: null, listingOverrides: globalOverrides };
  }

  // Assign or retrieve variant
  const variantId = await assignVariant(sessionId, activeExperiment);
  const variant = activeExperiment.variants.find(v => v.id === variantId);

  if (!variant || !activeExperiment.baseConfig) {
    return { config: await loadConfig(), experimentId: null, variantId: null, listingOverrides: globalOverrides };
  }

  // Merge base config + variant overrides (per-section shallow merge)
  const config = {
    pricing:  { ...activeExperiment.baseConfig.pricing,  ...(variant.overrides?.pricing || {}) },
    scores:   { ...activeExperiment.baseConfig.scores,   ...(variant.overrides?.scores || {}) },
    demand:   { ...activeExperiment.baseConfig.demand,   ...(variant.overrides?.demand || {}) },
    seller:   { ...activeExperiment.baseConfig.seller,   ...(variant.overrides?.seller || {}) },
    content:  { ...activeExperiment.baseConfig.content,  ...(variant.overrides?.content || {}) },
    api:      { ...activeExperiment.baseConfig.api,      ...(variant.overrides?.api || {}) },
    behavior: { ...activeExperiment.baseConfig.behavior, ...(variant.overrides?.behavior || {}) },
  };

  // Merge global listing overrides + variant-specific listing overrides
  const mergedListingOverrides = { ...globalOverrides };
  if (variant.listingOverrides) {
    for (const [id, fields] of Object.entries(variant.listingOverrides)) {
      mergedListingOverrides[id] = { ...(mergedListingOverrides[id] || {}), ...fields };
    }
  }

  return { config, experimentId: activeExperiment.id, variantId, listingOverrides: mergedListingOverrides };
}

export async function getActiveExperiment() {
  const allExperiments = await getAllExperiments();
  return allExperiments.find(e => e.status === 'running') || null;
}

// ========== Scenario Loader Helper ==========

async function loadScenarioConfig(scenarioName) {
  try {
    const db = getDB();
    const scenario = await db.collection('scenarios').findOne({ name: scenarioName });
    return scenario?.config || null;
  } catch (error) {
    console.error('Error loading scenario for experiment:', error);
    return null;
  }
}

// ========== API Routes ==========

// List experiments
router.get('/api/experiments', async (req, res) => {
  let result = await getAllExperiments();

  if (req.query.status) {
    result = result.filter(e => e.status === req.query.status);
  }

  // Sort by most recent
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Don't send full assignments in list view (can be large)
  const summary = result.map(exp => ({
    ...exp,
    _id: undefined,
    assignmentCount: Object.keys(exp.assignments).length,
    assignments: undefined
  }));

  res.json(summary);
});

// Get single experiment
router.get('/api/experiments/:id', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  res.json({
    ...exp,
    _id: undefined,
    assignmentCount: Object.keys(exp.assignments).length
  });
});

// Create experiment
router.post('/api/experiments', async (req, res) => {
  const { name, hypothesis, baseConfigSource, variants, targeting } = req.body;

  if (!name || !hypothesis) {
    return res.status(400).json({ error: 'name and hypothesis are required' });
  }
  if (!variants || variants.length < 2) {
    return res.status(400).json({ error: 'At least 2 variants are required' });
  }

  const totalTraffic = variants.reduce((sum, v) => sum + (v.trafficPercent || 0), 0);
  if (totalTraffic !== 100) {
    return res.status(400).json({ error: 'Traffic percentages must sum to 100' });
  }

  const experiment = {
    id: generateExperimentId(),
    name,
    hypothesis,
    status: 'draft',
    baseConfigSource: baseConfigSource || 'current',
    baseConfig: null,
    variants: variants.map((v, i) => ({
      id: v.id || (i === 0 ? 'control' : `variant_${String.fromCharCode(97 + i - 1)}`),
      name: v.name || (i === 0 ? 'Control' : `Variant ${String.fromCharCode(65 + i - 1)}`),
      description: v.description || '',
      overrides: v.overrides || {},
      listingOverrides: v.listingOverrides || {},
      trafficPercent: v.trafficPercent
    })),
    assignments: {},
    targeting: targeting || { agentOnly: false, regularOnly: false },
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };

  await saveExperiment(experiment);
  res.status(201).json(experiment);
});

// Update experiment (draft/paused only)
router.put('/api/experiments/:id', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'draft' && exp.status !== 'paused') {
    return res.status(400).json({ error: 'Can only update draft or paused experiments' });
  }

  const { name, hypothesis, baseConfigSource, variants, targeting } = req.body;

  if (name) exp.name = name;
  if (hypothesis) exp.hypothesis = hypothesis;
  if (baseConfigSource) exp.baseConfigSource = baseConfigSource;
  if (targeting) exp.targeting = targeting;

  if (variants) {
    const totalTraffic = variants.reduce((sum, v) => sum + (v.trafficPercent || 0), 0);
    if (totalTraffic !== 100) {
      return res.status(400).json({ error: 'Traffic percentages must sum to 100' });
    }
    exp.variants = variants.map((v, i) => ({
      id: v.id || (i === 0 ? 'control' : `variant_${String.fromCharCode(97 + i - 1)}`),
      name: v.name || (i === 0 ? 'Control' : `Variant ${String.fromCharCode(65 + i - 1)}`),
      description: v.description || '',
      overrides: v.overrides || {},
      listingOverrides: v.listingOverrides || {},
      trafficPercent: v.trafficPercent
    }));
  }

  await saveExperiment(exp);
  res.json(exp);
});

// Start experiment
router.post('/api/experiments/:id/start', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'draft' && exp.status !== 'paused') {
    return res.status(400).json({ error: 'Can only start draft or paused experiments' });
  }

  // Check no other experiment is running
  const allExps = await getAllExperiments();
  const running = allExps.find(e => e.status === 'running' && e.id !== exp.id);
  if (running) {
    return res.status(400).json({ error: `Experiment "${running.name}" is already running. Pause or complete it first.` });
  }

  // Validate traffic split
  const totalTraffic = exp.variants.reduce((sum, v) => sum + v.trafficPercent, 0);
  if (totalTraffic !== 100) {
    return res.status(400).json({ error: 'Traffic percentages must sum to 100' });
  }

  // Snapshot base config
  if (exp.baseConfigSource === 'current') {
    exp.baseConfig = await loadConfig();
  } else if (exp.baseConfigSource.startsWith('scenario:')) {
    const scenarioName = exp.baseConfigSource.replace('scenario:', '');
    const scenarioConfig = await loadScenarioConfig(scenarioName);
    if (!scenarioConfig) {
      return res.status(400).json({ error: `Scenario "${scenarioName}" not found` });
    }
    const baseConfig = await loadConfig();
    exp.baseConfig = {
      pricing:  { ...baseConfig.pricing,  ...(scenarioConfig.pricing || {}) },
      scores:   { ...baseConfig.scores,   ...(scenarioConfig.scores || {}) },
      demand:   { ...baseConfig.demand,   ...(scenarioConfig.demand || {}) },
      seller:   { ...baseConfig.seller,   ...(scenarioConfig.seller || {}) },
      content:  { ...baseConfig.content,  ...(scenarioConfig.content || {}) },
      api:      { ...baseConfig.api,      ...(scenarioConfig.api || {}) },
      behavior: { ...baseConfig.behavior, ...(scenarioConfig.behavior || {}) },
    };
  }

  exp.status = 'running';
  exp.startedAt = exp.startedAt || new Date().toISOString();

  await saveExperiment(exp);
  res.json(exp);
});

// Pause experiment
router.post('/api/experiments/:id/pause', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'running') {
    return res.status(400).json({ error: 'Can only pause running experiments' });
  }

  exp.status = 'paused';
  await saveExperiment(exp);
  res.json(exp);
});

// Complete experiment
router.post('/api/experiments/:id/complete', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'running' && exp.status !== 'paused') {
    return res.status(400).json({ error: 'Can only complete running or paused experiments' });
  }

  exp.status = 'completed';
  exp.completedAt = new Date().toISOString();
  await saveExperiment(exp);
  res.json(exp);
});

// Delete experiment (draft/completed only)
router.delete('/api/experiments/:id', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'draft' && exp.status !== 'completed') {
    return res.status(400).json({ error: 'Can only delete draft or completed experiments' });
  }

  await deleteExperiment(exp.id);
  res.json({ success: true });
});

// Results endpoint
router.get('/api/experiments/:id/results', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }

  // Get logs and sessions for this experiment
  const expLogs = requestLogs.filter(log => log.experimentId === exp.id);
  const expSessionIds = new Set(Object.keys(exp.assignments));

  // Build per-variant results
  const variantResults = {};
  for (const variant of exp.variants) {
    const variantSessionIds = Object.entries(exp.assignments)
      .filter(([, vid]) => vid === variant.id)
      .map(([sid]) => sid);

    const variantLogs = expLogs.filter(log => variantSessionIds.includes(log.sessionId));
    const variantSessions = variantSessionIds
      .map(sid => sessions.get(sid))
      .filter(Boolean);

    const agentSessions = variantSessions.filter(s => s.isAgent);
    const durations = variantSessions.map(s =>
      new Date(s.lastActivity).getTime() - new Date(s.startTime).getTime()
    );
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const avgRequests = variantSessions.length > 0
      ? Math.round(variantSessions.reduce((sum, s) => sum + s.requestCount, 0) / variantSessions.length)
      : 0;

    // Funnel analysis
    const funnelStages = [
      { name: 'Browse Events', pattern: /^\/api\/events$/ },
      { name: 'View Event', pattern: /^\/api\/events\/\d+$/ },
      { name: 'View Listings', pattern: /^\/api\/events\/\d+\/listings$/ },
      { name: 'Listing Detail', pattern: /^\/api\/listings\/\d+$/ },
      { name: 'Add to Cart', pattern: /^\/api\/cart$/, method: 'POST' },
      { name: 'Checkout', pattern: /^\/api\/checkout$/, method: 'POST' }
    ];

    const funnel = funnelStages.map(stage => {
      const sessionsAtStage = variantSessions.filter(s =>
        s.pagesVisited.some(p => stage.pattern.test(p))
      );
      return {
        name: stage.name,
        count: sessionsAtStage.length,
        percent: variantSessions.length > 0
          ? Math.round((sessionsAtStage.length / variantSessions.length) * 100)
          : 0
      };
    });

    // Journey patterns (top 5 most common page sequences)
    const journeyMap = {};
    for (const session of variantSessions) {
      const key = session.pagesVisited
        .filter(p => !p.startsWith('/api/logs') && !p.startsWith('/api/sessions') && !p.startsWith('/api/experiments') && !p.startsWith('/api/config'))
        .slice(0, 10)
        .join(' → ');
      if (key) {
        journeyMap[key] = (journeyMap[key] || 0) + 1;
      }
    }
    const topJourneys = Object.entries(journeyMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([journey, count]) => ({ journey, count }));

    variantResults[variant.id] = {
      variantId: variant.id,
      variantName: variant.name,
      overrides: variant.overrides,
      sessionCount: variantSessions.length,
      agentSessions: agentSessions.length,
      regularSessions: variantSessions.length - agentSessions.length,
      totalRequests: variantLogs.length,
      avgRequestsPerSession: avgRequests,
      avgDurationMs: avgDuration,
      funnel,
      topJourneys
    };
  }

  // Config diff (the overrides themselves are the diff)
  const configDiff = exp.variants.map(v => ({
    variantId: v.id,
    variantName: v.name,
    overrides: v.overrides
  }));

  res.json({
    experimentId: exp.id,
    experimentName: exp.name,
    hypothesis: exp.hypothesis,
    status: exp.status,
    totalSessions: expSessionIds.size,
    variants: variantResults,
    configDiff
  });
});

// Export experiment data
router.get('/api/experiments/:id/export', async (req, res) => {
  const exp = await getExperiment(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }

  const expLogs = requestLogs.filter(log => log.experimentId === exp.id);
  const expSessions = Object.keys(exp.assignments)
    .map(sid => sessions.get(sid))
    .filter(Boolean);

  res.json({
    experiment: exp,
    sessions: expSessions,
    requestLogs: expLogs
  });
});

// ========== Init ==========

export function initExperiments({ sessions: s, requestLogs: r, loadConfig: lc, getGlobalListingOverrides: glo, logsDir: ld, configDir: cd }) {
  sessions = s;
  requestLogs = r;
  loadConfig = lc;
  getGlobalListingOverrides = glo || null;
}

export default router;
