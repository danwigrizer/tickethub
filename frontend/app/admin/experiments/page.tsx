'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

interface Variant {
  id: string
  name: string
  description: string
  overrides: Record<string, Record<string, any>>
  trafficPercent: number
}

interface Experiment {
  id: string
  name: string
  hypothesis: string
  status: 'draft' | 'running' | 'paused' | 'completed'
  baseConfigSource: string
  baseConfig: any
  variants: Variant[]
  assignmentCount: number
  targeting: { agentOnly: boolean; regularOnly: boolean }
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

interface Scenario {
  name: string
  description: string
  config: any
}

// All config fields that can be overridden
const CONFIG_FIELDS = {
  ui: {
    priceFormat: { type: 'select', options: ['currency_symbol', 'currency_code', 'number_only'], label: 'Price Format' },
    dateFormat: { type: 'select', options: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'full'], label: 'Date Format' },
    currency: { type: 'select', options: ['USD', 'EUR', 'GBP'], label: 'Currency' },
    urgencyMessages: { type: 'toggle', label: 'Urgency Messages' },
    stockCounts: { type: 'toggle', label: 'Stock Counts' },
    showFees: { type: 'toggle', label: 'Show Fees' },
    buttonText: { type: 'text', label: 'Button Text' },
  },
  api: {
    responseFormat: { type: 'select', options: ['nested', 'flat'], label: 'Response Format' },
    includeFees: { type: 'toggle', label: 'Include Fees' },
    includeAvailability: { type: 'toggle', label: 'Include Availability' },
    includePriceHistory: { type: 'toggle', label: 'Price History' },
    includeDealScore: { type: 'toggle', label: 'Deal Score' },
    includeValueScore: { type: 'toggle', label: 'Value Score' },
    includeSavingsInfo: { type: 'toggle', label: 'Savings Info' },
    includeDemandIndicators: { type: 'toggle', label: 'Demand Indicators' },
    includeBundleOptions: { type: 'toggle', label: 'Bundle Options' },
    includeRefundPolicy: { type: 'toggle', label: 'Refund Policy' },
    includeTransferMethod: { type: 'toggle', label: 'Transfer Method' },
    includeSellerDetails: { type: 'toggle', label: 'Seller Details' },
    includeDealFlags: { type: 'toggle', label: 'Deal Flags' },
    includePremiumFeatures: { type: 'toggle', label: 'Premium Features' },
    includeRelativeValue: { type: 'toggle', label: 'Relative Value' },
  },
  content: {
    eventDescriptions: { type: 'select', options: ['detailed', 'brief', 'minimal'], label: 'Event Descriptions' },
    venueInfo: { type: 'select', options: ['full', 'name_only', 'address_only'], label: 'Venue Info' },
    showReviews: { type: 'toggle', label: 'Show Reviews' },
    showRatings: { type: 'toggle', label: 'Show Ratings' },
  },
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  running: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
}

