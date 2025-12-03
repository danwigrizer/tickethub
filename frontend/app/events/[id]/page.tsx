'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { API_URL } from '@/lib/api'

interface Event {
  id: number
  title: string
  artist: string
  dateFormatted: string
  time: string
  venue: {
    name: string
    address?: string
    city?: string
    state?: string
    stadiumMapData?: {
      midfieldOrientation: string[]
      roofCoverage: string
      entryTunnelProximity: string
      sectionQuality: Record<string, number>
    }
  }
  category: string
  description: string
  listingsCount?: number
  totalListingsCount?: number
  listingSupply?: string
}

interface Listing {
  id: number
  eventId: number
  section: string
  row: string
  seats: number[]
  seatsDisplay: string
  quantity: number
  pricePerTicket: number
  pricePerTicketFormatted: string
  fees?: number
  feesFormatted?: string
  totalPrice: number
  totalPriceFormatted: string
  sellerName: string
  sellerRating: number
  deliveryMethod: string
  notes?: string[]
  listedAt: string
  imageUrl?: string
  dealScore?: number
  dealScoreColor?: string
  // New fields
  seatType?: string
  stadiumZone?: string
  fieldProximity?: number
  rowElevation?: number
  seatLocation?: string
  seatsAdjacent?: boolean
  dealFlags?: string[]
  basePrice?: number
  serviceFee?: number
  serviceFeeFormatted?: string
  fulfillmentFee?: number
  fulfillmentFeeFormatted?: string
  platformFee?: number
  platformFeeFormatted?: string
  feesIncluded?: boolean
  priceHistory?: Array<{ date: string; dateFormatted?: string; price: number }>
  price7DaysAgo?: number
  priceChangePercent?: number
  viewCount?: number
  viewsLast24h?: number
  soldCount?: number
  soldRecently?: boolean
  priceTrend?: string
  demandLevel?: string
  sellerVerified?: boolean
  sellerTransactionCount?: number
  refundPolicy?: string
  transferMethod?: string
  bundleOptions?: {
    parking?: boolean | number
    clubAccess?: boolean
    vipAccess?: boolean
    backstagePass?: boolean
    foodCredit?: number
  }
  premiumFeatures?: string[]
  valueScore?: number
  valueScoreColor?: string
  priceVsMedian?: number
  priceVsSimilarSeats?: number
  marketValue?: number
  savingsAmount?: number
  savingsPercent?: number
}

