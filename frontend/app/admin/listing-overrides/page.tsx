'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

interface Event {
  id: number
  title: string
  artist: string
}

interface Listing {
  id: number
  eventId: number
  section: string
  row: string
  pricePerTicket: number
  fees: number
  quantity: number
  sellerName: string
}

interface FieldOverrides {
  [key: string]: number | string | boolean | string[]
}

const OVERRIDE_FIELDS: { key: string; type: 'number' | 'string' | 'boolean' | 'select'; label: string; options?: string[] }[] = [
  { key: 'pricePerTicket', type: 'number', label: 'Price Per Ticket' },
  { key: 'fees', type: 'number', label: 'Total Fees' },
  { key: 'serviceFee', type: 'number', label: 'Service Fee' },
  { key: 'fulfillmentFee', type: 'number', label: 'Fulfillment Fee' },
  { key: 'platformFee', type: 'number', label: 'Platform Fee' },
  { key: 'quantity', type: 'number', label: 'Quantity' },
  { key: 'sellerName', type: 'string', label: 'Seller Name' },
  { key: 'sellerRating', type: 'number', label: 'Seller Rating' },
  { key: 'sellerVerified', type: 'boolean', label: 'Seller Verified' },
  { key: 'sellerTransactionCount', type: 'number', label: 'Seller Transactions' },
  { key: 'demandLevel', type: 'select', label: 'Demand Level', options: ['high', 'medium', 'low'] },
  { key: 'viewCount', type: 'number', label: 'View Count' },
  { key: 'viewsLast24h', type: 'number', label: 'Views Last 24h' },
  { key: 'soldCount', type: 'number', label: 'Sold Count' },
  { key: 'soldRecently', type: 'boolean', label: 'Sold Recently' },
  { key: 'priceTrend', type: 'select', label: 'Price Trend', options: ['increasing', 'decreasing', 'stable'] },
  { key: 'deliveryMethod', type: 'string', label: 'Delivery Method' },
  { key: 'transferMethod', type: 'string', label: 'Transfer Method' },
  { key: 'refundPolicy', type: 'string', label: 'Refund Policy' },
]

