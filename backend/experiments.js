import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const router = Router();

// Will be set by init()
let sessions = null;
let requestLogs = null;
let loadConfig = null;
let migrateConfig = null;
let migrateOverrides = null;
let logsDir = null;
let configDir = null;

// In-memory store
let experiments = new Map();
let experimentsFile = null;

function generateExperimentId() {
  return `exp_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ========== Persistence ==========

function loadExperiments() {
  if (existsSync(experimentsFile)) {
    try {
      const data = JSON.parse(readFileSync(experimentsFile, 'utf8'));
      for (const exp of data) {
        // Migrate old-schema baseConfig if needed
        if (exp.baseConfig && exp.baseConfig.ui) {
          exp.baseConfig = migrateConfig(exp.baseConfig);
        }
        for (const variant of (exp.variants || [])) {
          if (variant.overrides && (variant.overrides.ui || variant.overrides.api?.includeFees !== undefined)) {
            variant.overrides = migrateOverrides(variant.overrides);
          }
        }
        experiments.set(exp.id, exp);
      }
    } catch (error) {
      console.error('Error loading experiments:', error);
    }
  }
}

let persistTimer = null;
function persistExperiments() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      writeFileSync(experimentsFile, JSON.stringify([...experiments.values()], null, 2));
    } catch (error) {
      console.error('Error persisting experiments:', error);
    }
  }, 2000);
}

// ========== Assignment Logic ==========

function assignVariant(sessionId, experiment) {
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
  persistExperiments();
  return variantId;
}

// ========== Config Resolution ==========

export function resolveExperimentConfig(sessionId) {
  // Find the running experiment (only one allowed)
  const activeExperiment = [...experiments.values()].find(e => e.status === 'running');

  if (!activeExperiment) {
    return { config: loadConfig(), experimentId: null, variantId: null };
  }

  // Check targeting rules
  const session = sessions.get(sessionId);
  if (activeExperiment.targeting?.agentOnly && session && !session.isAgent) {
    return { config: loadConfig(), experimentId: null, variantId: null };
  }
  if (activeExperiment.targeting?.regularOnly && session && session.isAgent) {
    return { config: loadConfig(), experimentId: null, variantId: null };
  }

  // Assign or retrieve variant
  const variantId = assignVariant(sessionId, activeExperiment);
  const variant = activeExperiment.variants.find(v => v.id === variantId);

  if (!variant || !activeExperiment.baseConfig) {
    return { config: loadConfig(), experimentId: null, variantId: null };
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

  return { config, experimentId: activeExperiment.id, variantId };
}

export function getActiveExperiment() {
  return [...experiments.values()].find(e => e.status === 'running') || null;
}

// ========== Scenario Loader Helper ==========

function loadScenarioConfig(scenarioName) {
  const scenariosDir = join(configDir, 'scenarios');
  try {
    const files = readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const content = readFileSync(join(scenariosDir, file), 'utf8');
      const scenario = JSON.parse(content);
      if (scenario.name === scenarioName && scenario.config) {
        return scenario.config;
      }
    }
  } catch (error) {
    console.error('Error loading scenario for experiment:', error);
  }
  return null;
}

// ========== API Routes ==========

// List experiments
router.get('/api/experiments', (req, res) => {
  let result = [...experiments.values()];

  if (req.query.status) {
    result = result.filter(e => e.status === req.query.status);
  }

  // Sort by most recent
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Don't send full assignments in list view (can be large)
  const summary = result.map(exp => ({
    ...exp,
    assignmentCount: Object.keys(exp.assignments).length,
    assignments: undefined
  }));

  res.json(summary);
});

// Get single experiment
router.get('/api/experiments/:id', (req, res) => {
  const exp = experiments.get(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  res.json({
    ...exp,
    assignmentCount: Object.keys(exp.assignments).length
  });
});

// Create experiment
router.post('/api/experiments', (req, res) => {
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
      trafficPercent: v.trafficPercent
    })),
    assignments: {},
    targeting: targeting || { agentOnly: false, regularOnly: false },
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };

  experiments.set(experiment.id, experiment);
  persistExperiments();
  res.status(201).json(experiment);
});

// Update experiment (draft/paused only)
router.put('/api/experiments/:id', (req, res) => {
  const exp = experiments.get(req.params.id);
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
      trafficPercent: v.trafficPercent
    }));
  }

  persistExperiments();
  res.json(exp);
});

// Start experiment
router.post('/api/experiments/:id/start', (req, res) => {
  const exp = experiments.get(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'draft' && exp.status !== 'paused') {
    return res.status(400).json({ error: 'Can only start draft or paused experiments' });
  }

  // Check no other experiment is running
  const running = [...experiments.values()].find(e => e.status === 'running' && e.id !== exp.id);
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
    exp.baseConfig = loadConfig();
  } else if (exp.baseConfigSource.startsWith('scenario:')) {
    const scenarioName = exp.baseConfigSource.replace('scenario:', '');
    const scenarioConfig = loadScenarioConfig(scenarioName);
    if (!scenarioConfig) {
      return res.status(400).json({ error: `Scenario "${scenarioName}" not found` });
    }
    // Merge scenario with defaults (same pattern as loadConfig)
    const DEFAULT_CONFIG = loadConfig(); // get defaults as base
    // Migrate scenario config if it uses old schema
    const sc = (scenarioConfig.ui || (!scenarioConfig.pricing && !scenarioConfig.scores))
      ? migrateConfig(scenarioConfig)
      : scenarioConfig;
    exp.baseConfig = {
      pricing:  { ...DEFAULT_CONFIG.pricing,  ...(sc.pricing || {}) },
      scores:   { ...DEFAULT_CONFIG.scores,   ...(sc.scores || {}) },
      demand:   { ...DEFAULT_CONFIG.demand,   ...(sc.demand || {}) },
      seller:   { ...DEFAULT_CONFIG.seller,   ...(sc.seller || {}) },
      content:  { ...DEFAULT_CONFIG.content,  ...(sc.content || {}) },
      api:      { ...DEFAULT_CONFIG.api,      ...(sc.api || {}) },
      behavior: { ...DEFAULT_CONFIG.behavior, ...(sc.behavior || {}) },
    };
  }

  exp.status = 'running';
  exp.startedAt = exp.startedAt || new Date().toISOString();

  persistExperiments();
  res.json(exp);
});

// Pause experiment
router.post('/api/experiments/:id/pause', (req, res) => {
  const exp = experiments.get(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'running') {
    return res.status(400).json({ error: 'Can only pause running experiments' });
  }

  exp.status = 'paused';
  persistExperiments();
  res.json(exp);
});

// Complete experiment
router.post('/api/experiments/:id/complete', (req, res) => {
  const exp = experiments.get(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'running' && exp.status !== 'paused') {
    return res.status(400).json({ error: 'Can only complete running or paused experiments' });
  }

  exp.status = 'completed';
  exp.completedAt = new Date().toISOString();
  persistExperiments();
  res.json(exp);
});

// Delete experiment (draft/completed only)
router.delete('/api/experiments/:id', (req, res) => {
  const exp = experiments.get(req.params.id);
  if (!exp) {
    return res.status(404).json({ error: 'Experiment not found' });
  }
  if (exp.status !== 'draft' && exp.status !== 'completed') {
    return res.status(400).json({ error: 'Can only delete draft or completed experiments' });
  }

  experiments.delete(exp.id);
  persistExperiments();
  res.json({ success: true });
});

// Results endpoint
router.get('/api/experiments/:id/results', (req, res) => {
  const exp = experiments.get(req.params.id);
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
router.get('/api/experiments/:id/export', (req, res) => {
  const exp = experiments.get(req.params.id);
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

export function initExperiments({ sessions: s, requestLogs: r, loadConfig: lc, migrateConfig: mc, migrateOverrides: mo, logsDir: ld, configDir: cd }) {
  sessions = s;
  requestLogs = r;
  loadConfig = lc;
  migrateConfig = mc;
  migrateOverrides = mo;
  logsDir = ld;
  configDir = cd;
  experimentsFile = join(ld, 'experiments.json');
  loadExperiments();
}

export default router;
