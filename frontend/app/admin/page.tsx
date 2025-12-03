'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

interface Config {
  ui: {
    priceFormat: string
    dateFormat: string
    urgencyMessages: boolean
    stockCounts: boolean
    showFees: boolean
    buttonText: string
    currency: string
  }
  api: {
    responseFormat: string
    includeFees: boolean
    priceField: string
    includeAvailability: boolean
    includePriceHistory: boolean
    includeDealScore: boolean
    includeValueScore: boolean
    includeSavingsInfo: boolean
    includeDemandIndicators: boolean
    includeBundleOptions: boolean
    includeRefundPolicy: boolean
    includeTransferMethod: boolean
    includeSellerDetails: boolean
    includeDealFlags: boolean
    includePremiumFeatures: boolean
    includeRelativeValue: boolean
  }
  content: {
    eventDescriptions: string
    venueInfo: string
    showReviews: boolean
    showRatings: boolean
  }
}

interface Scenario {
  name: string
  description: string
  config: Config
}

interface Listing {
  id: number
  eventId: number
  section: string
  row: string
  imageUrl: string
  notes: string[]
}

interface LogEntry {
  id: string
  timestamp: string
  method: string
  path: string
  fullPath?: string
  query: any
  params: any
  body: any
  headers: {
    'user-agent': string
    referer: string | null
    origin: string | null
    accept: string | null
    'content-type': string | null
  }
  ip: string
  statusCode: number
  responseBody: any
  responseBodyString?: string | null
  responseSize?: number
  responseSummary?: {
    type?: string
    length?: number
    keys?: string[]
    firstItemKeys?: string[]
    hasNestedData?: boolean
  } | null
  duration: number
  durationFormatted: string
  isAgent: boolean
}

interface LogStats {
  total: number
  agentRequests: number
  regularRequests: number
  agentPercentage: string
  recentStats: {
    statusCodes: Record<string, number>
    methods: Record<string, number>
    topPaths: Array<{ path: string; count: number }>
    topAgents: Array<{ agent: string; count: number }>
  }
}