export default function ListingOverridesPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [overrides, setOverrides] = useState<Record<string, FieldOverrides>>({})
  const [rawListings, setRawListings] = useState<Record<number, Listing>>({})
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editFields, setEditFields] = useState<FieldOverrides>({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchEvents()
    fetchOverrides()
  }, [])

  useEffect(() => {
    if (selectedEventId) fetchListings(selectedEventId)
  }, [selectedEventId])

  const fetchEvents = async () => {
    const url = `${API_URL}/events`
    console.log('[ListingOverrides] Fetching events from:', url)
    try {
      const res = await fetch(url)
      console.log('[ListingOverrides] Events response:', res.status, res.statusText)
      if (!res.ok) {
        const text = await res.text()
        console.error('[ListingOverrides] Events error body:', text)
        setLoading(false)
        return
      }
      setEvents(await res.json())
      setLoading(false)
    } catch (error) {
      console.error('[ListingOverrides] Events fetch error:', error)
      setLoading(false)
    }
  }

  const fetchListings = async (eventId: number) => {
    const url = `${API_URL}/events/${eventId}/listings?sort=price_asc`
    const rawUrl = `${API_URL}/events/${eventId}/listings/raw`
    console.log('[ListingOverrides] Fetching listings from:', url)
    try {
      const [res, rawRes] = await Promise.all([fetch(url), fetch(rawUrl)])
      console.log('[ListingOverrides] Listings response:', res.status, '| Raw:', rawRes.status)
      if (!res.ok) {
        const text = await res.text()
        console.error('[ListingOverrides] Listings error body:', text)
        return
      }
      setListings(await res.json())
      if (rawRes.ok) {
        const rawData: Listing[] = await rawRes.json()
        const rawMap: Record<number, Listing> = {}
        for (const l of rawData) rawMap[l.id] = l
        setRawListings(rawMap)
      }
    } catch (error) {
      console.error('[ListingOverrides] Listings fetch error:', error)
    }
  }

  const fetchOverrides = async () => {
    const url = `${API_URL}/listing-overrides`
    console.log('[ListingOverrides] Fetching overrides from:', url)
    try {
      const res = await fetch(url)
      console.log('[ListingOverrides] Overrides response:', res.status, res.statusText)
      if (!res.ok) {
        const text = await res.text()
        console.error('[ListingOverrides] Overrides error body:', text)
        return
      }
      setOverrides(await res.json())
    } catch (error) {
      console.error('[ListingOverrides] Overrides fetch error:', error)
    }
  }

  const saveOverride = async (listingId: number) => {
    // Filter out empty fields
    const cleaned: FieldOverrides = {}
    for (const [key, value] of Object.entries(editFields)) {
      if (value !== '' && value !== undefined && value !== null) cleaned[key] = value
    }
    console.log('[ListingOverrides] Save override for listing', listingId, '| fields:', JSON.stringify(cleaned))
    if (Object.keys(cleaned).length === 0) {
      setMessage('No override fields set — enter at least one value')
      setTimeout(() => setMessage(''), 3000)
      return
    }

    const url = `${API_URL}/listing-overrides/${listingId}`
    console.log('[ListingOverrides] PUT', url, '| body:', JSON.stringify(cleaned))
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleaned)
      })
      const responseText = await res.text()
      console.log('[ListingOverrides] PUT response:', res.status, res.statusText, '| body:', responseText)
      if (res.ok) {
        setMessage(`Overrides saved for listing ${listingId}`)
        setTimeout(() => setMessage(''), 3000)
        fetchOverrides()
        setEditingId(null)
        setEditFields({})
      } else {
        let errMsg = `${res.status} ${res.statusText}`
        try {
          const errData = JSON.parse(responseText)
          errMsg = errData.error || errMsg
        } catch {}
        setMessage(`Error saving listing ${listingId}: ${errMsg} (check console for details)`)
        setTimeout(() => setMessage(''), 10000)
      }
    } catch (error) {
      console.error('[ListingOverrides] PUT fetch error:', error)
      setMessage(`Network error saving listing ${listingId}: ${error instanceof Error ? error.message : String(error)}`)
      setTimeout(() => setMessage(''), 10000)
    }
  }

  const deleteOverride = async (listingId: number) => {
    const url = `${API_URL}/listing-overrides/${listingId}`
    console.log('[ListingOverrides] DELETE', url)
    try {
      const res = await fetch(url, { method: 'DELETE' })
      console.log('[ListingOverrides] DELETE response:', res.status, res.statusText)
      fetchOverrides()
      setMessage(`Overrides cleared for listing ${listingId}`)
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      console.error('[ListingOverrides] DELETE error:', error)
    }
  }

  const clearAll = async () => {
    if (!confirm('Clear all listing overrides?')) return
    try {
      await fetch(`${API_URL}/listing-overrides`, { method: 'DELETE' })
      setOverrides({})
      setMessage('All overrides cleared')
      setTimeout(() => setMessage(''), 3000)
    } catch {}
  }

  const startEditing = (listingId: number) => {
    setEditingId(listingId)
    setEditFields(overrides[listingId] || {})
  }

  const overrideCount = Object.keys(overrides).length

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-gray-600">&larr;</Link>
            <h1 className="text-xl font-bold">Admin Panel</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex gap-6 mb-8 border-b">
          <Link href="/admin" className="pb-2 font-semibold text-gray-500 hover:text-gray-900">Configuration</Link>
          <Link href="/admin/sessions" className="pb-2 font-semibold text-gray-500 hover:text-gray-900">Sessions</Link>
          <Link href="/admin/experiments" className="pb-2 font-semibold text-gray-500 hover:text-gray-900">Experiments</Link>
          <span className="pb-2 font-semibold border-b-2 border-blue-600 text-blue-600">Listing Overrides</span>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded text-sm ${message.toLowerCase().includes('error') || message.toLowerCase().includes('network') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>{message}</div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold">Listing Field Overrides</h2>
            <p className="text-sm text-gray-500">Override individual listing fields (price, fees, seller info, etc.). These apply globally and can be layered with experiment variant overrides.</p>
          </div>
          {overrideCount > 0 && (
            <button onClick={clearAll} className="text-sm px-3 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50">
              Clear All ({overrideCount})
            </button>
          )}
        </div>

        {/* Active overrides summary */}
        {overrideCount > 0 && (
          <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <h3 className="font-medium text-orange-800 mb-2">{overrideCount} Active Override{overrideCount !== 1 ? 's' : ''}</h3>
            <div className="space-y-1">
              {Object.entries(overrides).map(([id, fields]) => (
                <div key={id} className="flex items-center justify-between text-sm">
                  <span className="text-orange-700">
                    Listing {id}: {Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </span>
                  <button onClick={() => deleteOverride(parseInt(id))} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Event selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Event</label>
          {loading ? (
            <p className="text-gray-500">Loading events...</p>
          ) : (
            <select
              value={selectedEventId || ''}
              onChange={e => setSelectedEventId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full max-w-md border rounded px-3 py-2"
            >
              <option value="">Choose an event...</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>{event.title} - {event.artist}</option>
              ))}
            </select>
          )}
        </div>

        {/* Listings table */}
        {selectedEventId && listings.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Section / Row</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fees</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seller</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {listings.map(listing => {
                  const lo = overrides[listing.id] || null
                  const hasOverride = !!lo
                  const isEditing = editingId === listing.id

                  const raw = rawListings[listing.id]

                  // Helper to render a cell value with override indicator
                  const renderCell = (field: string, format?: (v: number) => string) => {
                    const overrideVal = lo?.[field]
                    const baseVal = raw ? (raw as unknown as Record<string, unknown>)[field] : undefined
                    if (overrideVal !== undefined && baseVal !== undefined && overrideVal !== baseVal) {
                      const formatted = format ? format(overrideVal as number) : String(overrideVal)
                      const baseFormatted = format ? format(baseVal as number) : String(baseVal)
                      return (
                        <div>
                          <span className="font-medium text-orange-700">{formatted}</span>
                          <span className="ml-1.5 text-gray-400 line-through text-xs">{baseFormatted}</span>
                        </div>
                      )
                    }
                    // No override — show base value
                    const displayVal = baseVal ?? (listing as unknown as Record<string, unknown>)[field]
                    const formatted = format && displayVal !== undefined ? format(displayVal as number) : String(displayVal ?? '')
                    return <span>{formatted}</span>
                  }

                  const fmtPrice = (v: number) => `$${v.toFixed(2)}`

                  return (
                    <tr key={listing.id} className={hasOverride ? 'bg-orange-50' : ''}>
                      <td className="px-4 py-3 text-sm font-mono">{listing.id}</td>
                      <td className="px-4 py-3 text-sm">{listing.section} / {listing.row}</td>
                      <td className="px-4 py-3 text-sm font-medium">{renderCell('pricePerTicket', fmtPrice)}</td>
                      <td className="px-4 py-3 text-sm">{renderCell('fees', fmtPrice)}</td>
                      <td className="px-4 py-3 text-sm">{renderCell('quantity')}</td>
                      <td className="px-4 py-3 text-sm">{renderCell('sellerName')}</td>
                      <td className="px-4 py-3 text-sm">
                        {hasOverride ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                              {Object.keys(lo!).length} field{Object.keys(lo!).length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">Default</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button onClick={() => saveOverride(listing.id)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
                            <button onClick={() => { setEditingId(null); setEditFields({}) }} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => startEditing(listing.id)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Edit</button>
                            {hasOverride && (
                              <button onClick={() => deleteOverride(listing.id)} className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50">Revert</button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit panel */}
        {editingId && (
          <div className="mt-6 bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4">Override Fields for Listing {editingId}</h3>
            <p className="text-sm text-gray-500 mb-4">Only set fields you want to override. Leave blank to use the original value.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {OVERRIDE_FIELDS.map(field => (
                <div key={field.key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{field.label}</label>
                  {field.type === 'boolean' ? (
                    <select
                      value={editFields[field.key] !== undefined ? String(editFields[field.key]) : ''}
                      onChange={e => {
                        const val = e.target.value
                        if (val === '') {
                          const next = { ...editFields }
                          delete next[field.key]
                          setEditFields(next)
                        } else {
                          setEditFields({ ...editFields, [field.key]: val === 'true' })
                        }
                      }}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">-- default --</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : field.type === 'select' ? (
                    <select
                      value={editFields[field.key] !== undefined ? String(editFields[field.key]) : ''}
                      onChange={e => {
                        if (e.target.value === '') {
                          const next = { ...editFields }
                          delete next[field.key]
                          setEditFields(next)
                        } else {
                          setEditFields({ ...editFields, [field.key]: e.target.value })
                        }
                      }}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">-- default --</option>
                      {field.options!.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editFields[field.key] !== undefined ? editFields[field.key] as number : ''}
                      onChange={e => {
                        if (e.target.value === '') {
                          const next = { ...editFields }
                          delete next[field.key]
                          setEditFields(next)
                        } else {
                          setEditFields({ ...editFields, [field.key]: parseFloat(e.target.value) })
                        }
                      }}
                      placeholder="default"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <input
                      type="text"
                      value={editFields[field.key] !== undefined ? String(editFields[field.key]) : ''}
                      onChange={e => {
                        if (e.target.value === '') {
                          const next = { ...editFields }
                          delete next[field.key]
                          setEditFields(next)
                        } else {
                          setEditFields({ ...editFields, [field.key]: e.target.value })
                        }
                      }}
                      placeholder="default"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => saveOverride(editingId)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">
                Save Overrides
              </button>
              <button onClick={() => { setEditingId(null); setEditFields({}) }} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
