'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
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
  assignments: Record<string, string>
  assignmentCount: number
  targeting: { agentOnly: boolean; regularOnly: boolean }
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

interface FunnelStage {
  name: string
  count: number
  percent: number
}

interface VariantResult {
  variantId: string
  variantName: string
  overrides: Record<string, Record<string, any>>
  sessionCount: number
  agentSessions: number
  regularSessions: number
  totalRequests: number
  avgRequestsPerSession: number
  avgDurationMs: number
  funnel: FunnelStage[]
  topJourneys: Array<{ journey: string; count: number }>
}

interface Results {
  experimentId: string
  experimentName: string
  hypothesis: string
  status: string
  totalSessions: number
  variants: Record<string, VariantResult>
  configDiff: Array<{ variantId: string; variantName: string; overrides: Record<string, Record<string, any>> }>
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  running: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
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

export default function ExperimentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [experiment, setExperiment] = useState<Experiment | null>(null)
  const [results, setResults] = useState<Results | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchExperiment = async () => {
    try {
      const [expRes, resultsRes] = await Promise.all([
        fetch(`${API_URL}/experiments/${id}`),
        fetch(`${API_URL}/experiments/${id}/results`)
      ])
      if (!expRes.ok) { setError('Experiment not found'); return }
      setExperiment(await expRes.json())
      setResults(await resultsRes.json())
    } catch (err) {
      setError('Failed to load experiment')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchExperiment() }, [id])

  const performAction = async (action: string) => {
    try {
      const res = await fetch(`${API_URL}/experiments/${id}/${action}`, { method: 'POST' })
      if (!res.ok) { const d = await res.json(); setError(d.error); return }
      fetchExperiment()
    } catch (err) {
      setError(`Failed to ${action}`)
    }
  }