export default function EventPage() {
  const params = useParams()
  const router = useRouter()
  const [event, setEvent] = useState<Event | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState('price_asc')
  const [filters, setFilters] = useState({
    minPrice: '',
    maxPrice: '',
    section: '',
    deliveryMethod: ''
  })

  useEffect(() => {
    fetchEvent()
  }, [params.id])

  useEffect(() => {
    if (event) {
      fetchListings()
    }
  }, [params.id, sort, filters, event])

  const fetchEvent = async () => {
    try {
      const response = await fetch(`${API_URL}/events/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setEvent(data)
      } else {
        router.push('/')
      }
    } catch (error) {
      console.error('Error fetching event:', error)
      router.push('/')
    }
  }

  const fetchListings = async () => {
    if (!params.id) return
    setLoading(true)
    try {
      const queryParams = new URLSearchParams({ sort })
      if (filters.minPrice) queryParams.append('minPrice', filters.minPrice)
      if (filters.maxPrice) queryParams.append('maxPrice', filters.maxPrice)
      if (filters.section) queryParams.append('section', filters.section)
      if (filters.deliveryMethod) queryParams.append('deliveryMethod', filters.deliveryMethod)

      const response = await fetch(`${API_URL}/events/${params.id}/listings?${queryParams}`)
      if (response.ok) {
        const data = await response.json()
        setListings(data)
      }
      setLoading(false)
    } catch (error) {
      console.error('Error fetching listings:', error)
      setLoading(false)
    }
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const getSections = () => {
    const sections = new Set(listings.map(l => l.section))
    return Array.from(sections).sort()
  }

  const getDeliveryMethods = () => {
    const methods = new Set(listings.map(l => l.deliveryMethod))
    return Array.from(methods).sort()
  }

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 >= 0.5
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0)
    
    return (
      <div className="flex items-center gap-1">
        {Array(fullStars).fill(0).map((_, i) => (
          <svg key={i} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        {hasHalfStar && (
          <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
            <defs>
              <linearGradient id="half">
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path fill="url(#half)" d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        )}
        {Array(emptyStars).fill(0).map((_, i) => (
          <svg key={i} className="w-4 h-4 text-gray-300 fill-current" viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        <span className="ml-1 text-sm text-gray-600">({rating.toFixed(1)})</span>
      </div>
    )
  }

  if (loading && !event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading event...</p>
        </div>
      </div>
    )
  }

  if (!event) {
    return null
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
              ← Back to Events
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Event Info Section */}
        <div className="bg-white rounded-lg shadow-md p-8 mb-6">
          <div className="mb-2">
            <span className="text-sm font-semibold text-blue-600 uppercase tracking-wide">
              {event.category}
            </span>
          </div>
          <h1 className="text-4xl font-bold mb-2">{event.title}</h1>
          <p className="text-2xl text-gray-600 mb-6">{event.artist}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <div className="font-semibold">Date & Time</div>
                <div className="text-gray-600">{event.dateFormatted} at {event.time}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <div className="font-semibold">Venue</div>
                <div className="text-gray-600">{event.venue.name}</div>
                {event.venue.address && (
                  <div className="text-gray-500 text-sm">{event.venue.address}</div>
                )}
                {event.venue.city && event.venue.state && (
                  <div className="text-gray-500 text-sm">{event.venue.city}, {event.venue.state}</div>
                )}
              </div>
            </div>
          </div>

          {event.description && (
            <div className="mb-4">
              <p className="text-gray-700">{event.description}</p>
            </div>
          )}

          {event.listingsCount !== undefined && (
            <div className="text-lg font-semibold text-blue-600">
              {event.listingsCount} listings available
            </div>
          )}
        </div>

        {/* Filters and Sort */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Sort By</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="price_asc">Price (Low-High)</option>
                <option value="price_desc">Price (High-Low)</option>
                <option value="section">Section</option>
                <option value="quantity">Quantity</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Min Price</label>
              <input
                type="number"
                value={filters.minPrice}
                onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                placeholder="Min"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Max Price</label>
              <input
                type="number"
                value={filters.maxPrice}
                onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                placeholder="Max"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Section</label>
              <select
                value={filters.section}
                onChange={(e) => handleFilterChange('section', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">All Sections</option>
                {getSections().map(section => (
                  <option key={section} value={section}>{section}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Delivery</label>
              <select
                value={filters.deliveryMethod}
                onChange={(e) => handleFilterChange('deliveryMethod', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">All Methods</option>
                {getDeliveryMethods().map(method => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Listings Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading listings...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <p className="text-xl text-gray-600">No listings found matching your filters.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deal</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Section</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Row</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seats</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price/Ticket</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Seller</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {listings.map((listing, index) => (
                    <tr key={listing.id} className={`hover:bg-gray-50 ${index === 0 && sort === 'price_asc' ? 'bg-blue-50' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {listing.imageUrl && (
                          <img 
                            src={listing.imageUrl} 
                            alt={`${listing.section} ${listing.row}`}
                            className="w-16 h-12 object-cover rounded"
                          />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {listing.dealScore !== undefined && (
                          <div className="flex items-center gap-2">
                            <div 
                              className={`w-8 h-8 rounded flex items-center justify-center font-bold text-white ${
                                listing.dealScoreColor === 'green' ? 'bg-green-500' :
                                listing.dealScoreColor === 'yellow' ? 'bg-yellow-500' :
                                'bg-red-500'
                              }`}
                            >
                              {listing.dealScore}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{listing.section}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{listing.row}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{listing.seatsDisplay}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{listing.quantity}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{listing.pricePerTicketFormatted}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">{listing.totalPriceFormatted}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">{listing.sellerName}</div>
                          {renderStars(listing.sellerRating)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{listing.deliveryMethod}</td>
                      <td className="px-6 py-4">
                        {listing.notes && listing.notes.length > 0 ? (
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
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <Link
                          href={`/listings/${listing.id}`}
                          className="text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
