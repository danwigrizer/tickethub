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
    try {
      const res = await fetch(`${API_URL}/events`)
      setEvents(await res.json())
      setLoading(false)
    } catch { setLoading(false) }
  }

  const fetchListings = async (eventId: number) => {
    try {
      const res = await fetch(`${API_URL}/events/${eventId}/listings?sort=price_asc`)
      setListings(await res.json())
    } catch {}
  }

  const fetchOverrides = async () => {
    try {
      const res = await fetch(`${API_URL}/listing-overrides`)
      setOverrides(await res.json())
    } catch {}
  }

  const saveOverride = async (listingId: number) => {
    // Filter out empty fields
    const cleaned: FieldOverrides = {}
    for (const [key, value] of Object.entries(editFields)) {
      if (value !== '' && value !== undefined && value !== null) cleaned[key] = value
    }
    if (Object.keys(cleaned).length === 0) {
      setMessage('No override fields set — enter at least one value')
      setTimeout(() => setMessage(''), 3000)
      return
    }

    try {
      const res = await fetch(`${API_URL}/listing-overrides/${listingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleaned)
      })
      if (res.ok) {
        setMessage(`Overrides saved for listing ${listingId}`)
        setTimeout(() => setMessage(''), 3000)
        fetchOverrides()
        setEditingId(null)
        setEditFields({})
      } else {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        setMessage(`Error: ${err.error || res.statusText}`)
        setTimeout(() => setMessage(''), 5000)
      }
    } catch (error) {
      console.error('Error saving overrides:', error)
      setMessage('Error saving overrides — check console')
      setTimeout(() => setMessage(''), 5000)
    }
  }

  const deleteOverride = async (listingId: number) => {
    try {
      await fetch(`${API_URL}/listing-overrides/${listingId}`, { method: 'DELETE' })
      fetchOverrides()
      setMessage(`Overrides cleared for listing ${listingId}`)
      setTimeout(() => setMessage(''), 3000)
    } catch {}
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
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">{message}</div>
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
                  const hasOverride = !!overrides[listing.id]
                  const isEditing = editingId === listing.id
                  return (
                    <tr key={listing.id} className={hasOverride ? 'bg-orange-50' : ''}>
                      <td className="px-4 py-3 text-sm font-mono">{listing.id}</td>
                      <td className="px-4 py-3 text-sm">{listing.section} / {listing.row}</td>
                      <td className="px-4 py-3 text-sm font-medium">${listing.pricePerTicket?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">${listing.fees?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">{listing.quantity}</td>
                      <td className="px-4 py-3 text-sm">{listing.sellerName}</td>
                      <td className="px-4 py-3 text-sm">
                        {hasOverride ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Overridden</span>
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
                              <button onClick={() => deleteOverride(listing.id)} className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50">Clear</button>
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