  const exportResults = async () => {
    try {
      const res = await fetch(`${API_URL}/experiments/${id}/export`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `experiment-${id}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError('Failed to export')
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">Loading...</div>
  if (!experiment) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500">{error || 'Not found'}</div>

  const variantResults = results ? Object.values(results.variants) : []
  const maxFunnelCount = Math.max(...variantResults.flatMap(v => v.funnel.map(f => f.count)), 1)

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
          <Link href="/admin/experiments" className="pb-2 font-semibold border-b-2 border-blue-600 text-blue-600">Experiments</Link>
        </div>

        {error && <div className="mb-4 p-3 bg-red-100 text-red-800 rounded-lg">{error}</div>}

        {/* Header */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Link href="/admin/experiments" className="text-gray-400 hover:text-gray-600">&larr;</Link>
                <h1 className="text-2xl font-bold">{experiment.name}</h1>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[experiment.status]}`}>
                  {experiment.status}
                </span>
              </div>
              <p className="text-gray-600 mb-3">{experiment.hypothesis}</p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>Base: {experiment.baseConfigSource}</span>
                <span>Created: {new Date(experiment.createdAt).toLocaleString()}</span>
                {experiment.startedAt && <span>Started: {new Date(experiment.startedAt).toLocaleString()}</span>}
                {experiment.completedAt && <span>Completed: {new Date(experiment.completedAt).toLocaleString()}</span>}
                {experiment.targeting?.agentOnly && <span className="text-orange-600">Agents only</span>}
                {experiment.targeting?.regularOnly && <span className="text-blue-600">Regular only</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {experiment.status === 'draft' && (
                <button onClick={() => performAction('start')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Start</button>
              )}
              {experiment.status === 'running' && (
                <>
                  <button onClick={() => performAction('pause')} className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium">Pause</button>
                  <button onClick={() => performAction('complete')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Complete</button>
                </>
              )}
              {experiment.status === 'paused' && (
                <>
                  <button onClick={() => performAction('start')} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Resume</button>
                  <button onClick={() => performAction('complete')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Complete</button>
                </>
              )}
              <button onClick={exportResults} className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm font-medium">Export JSON</button>
            </div>
          </div>
        </div>

        {/* Config Diff - What's Being Tested */}
        <div className="bg-white rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">What&apos;s Being Tested</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {experiment.variants.map(v => {
              const overrideItems = formatOverrides(v.overrides)
              return (
                <div key={v.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{v.name}</span>
                    <span className="text-xs text-gray-500">{v.trafficPercent}% traffic</span>
                  </div>
                  {v.description && <p className="text-xs text-gray-500 mb-2">{v.description}</p>}
                  {overrideItems.length === 0 ? (
                    <div className="text-xs text-gray-400 italic">No overrides — uses base config</div>
                  ) : (
                    <div className="space-y-1">
                      {overrideItems.map((item, i) => (
                        <div key={i} className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded font-mono">
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Results */}
        {results && (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {variantResults.map(v => (
                <div key={v.variantId} className="bg-white rounded-lg border p-4">
                  <div className="text-xs text-gray-500 mb-1">{v.variantName}</div>
                  <div className="text-2xl font-bold">{v.sessionCount}</div>
                  <div className="text-xs text-gray-500">
                    sessions ({v.agentSessions} agent, {v.regularSessions} regular)
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    {v.avgRequestsPerSession} avg reqs &middot; {formatDuration(v.avgDurationMs)} avg duration
                  </div>
                </div>
              ))}
            </div>

            {/* Funnel Comparison */}
            <div className="bg-white rounded-lg border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Funnel Comparison</h2>
              <div className="space-y-4">
                {['Browse Events', 'View Event', 'View Listings', 'Listing Detail', 'Add to Cart', 'Checkout'].map(stage => (
                  <div key={stage}>
                    <div className="text-sm font-medium text-gray-700 mb-1">{stage}</div>
                    <div className="space-y-1">
                      {variantResults.map(v => {
                        const funnelStage = v.funnel.find(f => f.name === stage)
                        const count = funnelStage?.count || 0
                        const percent = funnelStage?.percent || 0
                        const width = maxFunnelCount > 0 ? (count / maxFunnelCount) * 100 : 0
                        const colors = v.variantId === 'control' ? 'bg-blue-500' : 'bg-orange-500'
                        return (
                          <div key={v.variantId} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-24 truncate">{v.variantName}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-4">
                              <div className={`${colors} rounded-full h-4 transition-all`} style={{ width: `${width}%` }} />
                            </div>
                            <span className="text-xs text-gray-600 w-20 text-right">
                              {count} ({percent}%)
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Journey Patterns */}
            <div className="bg-white rounded-lg border p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Top Journey Patterns</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {variantResults.map(v => (
                  <div key={v.variantId}>
                    <h3 className="text-sm font-medium mb-2">{v.variantName}</h3>
                    {v.topJourneys.length === 0 ? (
                      <div className="text-xs text-gray-400">No journeys recorded</div>
                    ) : (
                      <div className="space-y-2">
                        {v.topJourneys.map((j, i) => (
                          <div key={i} className="text-xs bg-gray-50 p-2 rounded">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">Pattern #{i + 1}</span>
                              <span className="text-gray-500">{j.count} session{j.count !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="font-mono text-gray-600 break-all">{j.journey}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Session Assignments */}
            {experiment.assignments && Object.keys(experiment.assignments).length > 0 && (
              <div className="bg-white rounded-lg border p-6">
                <h2 className="text-lg font-semibold mb-4">Session Assignments ({Object.keys(experiment.assignments).length})</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 text-gray-500">Session ID</th>
                        <th className="text-left py-2 pr-4 text-gray-500">Variant</th>
                        <th className="text-left py-2 text-gray-500">View</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(experiment.assignments).slice(0, 50).map(([sessionId, variantId]) => {
                        const variant = experiment.variants.find(v => v.id === variantId)
                        return (
                          <tr key={sessionId} className="border-b border-gray-100">
                            <td className="py-1.5 pr-4 font-mono text-gray-600">{sessionId}</td>
                            <td className="py-1.5 pr-4">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                variantId === 'control' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                              }`}>
                                {variant?.name || variantId}
                              </span>
                            </td>
                            <td className="py-1.5">
                              <Link href="/admin/sessions" className="text-blue-600 hover:text-blue-800">
                                View session
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {Object.keys(experiment.assignments).length > 50 && (
                    <p className="text-xs text-gray-500 mt-2">Showing first 50 of {Object.keys(experiment.assignments).length} assignments</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