export default function Admin() {
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [updatingImage, setUpdatingImage] = useState<number | null>(null)

  useEffect(() => {
    fetchConfig()
    fetchScenarios()
  }, [])

  useEffect(() => {
    if (selectedEventId) {
      fetchListingsForEvent(selectedEventId)
    }
  }, [selectedEventId])

  const fetchListingsForEvent = async (eventId: number) => {
    try {
      const response = await fetch(`${API_URL}/events/${eventId}/listings`)
      const data = await response.json()
      setListings(data.map((l: any) => ({
        id: l.id,
        eventId: l.eventId,
        section: l.section,
        row: l.row,
        imageUrl: l.imageUrl || '',
        notes: l.notes || []
      })))
    } catch (error) {
      console.error('Error fetching listings:', error)
    }
  }

  const updateListingNotes = async (listingId: number, notes: string[]) => {
    setUpdatingImage(listingId)
    try {
      const response = await fetch(`${API_URL}/listings/${listingId}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes })
      })
      if (response.ok) {
        setListings(prev => prev.map(l => 
          l.id === listingId ? { ...l, notes } : l
        ))
        setMessage('Listing notes updated successfully!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage('Error updating listing notes')
      }
    } catch (error) {
      console.error('Error updating listing notes:', error)
      setMessage('Error updating listing notes')
    } finally {
      setUpdatingImage(null)
    }
  }

  const updateListingImage = async (listingId: number, imageUrl: string) => {
    setUpdatingImage(listingId)
    try {
      const response = await fetch(`${API_URL}/listings/${listingId}/image`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl })
      })
      if (response.ok) {
        setListings(prev => prev.map(l => 
          l.id === listingId ? { ...l, imageUrl } : l
        ))
        setMessage('Listing image updated successfully!')
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage('Error updating listing image')
      }
    } catch (error) {
      console.error('Error updating listing image:', error)
      setMessage('Error updating listing image')
    } finally {
      setUpdatingImage(null)
    }
  }

  const fetchConfig = async () => {
    try {
      const response = await fetch(`${API_URL}/config`)
      const data = await response.json()
      setConfig(data)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching config:', error)
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    if (!config) return
    
    setSaving(true)
    setMessage('')
    try {
      const response = await fetch(`${API_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      if (response.ok) {
        setMessage('Configuration saved successfully! Changes will be reflected on the next page load.')
        setTimeout(() => setMessage(''), 3000)
      }
    } catch (error) {
      console.error('Error saving config:', error)
      setMessage('Error saving configuration')
    } finally {
      setSaving(false)
    }
  }

  const fetchScenarios = async () => {
    try {
      const response = await fetch(`${API_URL}/scenarios`)
      const data = await response.json()
      setScenarios(data)
    } catch (error) {
      console.error('Error fetching scenarios:', error)
    }
  }

  const loadScenario = async (scenarioName: string) => {
    setLoadingScenarios(true)
    setMessage('')
    try {
      const response = await fetch(`${API_URL}/scenarios/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: scenarioName })
      })
      if (response.ok) {
        const data = await response.json()
        setConfig(data)
        setMessage(`Scenario "${scenarioName}" loaded successfully!`)
        setTimeout(() => setMessage(''), 3000)
      } else {
        setMessage('Error loading scenario')
      }
    } catch (error) {
      console.error('Error loading scenario:', error)
      setMessage('Error loading scenario')
    } finally {
      setLoadingScenarios(false)
    }
  }

  const updateConfig = (path: string[], value: any) => {
    if (!config) return
    
    const newConfig = { ...config }
    let current: any = newConfig
    
    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }
    
    current[path[path.length - 1]] = value
    setConfig(newConfig)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (!config) {
    return <div>Error loading configuration</div>
  }

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
        <h1 className="text-3xl font-bold mb-8">Admin Control Panel</h1>
        <p className="text-gray-600 mb-8">
          Modify the website configuration to test how AI models parse different content structures.
        </p>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('Error') ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
          }`}>
            {message}
          </div>
        )}

        {/* Preset Scenarios */}
        {scenarios.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
            <h2 className="text-xl font-bold mb-4">Preset Scenarios</h2>
            <p className="text-sm text-gray-600 mb-4">
              Load a preset configuration scenario for quick testing:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenarios.map((scenario) => (
                <div key={scenario.name} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-1">{scenario.name}</h3>
                  <p className="text-sm text-gray-600 mb-3">{scenario.description}</p>
                  <button
                    onClick={() => loadScenario(scenario.name)}
                    disabled={loadingScenarios}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {loadingScenarios ? 'Loading...' : 'Load Scenario'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-lg p-8 space-y-8">
          {/* UI Configuration */}
          <section>
            <h2 className="text-2xl font-bold mb-4">UI Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Price Format</label>
                <select
                  value={config.ui.priceFormat}
                  onChange={(e) => updateConfig(['ui', 'priceFormat'], e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="currency_symbol">Currency Symbol ($50.00)</option>
                  <option value="currency_code">Currency Code (50.00 USD)</option>
                  <option value="number_only">Number Only (50.00)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Date Format</label>
                <select
                  value={config.ui.dateFormat}
                  onChange={(e) => updateConfig(['ui', 'dateFormat'], e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  <option value="full">Full Date (e.g., Monday, January 15, 2024)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Currency</label>
                <select
                  value={config.ui.currency}
                  onChange={(e) => updateConfig(['ui', 'currency'], e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Button Text</label>
                <input
                  type="text"
                  value={config.ui.buttonText}
                  onChange={(e) => updateConfig(['ui', 'buttonText'], e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.ui.urgencyMessages}
                    onChange={(e) => updateConfig(['ui', 'urgencyMessages'], e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold">Show Urgency Messages</span>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.ui.stockCounts}
                    onChange={(e) => updateConfig(['ui', 'stockCounts'], e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold">Show Stock Counts</span>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.ui.showFees}
                    onChange={(e) => updateConfig(['ui', 'showFees'], e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold">Show Fees</span>
                </label>
              </div>
            </div>
          </section>

          {/* API Configuration */}
          <section className="border-t pt-8">
            <h2 className="text-2xl font-bold mb-4">API Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Response Format</label>
                <select
                  value={config.api.responseFormat}
                  onChange={(e) => updateConfig(['api', 'responseFormat'], e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="nested">Nested (structured objects)</option>
                  <option value="flat">Flat (all fields at root level)</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.api.includeFees}
                    onChange={(e) => updateConfig(['api', 'includeFees'], e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold">Include Fees in API</span>
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.api.includeAvailability}
                    onChange={(e) => updateConfig(['api', 'includeAvailability'], e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold">Include Availability Info</span>
                </label>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-3">Data Field Visibility</h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includePriceHistory}
                      onChange={(e) => updateConfig(['api', 'includePriceHistory'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Price History</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeDealScore}
                      onChange={(e) => updateConfig(['api', 'includeDealScore'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Deal Score</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeValueScore}
                      onChange={(e) => updateConfig(['api', 'includeValueScore'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Value Score</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeSavingsInfo}
                      onChange={(e) => updateConfig(['api', 'includeSavingsInfo'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Savings Info</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeDemandIndicators}
                      onChange={(e) => updateConfig(['api', 'includeDemandIndicators'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Demand Indicators</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeBundleOptions}
                      onChange={(e) => updateConfig(['api', 'includeBundleOptions'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Bundle Options</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeRefundPolicy}
                      onChange={(e) => updateConfig(['api', 'includeRefundPolicy'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Refund Policy</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeTransferMethod}
                      onChange={(e) => updateConfig(['api', 'includeTransferMethod'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Transfer Method</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeSellerDetails}
                      onChange={(e) => updateConfig(['api', 'includeSellerDetails'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Seller Details</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeDealFlags}
                      onChange={(e) => updateConfig(['api', 'includeDealFlags'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Deal Flags</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includePremiumFeatures}
                      onChange={(e) => updateConfig(['api', 'includePremiumFeatures'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Premium Features</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.api.includeRelativeValue}
                      onChange={(e) => updateConfig(['api', 'includeRelativeValue'], e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Include Relative Value</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          {/* Content Configuration */}
          <section className="border-t pt-8">
            <h2 className="text-2xl font-bold mb-4">Content Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Event Descriptions</label>
                <select
                  value={config.content.eventDescriptions}
                  onChange={(e) => updateConfig(['content', 'eventDescriptions'], e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="detailed">Detailed</option>
                  <option value="brief">Brief</option>
                  <option value="minimal">Minimal (no description)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">Venue Information</label>
                <select
                  value={config.content.venueInfo}
                  onChange={(e) => updateConfig(['content', 'venueInfo'], e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="full">Full (name, address, city, state)</option>
                  <option value="name_only">Name Only</option>
                  <option value="address_only">Address Only</option>
                </select>
              </div>
            </div>
          </section>

          {/* Listing Image Management */}
          <section className="border-t pt-8">
            <h2 className="text-2xl font-bold mb-4">Listing Image Management</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Select Event</label>
                <select
                  value={selectedEventId || ''}
                  onChange={(e) => setSelectedEventId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">Select an event...</option>
                  <option value="1">Taylor Swift: The Eras Tour</option>
                  <option value="2">Hamilton - Broadway</option>
                  <option value="3">Los Angeles Lakers vs Golden State Warriors</option>
                  <option value="4">Ed Sheeran: + - = ÷ x Tour</option>
                  <option value="5">The Phantom of the Opera</option>
                  <option value="6">Boston Celtics vs Miami Heat</option>
                </select>
              </div>

              {selectedEventId && listings.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Listings for Selected Event</h3>
                  <div className="grid grid-cols-1 gap-4 max-h-96 overflow-y-auto">
                    {listings.map((listing) => (
                      <div key={listing.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start gap-4">
                          {listing.imageUrl && (
                            <img 
                              src={listing.imageUrl} 
                              alt={`${listing.section} ${listing.row}`}
                              className="w-24 h-16 object-cover rounded"
                            />
                          )}
                          <div className="flex-1">
                            <div className="font-semibold">Section {listing.section}, Row {listing.row}</div>
                            <div className="text-sm text-gray-600 mb-2">Listing ID: {listing.id}</div>
                            
                            {/* Current Notes Display */}
                            {listing.notes && listing.notes.length > 0 && (
                              <div className="mb-2">
                                <div className="text-xs text-gray-600 mb-1">Current Notes:</div>
                                <div className="flex flex-wrap gap-1">
                                  {listing.notes.map((note, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800"
                                    >
                                      {note}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Image URL Input */}
                            <div className="flex gap-2 mb-2">
                              <input
                                type="text"
                                value={listing.imageUrl}
                                onChange={(e) => {
                                  setListings(prev => prev.map(l => 
                                    l.id === listing.id ? { ...l, imageUrl: e.target.value } : l
                                  ))
                                }}
                                placeholder="Image URL"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                              />
                              <button
                                onClick={() => updateListingImage(listing.id, listing.imageUrl)}
                                disabled={updatingImage === listing.id}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                              >
                                {updatingImage === listing.id ? 'Updating...' : 'Update Image'}
                              </button>
                            </div>
                            
                            {/* Notes Input */}
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={listing.notes.join(', ')}
                                onChange={(e) => {
                                  const notesArray = e.target.value
                                    .split(',')
                                    .map(n => n.trim())
                                    .filter(n => n !== '')
                                  setListings(prev => prev.map(l => 
                                    l.id === listing.id ? { ...l, notes: notesArray } : l
                                  ))
                                }}
                                placeholder="Notes (comma separated, e.g., Great seats, Aisle access, VIP)"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
                              />
                              <button
                                onClick={() => updateListingNotes(listing.id, listing.notes)}
                                disabled={updatingImage === listing.id}
                                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
                              >
                                {updatingImage === listing.id ? 'Updating...' : 'Update Notes'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEventId && listings.length === 0 && (
                <div className="text-center py-8 text-gray-600">
                  Loading listings...
                </div>
              )}
            </div>
          </section>

          {/* Request Logs */}
          <RequestLogsSection />

          <div className="border-t pt-8">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            <p className="mt-4 text-sm text-gray-600">
              Note: After saving, refresh the main site to see changes take effect.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function RequestLogsSection() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [agentOnly, setAgentOnly] = useState(false)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    fetchLogs()
    fetchStats()
  }, [agentOnly, searchQuery, methodFilter, statusFilter])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchLogs()
        fetchStats()
      }, 5000) // Refresh every 5 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh, agentOnly, searchQuery, methodFilter, statusFilter])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (agentOnly) params.append('agentOnly', 'true')
      if (searchQuery) params.append('search', searchQuery)
      if (methodFilter) params.append('method', methodFilter)
      if (statusFilter) params.append('statusCode', statusFilter)
      const response = await fetch(`${API_URL}/logs?${params}`)
      const data = await response.json()
      setLogs(data.logs || [])
    } catch (error) {
      console.error('Error fetching logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/logs/stats`)
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const clearLogs = async () => {
    if (confirm('Are you sure you want to clear all logs?')) {
      try {
        await fetch(`${API_URL}/logs`, { method: 'DELETE' })
        setLogs([])
        setStats(null)
        fetchStats()
      } catch (error) {
        console.error('Error clearing logs:', error)
      }
    }
  }

  const exportLogs = async (format: 'json' | 'csv') => {
    try {
      const params = new URLSearchParams()
      if (agentOnly) params.append('agentOnly', 'true')
      const response = await fetch(`${API_URL}/logs/export/${format}?${params}`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `request-logs-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error exporting logs:', error)
      alert('Error exporting logs')
    }
  }

  const copyResponse = (log: LogEntry) => {
    const responseText = log.responseBodyString || JSON.stringify(log.responseBody, null, 2)
    navigator.clipboard.writeText(responseText).then(() => {
      alert('Response copied to clipboard!')
    }).catch(err => {
      console.error('Failed to copy:', err)
      alert('Failed to copy response')
    })
  }

  return (
    <section className="border-t pt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Request Logs</h2>
        <div className="flex gap-2 flex-wrap">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={agentOnly}
              onChange={(e) => setAgentOnly(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-semibold">Agent Only</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-semibold">Auto Refresh</span>
          </label>
          <button
            onClick={fetchLogs}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition"
          >
            Refresh
          </button>
          <button
            onClick={() => exportLogs('json')}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition"
          >
            Export JSON
          </button>
          <button
            onClick={() => exportLogs('csv')}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition"
          >
            Export CSV
          </button>
          <button
            onClick={clearLogs}
            className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search path, user-agent, query..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Method</label>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
            >
              <option value="">All Methods</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Status Code</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 text-sm"
            >
              <option value="">All Status Codes</option>
              <option value="200">200 OK</option>
              <option value="201">201 Created</option>
              <option value="400">400 Bad Request</option>
              <option value="404">404 Not Found</option>
              <option value="500">500 Server Error</option>
            </select>
          </div>
        </div>
      </div>

      {stats && (
        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm text-gray-600">Total Requests</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Agent Requests</div>
              <div className="text-2xl font-bold text-orange-600">{stats.agentRequests}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Regular Requests</div>
              <div className="text-2xl font-bold text-blue-600">{stats.regularRequests}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Agent Percentage</div>
              <div className="text-2xl font-bold">{stats.agentPercentage}%</div>
            </div>
          </div>
          {stats.recentStats.topAgents.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm font-semibold mb-2">Top Agents (Last 100 requests):</div>
              <div className="flex flex-wrap gap-2">
                {stats.recentStats.topAgents.map((agent, idx) => (
                  <span key={idx} className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">
                    {agent.agent.substring(0, 50)} ({agent.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-600">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 text-gray-600">No logs found</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`border rounded-lg p-3 cursor-pointer hover:bg-gray-50 transition ${
                log.isAgent ? 'border-orange-300 bg-orange-50' : 'border-gray-200'
              }`}
              onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      log.method === 'GET' ? 'bg-blue-100 text-blue-800' :
                      log.method === 'POST' ? 'bg-green-100 text-green-800' :
                      log.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                      log.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {log.method}
                    </span>
                    <span className="font-mono text-sm">{log.path}</span>
                    <span className={`px-2 py-1 text-xs font-semibold rounded ${
                      log.statusCode >= 200 && log.statusCode < 300 ? 'bg-green-100 text-green-800' :
                      log.statusCode >= 300 && log.statusCode < 400 ? 'bg-yellow-100 text-yellow-800' :
                      log.statusCode >= 400 ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {log.statusCode}
                    </span>
                    {log.isAgent && (
                      <span className="px-2 py-1 text-xs font-semibold rounded bg-orange-100 text-orange-800">
                        AGENT
                      </span>
                    )}
                    <span className="text-xs text-gray-500">{log.durationFormatted || log.duration}</span>
                    {log.responseSummary && (
                      <span className="text-xs text-gray-500">
                        {log.responseSummary.type === 'array' 
                          ? `[${log.responseSummary.length}]`
                          : log.responseSummary.type === 'object'
                          ? `{${log.responseSummary.keys?.length || 0} keys}`
                          : ''}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {new Date(log.timestamp).toLocaleString()} • {log.headers['user-agent']?.substring(0, 80) || 'No User-Agent'}
                  </div>
                </div>
              </div>
              {selectedLog?.id === log.id && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  {/* Response Summary */}
                  {log.responseSummary && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="text-sm font-semibold text-blue-900 mb-2">Response Summary</div>
                      <div className="text-xs text-blue-800 space-y-1">
                        <div>Type: <span className="font-mono">{log.responseSummary.type}</span></div>
                        {log.responseSummary.length !== undefined && (
                          <div>Array Length: <span className="font-mono">{log.responseSummary.length}</span></div>
                        )}
                        {log.responseSummary.keys && (
                          <div>Top-level Keys: <span className="font-mono">{log.responseSummary.keys.join(', ')}</span></div>
                        )}
                        {log.responseSummary.firstItemKeys && (
                          <div>First Item Keys: <span className="font-mono">{log.responseSummary.firstItemKeys.join(', ')}</span></div>
                        )}
                        {log.responseSize && (
                          <div>Size: <span className="font-mono">{(log.responseSize / 1024).toFixed(2)} KB</span></div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center">
                    <div className="text-xs font-semibold text-gray-600">Request Body:</div>
                    {log.body && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(log.body, null, 2))
                          alert('Copied!')
                        }}
                        className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                  <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto max-h-32 overflow-y-auto">
                    {log.body ? JSON.stringify(log.body, null, 2) : 'No body'}
                  </pre>
                  
                  <div className="flex justify-between items-center">
                    <div className="text-xs font-semibold text-gray-600">Query Params:</div>
                    {Object.keys(log.query || {}).length > 0 && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(log.query, null, 2))
                          alert('Copied!')
                        }}
                        className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                      >
                        Copy
                      </button>
                    )}
                  </div>
                  <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto max-h-32 overflow-y-auto">
                    {Object.keys(log.query || {}).length > 0 ? JSON.stringify(log.query, null, 2) : 'No query params'}
                  </pre>
                  
                  <div className="flex justify-between items-center">
                    <div className="text-xs font-semibold text-gray-600">
                      Response Body {log.responseSize && `(${(log.responseSize / 1024).toFixed(2)} KB)`}:
                    </div>
                    {log.responseBody && (
                      <button
                        onClick={() => copyResponse(log)}
                        className="text-xs px-2 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded"
                      >
                        Copy Response
                      </button>
                    )}
                  </div>
                  <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto max-h-96 overflow-y-auto">
                    {log.responseBodyString || (log.responseBody ? JSON.stringify(log.responseBody, null, 2) : 'No response body')}
                  </pre>
                  
                  <div className="flex justify-between items-center">
                    <div className="text-xs font-semibold text-gray-600">Headers:</div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(log.headers, null, 2))
                        alert('Copied!')
                      }}
                      className="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto max-h-32 overflow-y-auto">
                    {JSON.stringify(log.headers, null, 2)}
                  </pre>
                  
                  {log.fullPath && log.fullPath !== log.path && (
                    <div>
                      <div className="text-xs font-semibold text-gray-600 mb-1">Full Path:</div>
                      <div className="text-xs font-mono bg-gray-100 p-2 rounded">{log.fullPath}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