function formatOverrides(overrides: Record<string, Record<string, any>>): string[] {
  const items: string[] = []
  for (const [section, fields] of Object.entries(overrides)) {
    for (const [field, value] of Object.entries(fields)) {
      items.push(`${section}.${field}: ${JSON.stringify(value)}`)
    }
  }
  return items
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Create form state
  const [formName, setFormName] = useState('')
  const [formHypothesis, setFormHypothesis] = useState('')
  const [formBaseSource, setFormBaseSource] = useState('current')
  const [formTargeting, setFormTargeting] = useState({ agentOnly: false, regularOnly: false })
  const [formVariants, setFormVariants] = useState<Array<{
    id: string; name: string; description: string;
    overrides: Record<string, Record<string, any>>; trafficPercent: number
  }>>([
    { id: 'control', name: 'Control', description: '', overrides: {}, trafficPercent: 50 },
    { id: 'variant_a', name: 'Variant A', description: '', overrides: {}, trafficPercent: 50 },
  ])
  const [editingOverrides, setEditingOverrides] = useState<number | null>(null)

  const fetchExperiments = async () => {
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await fetch(`${API_URL}/experiments${params}`)
      const data = await res.json()
      setExperiments(data)
    } catch (err) {
      console.error('Error fetching experiments:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchScenarios = async () => {
    try {
      const res = await fetch(`${API_URL}/scenarios`)
      const data = await res.json()
      setScenarios(data)
    } catch (err) {
      console.error('Error fetching scenarios:', err)
    }
  }

  useEffect(() => { fetchExperiments(); fetchScenarios() }, [statusFilter])

  const createExperiment = async (startImmediately: boolean) => {
    setError('')
    setSuccess('')

    if (!formName || !formHypothesis) {
      setError('Name and hypothesis are required')
      return
    }

    const totalTraffic = formVariants.reduce((sum, v) => sum + v.trafficPercent, 0)
    if (totalTraffic !== 100) {
      setError(`Traffic percentages must sum to 100 (currently ${totalTraffic})`)
      return
    }

    try {
      const res = await fetch(`${API_URL}/experiments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          hypothesis: formHypothesis,
          baseConfigSource: formBaseSource,
          variants: formVariants,
          targeting: formTargeting
        })
      })
      const exp = await res.json()
      if (!res.ok) { setError(exp.error); return }

      if (startImmediately) {
        const startRes = await fetch(`${API_URL}/experiments/${exp.id}/start`, { method: 'POST' })
        const startData = await startRes.json()
        if (!startRes.ok) { setError(startData.error); return }
      }

      setSuccess(`Experiment "${formName}" ${startImmediately ? 'created and started' : 'saved as draft'}`)
      setShowCreate(false)
      resetForm()
      fetchExperiments()
    } catch (err) {
      setError('Failed to create experiment')
    }
  }

  const performAction = async (id: string, action: string) => {
    try {
      const res = await fetch(`${API_URL}/experiments/${id}/${action}`, { method: action === 'delete' ? 'DELETE' : 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setSuccess(`Experiment ${action}${action.endsWith('e') ? 'd' : 'ed'} successfully`)
      fetchExperiments()
    } catch (err) {
      setError(`Failed to ${action} experiment`)
    }
  }

  const deleteExperiment = async (id: string) => {
    if (!confirm('Delete this experiment?')) return
    try {
      const res = await fetch(`${API_URL}/experiments/${id}`, { method: 'DELETE' })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      fetchExperiments()
    } catch (err) {
      setError('Failed to delete experiment')
    }
  }

  const resetForm = () => {
    setFormName(''); setFormHypothesis(''); setFormBaseSource('current')
    setFormTargeting({ agentOnly: false, regularOnly: false })
    setFormVariants([
      { id: 'control', name: 'Control', description: '', overrides: {}, trafficPercent: 50 },
      { id: 'variant_a', name: 'Variant A', description: '', overrides: {}, trafficPercent: 50 },
    ])
    setEditingOverrides(null)
  }

  const addVariant = () => {
    const idx = formVariants.length
    const letter = String.fromCharCode(97 + idx - 1)
    setFormVariants([...formVariants, {
      id: `variant_${letter}`,
      name: `Variant ${letter.toUpperCase()}`,
      description: '',
      overrides: {},
      trafficPercent: 0
    }])
  }

  const updateVariant = (index: number, field: string, value: any) => {
    const updated = [...formVariants]
    ;(updated[index] as any)[field] = value
    setFormVariants(updated)
  }

  const toggleOverride = (variantIndex: number, section: string, field: string, defaultValue: any) => {
    const updated = [...formVariants]
    const overrides = { ...updated[variantIndex].overrides }

    if (overrides[section]?.[field] !== undefined) {
      // Remove override
      const sectionOverrides = { ...overrides[section] }
      delete sectionOverrides[field]
      if (Object.keys(sectionOverrides).length === 0) {
        delete overrides[section]
      } else {
        overrides[section] = sectionOverrides
      }
    } else {
      // Add override with toggled/changed value
      if (!overrides[section]) overrides[section] = {}
      if (typeof defaultValue === 'boolean') {
        overrides[section] = { ...overrides[section], [field]: !defaultValue }
      } else {
        overrides[section] = { ...overrides[section], [field]: defaultValue }
      }
    }

    updated[variantIndex].overrides = overrides
    setFormVariants(updated)
  }

  const setOverrideValue = (variantIndex: number, section: string, field: string, value: any) => {
    const updated = [...formVariants]
    if (!updated[variantIndex].overrides[section]) {
      updated[variantIndex].overrides[section] = {}
    }
    updated[variantIndex].overrides[section] = {
      ...updated[variantIndex].overrides[section],
      [field]: value
    }
    setFormVariants(updated)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link href="/" className="text-2xl font-bold text-blue-600">TicketHub</Link>
            <Link href="/" className="text-gray-600 hover:text-gray-900">Back to Site</Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Nav tabs */}
        <div className="flex gap-6 mb-8 border-b">
          <Link href="/admin" className="pb-2 font-semibold text-gray-500 hover:text-gray-900">Configuration</Link>
          <Link href="/admin/sessions" className="pb-2 font-semibold text-gray-500 hover:text-gray-900">Sessions</Link>
          <span className="pb-2 font-semibold border-b-2 border-blue-600 text-blue-600">Experiments</span>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">A/B Experiments</h1>
            <p className="text-gray-600 mt-1">Test how different configurations affect AI agent behavior.</p>
          </div>
          <button
            onClick={() => { setShowCreate(!showCreate); if (!showCreate) resetForm() }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            {showCreate ? 'Cancel' : 'New Experiment'}
          </button>
        </div>

        {/* Messages */}
        {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg">{success}</div>}

        {/* Create Form */}
        {showCreate && (
          <div className="bg-white rounded-lg border shadow-sm p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Create Experiment</h2>

            <div className="grid grid-cols-1 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="e.g., Deal Flags Impact on AI Behavior"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hypothesis *</label>
                <textarea
                  value={formHypothesis} onChange={e => setFormHypothesis(e.target.value)}
                  placeholder="e.g., AI agents will reference deal quality less when deal flags are removed from the API response"
                  className="w-full border rounded-lg px-3 py-2" rows={2}
                />
              </div>
            </div>

            {/* Base Config */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Config</label>
              <select
                value={formBaseSource} onChange={e => setFormBaseSource(e.target.value)}
                className="border rounded-lg px-3 py-2"
              >
                <option value="current">Current Global Config</option>
                {scenarios.map(s => (
                  <option key={s.name} value={`scenario:${s.name}`}>{s.name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Base config is snapshotted when the experiment starts.</p>
            </div>

            {/* Targeting */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Targeting</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="targeting" checked={!formTargeting.agentOnly && !formTargeting.regularOnly}
                    onChange={() => setFormTargeting({ agentOnly: false, regularOnly: false })} />
                  All sessions
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="targeting" checked={formTargeting.agentOnly}
                    onChange={() => setFormTargeting({ agentOnly: true, regularOnly: false })} />
                  Agents only
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="targeting" checked={formTargeting.regularOnly}
                    onChange={() => setFormTargeting({ agentOnly: false, regularOnly: true })} />
                  Regular sessions only
                </label>
              </div>
            </div>

            {/* Variants */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Variants</label>
                <button onClick={addVariant} className="text-sm text-blue-600 hover:text-blue-800">+ Add Variant</button>
              </div>

              <div className="space-y-4">
                {formVariants.map((variant, vi) => (
                  <div key={vi} className="border rounded-lg p-4">
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <input
                        value={variant.name}
                        onChange={e => updateVariant(vi, 'name', e.target.value)}
                        placeholder="Variant name"
                        className="border rounded px-2 py-1.5 text-sm"
                      />
                      <input
                        value={variant.description}
                        onChange={e => updateVariant(vi, 'description', e.target.value)}
                        placeholder="Description"
                        className="border rounded px-2 py-1.5 text-sm col-span-2"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} max={100}
                          value={variant.trafficPercent}
                          onChange={e => updateVariant(vi, 'trafficPercent', parseInt(e.target.value) || 0)}
                          className="border rounded px-2 py-1.5 text-sm w-20"
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                    </div>

                    {/* Overrides summary */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {formatOverrides(variant.overrides).length === 0 ? (
                        <span className="text-xs text-gray-400">No overrides (uses base config)</span>
                      ) : (
                        formatOverrides(variant.overrides).map((item, i) => (
                          <span key={i} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                            {item}
                          </span>
                        ))
                      )}
                      <button
                        onClick={() => setEditingOverrides(editingOverrides === vi ? null : vi)}
                        className="text-xs text-blue-600 hover:text-blue-800 ml-2"
                      >
                        {editingOverrides === vi ? 'Close editor' : 'Edit overrides'}
                      </button>
                    </div>

                    {/* Override editor */}
                    {editingOverrides === vi && (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-xs text-gray-500 mb-2">Click a field to override it. Click again to remove the override.</p>
                        {Object.entries(CONFIG_FIELDS).map(([section, fields]) => (
                          <div key={section} className="mb-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{section}</div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                              {Object.entries(fields).map(([field, meta]) => {
                                const isOverridden = variant.overrides[section]?.[field] !== undefined
                                const overrideValue = variant.overrides[section]?.[field]

                                return (
                                  <div
                                    key={field}
                                    className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer transition-colors ${
                                      isOverridden ? 'bg-orange-50 border border-orange-200' : 'hover:bg-gray-50'
                                    }`}
                                  >
                                    {meta.type === 'toggle' ? (
                                      <>
                                        <input
                                          type="checkbox"
                                          checked={isOverridden}
                                          onChange={() => toggleOverride(vi, section, field, true)}
                                          className="rounded"
                                        />
                                        <span className={isOverridden ? 'font-medium' : 'text-gray-500'}>{meta.label}</span>
                                        {isOverridden && (
                                          <select
                                            value={overrideValue ? 'true' : 'false'}
                                            onChange={e => setOverrideValue(vi, section, field, e.target.value === 'true')}
                                            className="ml-auto border rounded px-1 py-0.5 text-xs"
                                          >
                                            <option value="true">true</option>
                                            <option value="false">false</option>
                                          </select>
                                        )}
                                      </>
                                    ) : meta.type === 'select' ? (
                                      <>
                                        <input
                                          type="checkbox"
                                          checked={isOverridden}
                                          onChange={() => toggleOverride(vi, section, field, (meta as any).options[0])}
                                          className="rounded"
                                        />
                                        <span className={isOverridden ? 'font-medium' : 'text-gray-500'}>{meta.label}</span>
                                        {isOverridden && (
                                          <select
                                            value={overrideValue}
                                            onChange={e => setOverrideValue(vi, section, field, e.target.value)}
                                            className="ml-auto border rounded px-1 py-0.5 text-xs"
                                          >
                                            {(meta as any).options.map((opt: string) => (
                                              <option key={opt} value={opt}>{opt}</option>
                                            ))}
                                          </select>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <input
                                          type="checkbox"
                                          checked={isOverridden}
                                          onChange={() => toggleOverride(vi, section, field, '')}
                                          className="rounded"
                                        />
                                        <span className={isOverridden ? 'font-medium' : 'text-gray-500'}>{meta.label}</span>
                                        {isOverridden && (
                                          <input
                                            type="text"
                                            value={overrideValue || ''}
                                            onChange={e => setOverrideValue(vi, section, field, e.target.value)}
                                            className="ml-auto border rounded px-1 py-0.5 text-xs w-24"
                                          />
                                        )}
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Traffic total */}
              {(() => {
                const total = formVariants.reduce((s, v) => s + v.trafficPercent, 0)
                return total !== 100 ? (
                  <p className="text-sm text-red-600 mt-2">Traffic split: {total}% (must equal 100%)</p>
                ) : (
                  <p className="text-sm text-green-600 mt-2">Traffic split: 100%</p>
                )
              })()}
            </div>

            {/* Actions */}
            <div className="flex gap-3 border-t pt-4">
              <button
                onClick={() => createExperiment(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 font-medium text-sm"
              >
                Save as Draft
              </button>
              <button
                onClick={() => createExperiment(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
              >
                Save & Start
              </button>
            </div>
          </div>
        )}

        {/* Status filter */}
        <div className="flex gap-2 mb-4">
          {['all', 'running', 'draft', 'paused', 'completed'].map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                statusFilter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Experiment list */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : experiments.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-lg border">
            No experiments found. Create one to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {experiments.map(exp => (
              <div key={exp.id} className="bg-white rounded-lg border p-4 hover:border-gray-300 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <Link href={`/admin/experiments/${exp.id}`} className="text-lg font-semibold hover:text-blue-600">
                        {exp.name}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[exp.status]}`}>
                        {exp.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{exp.hypothesis}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{exp.variants.length} variants</span>
                      <span>{exp.assignmentCount} sessions</span>
                      <span>Created {new Date(exp.createdAt).toLocaleDateString()}</span>
                      {exp.startedAt && <span>Started {new Date(exp.startedAt).toLocaleDateString()}</span>}
                    </div>
                    {/* Override summary per variant */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {exp.variants.map(v => {
                        const overrideItems = formatOverrides(v.overrides)
                        return (
                          <span key={v.id} className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                            {v.name}: {overrideItems.length === 0 ? 'base' : overrideItems.join(', ')}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {exp.status === 'draft' && (
                      <>
                        <button onClick={() => performAction(exp.id, 'start')} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700">Start</button>
                        <button onClick={() => deleteExperiment(exp.id)} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                      </>
                    )}
                    {exp.status === 'running' && (
                      <>
                        <button onClick={() => performAction(exp.id, 'pause')} className="text-xs px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700">Pause</button>
                        <button onClick={() => performAction(exp.id, 'complete')} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">Complete</button>
                      </>
                    )}
                    {exp.status === 'paused' && (
                      <>
                        <button onClick={() => performAction(exp.id, 'start')} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700">Resume</button>
                        <button onClick={() => performAction(exp.id, 'complete')} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">Complete</button>
                      </>
                    )}
                    {exp.status === 'completed' && (
                      <button onClick={() => deleteExperiment(exp.id)} className="text-xs px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                    )}
                    <Link href={`/admin/experiments/${exp.id}`} className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50">
                      {exp.status === 'completed' ? 'Results' : 'Details'}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
