'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

interface SessionRecord {
  id: string
  fingerprint: string
  startTime: string
  lastActivity: string
  requestCount: number
  isAgent: boolean
  userAgent: string
  ip: string
  pagesVisited: string[]
  requestIds: string[]
}

interface SessionStats {
  total: number
  agentSessions: number
  regularSessions: number
  activeSessions: number
  avgRequestCount: number
  avgDurationMs: number
  topPaths: Array<{ path: string; count: number }>
}

interface LogEntry {
  id: string
  sessionId?: string
  timestamp: string
  method: string
  path: string
  fullPath?: string
  query: any
  body: any
  statusCode: number
  duration: number
  durationFormatted: string
  isAgent: boolean
  responseBody: any
  responseBodyString?: string | null
  responseSize?: number
  headers: {
    'user-agent': string
  }
}

interface SessionDetail {
  session: SessionRecord
  requests: LogEntry[]
}

function pathToLabel(path: string): string {
  if (path === '/api/events') return 'Browse Events'
  if (path.match(/^\/api\/events\/\d+$/)) return `Event #${path.split('/').pop()}`
  if (path.match(/^\/api\/events\/\d+\/listings$/)) return 'View Listings'
  if (path.match(/^\/api\/listings\/\d+$/)) return `Listing #${path.split('/').pop()}`
  if (path === '/api/cart') return 'Cart'
  if (path === '/api/checkout') return 'Checkout'
  if (path === '/api/search') return 'Search'
  if (path === '/api/config') return 'Config'
  if (path === '/api/scenarios') return 'Scenarios'
  if (path === '/health') return 'Health Check'
  return path
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.round((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString()
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

const methodColors: Record<string, string> = {
  GET: 'bg-green-100 text-green-800',
  POST: 'bg-blue-100 text-blue-800',
  PUT: 'bg-yellow-100 text-yellow-800',
  DELETE: 'bg-red-100 text-red-800',
  PATCH: 'bg-purple-100 text-purple-800',
}

const statusColors = (code: number) => {
  if (code >= 200 && code < 300) return 'text-green-600'
  if (code >= 400 && code < 500) return 'text-yellow-600'
  if (code >= 500) return 'text-red-600'
  return 'text-gray-600'
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [agentOnly, setAgentOnly] = useState(false)
  const [activeOnly, setActiveOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null)

  const fetchSessions = async () => {
    try {
      const params = new URLSearchParams()
      if (agentOnly) params.set('agentOnly', 'true')
      if (activeOnly) params.set('activeOnly', 'true')
      if (search) params.set('search', search)
      const res = await fetch(`${API_URL}/sessions?${params}`)
      const data = await res.json()
      setSessions(data.sessions)
    } catch (err) {
      console.error('Error fetching sessions:', err)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_URL}/sessions/stats`)
      const data = await res.json()
      setStats(data)
    } catch (err) {
      console.error('Error fetching session stats:', err)
    }
  }

  const fetchSessionDetail = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${id}`)
      const data: SessionDetail = await res.json()
      setSelectedSession(data)
      setExpandedRequest(null)
    } catch (err) {
      console.error('Error fetching session detail:', err)
    }
  }

  const clearSessions = async () => {
    if (!confirm('Clear all sessions?')) return
    try {
      await fetch(`${API_URL}/sessions`, { method: 'DELETE' })
      setSessions([])
      setSelectedSession(null)
      fetchStats()
    } catch (err) {
      console.error('Error clearing sessions:', err)
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([fetchSessions(), fetchStats()])
      setLoading(false)
    }
    load()
  }, [agentOnly, activeOnly])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => {
      fetchSessions()
      fetchStats()
    }, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, agentOnly, activeOnly, search])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link href="/" className="text-2xl font-bold text-blue-600">
              TicketHub
            </Link>
            <Link href="/" className="text-gray-600 hover:text-gray-900">
              Back to Site
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-6 mb-8 border-b">
          <Link href="/admin" className="pb-2 font-semibold text-gray-500 hover:text-gray-900">
            Configuration
          </Link>
          <span className="pb-2 font-semibold border-b-2 border-blue-600 text-blue-600">
            Sessions
          </span>
        </div>

        <h1 className="text-3xl font-bold mb-2">Session Tracking</h1>
        <p className="text-gray-600 mb-8">
          Track visitor and AI agent journeys through the site.
        </p>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-sm text-gray-500">Total Sessions</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-sm text-gray-500">Agent Sessions</div>
              <div className="text-2xl font-bold text-orange-600">{stats.agentSessions}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-sm text-gray-500">Active Now</div>
              <div className="text-2xl font-bold text-green-600">{stats.activeSessions}</div>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="text-sm text-gray-500">Avg Requests/Session</div>
              <div className="text-2xl font-bold">{stats.avgRequestCount}</div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg p-4 shadow-sm border mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <input
              type="text"
              placeholder="Search sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchSessions()}
              className="border rounded px-3 py-2 text-sm w-64"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={agentOnly}
                onChange={(e) => setAgentOnly(e.target.checked)}
                className="rounded"
              />
              Agents only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="rounded"
              />
              Active only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (5s)
            </label>
            <button
              onClick={() => { fetchSessions(); fetchStats() }}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh
            </button>
            <button
              onClick={clearSessions}
              className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
            >
              Clear All
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading sessions...</div>
        ) : (
          <div className="flex gap-6">
            {/* Session List */}
            <div className={`${selectedSession ? 'w-1/3' : 'w-full'} space-y-2`}>
              {sessions.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-white rounded-lg border">
                  No sessions found
                </div>
              ) : (
                sessions.map((session) => {
                  const duration = new Date(session.lastActivity).getTime() - new Date(session.startTime).getTime()
                  const isSelected = selectedSession?.session.id === session.id
                  return (
                    <div
                      key={session.id}
                      onClick={() => fetchSessionDetail(session.id)}
                      className={`bg-white rounded-lg p-4 border cursor-pointer hover:border-blue-300 transition-colors ${
                        isSelected ? 'border-blue-500 ring-1 ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-mono text-gray-400">
                          {session.id.substring(0, 20)}...
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          session.isAgent ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {session.isAgent ? 'Agent' : 'Browser'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
                        <span>{session.requestCount} requests</span>
                        <span>{formatDuration(duration)}</span>
                        <span>{session.pagesVisited.length} pages</span>
                      </div>
                      <div className="text-xs text-gray-400 mb-2">
                        {formatDateTime(session.startTime)}
                      </div>
                      {/* Journey breadcrumb */}
                      <div className="flex flex-wrap gap-1">
                        {session.pagesVisited.slice(0, 5).map((path, i) => (
                          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                            {pathToLabel(path)}
                          </span>
                        ))}
                        {session.pagesVisited.length > 5 && (
                          <span className="text-xs text-gray-400">
                            +{session.pagesVisited.length - 5} more
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Session Detail Panel */}
            {selectedSession && (
              <div className="w-2/3">
                <div className="bg-white rounded-lg border shadow-sm sticky top-4">
                  {/* Session Header */}
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-semibold">Session Detail</h2>
                      <button
                        onClick={() => setSelectedSession(null)}
                        className="text-gray-400 hover:text-gray-600 text-xl"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-500">Session ID:</span>
                        <span className="ml-2 font-mono text-xs">{selectedSession.session.id}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Type:</span>
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                          selectedSession.session.isAgent ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {selectedSession.session.isAgent ? 'Agent' : 'Browser'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">IP:</span>
                        <span className="ml-2 font-mono text-xs">{selectedSession.session.ip}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Duration:</span>
                        <span className="ml-2">
                          {formatDuration(
                            new Date(selectedSession.session.lastActivity).getTime() -
                            new Date(selectedSession.session.startTime).getTime()
                          )}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-500">User Agent:</span>
                        <span className="ml-2 text-xs break-all">{selectedSession.session.userAgent}</span>
                      </div>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">
                      Request Timeline ({selectedSession.requests.length} requests)
                    </h3>
                    <div className="space-y-0">
                      {selectedSession.requests.map((req, i) => {
                        const isLast = i === selectedSession.requests.length - 1
                        const isExpanded = expandedRequest === req.id
                        return (
                          <div key={req.id} className="flex">
                            {/* Timeline connector */}
                            <div className="flex flex-col items-center mr-4">
                              <div className={`w-3 h-3 rounded-full border-2 ${
                                req.statusCode >= 400
                                  ? 'border-red-400 bg-red-100'
                                  : req.isAgent
                                    ? 'border-orange-400 bg-orange-100'
                                    : 'border-blue-400 bg-blue-100'
                              }`} />
                              {!isLast && (
                                <div className="w-0.5 bg-gray-200 flex-1 min-h-[24px]" />
                              )}
                            </div>

                            {/* Request content */}
                            <div className={`flex-1 ${!isLast ? 'pb-3' : ''}`}>
                              <div
                                onClick={() => setExpandedRequest(isExpanded ? null : req.id)}
                                className="cursor-pointer hover:bg-gray-50 rounded p-2 -ml-2"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                    methodColors[req.method] || 'bg-gray-100 text-gray-800'
                                  }`}>
                                    {req.method}
                                  </span>
                                  <span className="text-sm font-medium">{pathToLabel(req.path)}</span>
                                  <span className="text-xs font-mono text-gray-400">{req.path}</span>
                                  <span className={`text-xs font-medium ${statusColors(req.statusCode)}`}>
                                    {req.statusCode}
                                  </span>
                                  <span className="text-xs text-gray-400">{req.durationFormatted}</span>
                                  <span className="text-xs text-gray-400 ml-auto">
                                    {formatTime(req.timestamp)}
                                  </span>
                                </div>
                              </div>

                              {/* Expanded request details */}
                              {isExpanded && (
                                <div className="mt-2 ml-2 space-y-2">
                                  {req.body && (
                                    <div>
                                      <div className="text-xs font-medium text-gray-500 mb-1">Request Body</div>
                                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-40">
                                        {JSON.stringify(req.body, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  {req.query && Object.keys(req.query).length > 0 && (
                                    <div>
                                      <div className="text-xs font-medium text-gray-500 mb-1">Query Params</div>
                                      <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                                        {JSON.stringify(req.query, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  <div>
                                    <div className="text-xs font-medium text-gray-500 mb-1">Response ({req.responseSize ? `${(req.responseSize / 1024).toFixed(1)}KB` : 'N/A'})</div>
                                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-h-60">
                                      {req.responseBodyString || JSON.stringify(req.responseBody, null, 2)?.substring(0, 5000) || 'No response body'}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {selectedSession.requests.length === 0 && (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        No requests recorded for this session
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Paths */}
        {stats && stats.topPaths.length > 0 && !selectedSession && (
          <div className="mt-8 bg-white rounded-lg p-4 shadow-sm border">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Most Visited Paths (across all sessions)</h3>
            <div className="space-y-2">
              {stats.topPaths.map(({ path, count }) => (
                <div key={path} className="flex items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-gray-500 w-48 truncate">{path}</span>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{pathToLabel(path)}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 rounded-full h-2"
                      style={{ width: `${(count / stats.topPaths[0].count) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
