'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const API_URL = 'http://localhost:3001/api'

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
  price7DaysAgo?: number | false
  priceChangePercent?: number
  viewCount?: number
  viewsLast24h?: number
  soldCount?: number
  soldRecently?: boolean
  priceTrend?: string
  demandLevel?: string
  valueScore?: number
  valueScoreColor?: string
  savingsAmount?: number
  savingsPercent?: number
  marketValue?: number
  priceVsMedian?: number
  priceVsSimilarSeats?: number
  bundleOptions?: {
    parking?: boolean | number
    clubAccess?: boolean
    vipAccess?: boolean
    backstagePass?: boolean
    foodCredit?: number
  }
  premiumFeatures?: string[]
  refundPolicy?: string
  transferMethod?: string
  sellerVerified?: boolean
  sellerTransactionCount?: number
  event?: {
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
    totalListingsCount?: number
    listingSupply?: string
  }
}

export default function ListingDetail() {
  const params = useParams()
  const router = useRouter()
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)

  useEffect(() => {
    fetchListing()
  }, [params.id])

  const fetchListing = async () => {
    try {
      const response = await fetch(`${API_URL}/listings/${params.id}`)
      if (response.ok) {
        const data = await response.json()
        setListing(data)
        setLoading(false)
      } else {
        router.push('/')
      }
    } catch (error) {
      console.error('Error fetching listing:', error)
      setLoading(false)
    }
  }

  const addToCart = async () => {
    if (!listing) return
    
    try {
      await fetch(`${API_URL}/cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: listing.id, quantity })
      })
      router.push('/cart')
    } catch (error) {
      console.error('Error adding to cart:', error)
    }
  }

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating)
    const hasHalfStar = rating % 1 >= 0.5
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0)
    
    return (
      <div className="flex items-center gap-1">
        {Array(fullStars).fill(0).map((_, i) => (
          <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        {hasHalfStar && (
          <svg className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
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
          <svg key={i} className="w-5 h-5 text-gray-300 fill-current" viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        <span className="ml-2 text-lg font-semibold text-gray-700">({rating.toFixed(1)})</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading listing...</p>
        </div>
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Listing not found</h1>
          <Link href="/" className="text-blue-600 hover:underline">Back to events</Link>
        </div>
      </div>
    )
  }

  const totalForQuantity = (listing.totalPrice * quantity).toFixed(2)
  const totalFormatted = listing.totalPriceFormatted.replace(/[^0-9.]/g, '')
  const totalDisplay = `$${(parseFloat(totalFormatted) * quantity).toFixed(2)}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <Link href="/" className="text-2xl font-bold text-blue-600">
              TicketHub
            </Link>
            <div className="flex items-center gap-4">
              {listing.event && (
                <Link href={`/events/${listing.event.id}`} className="text-gray-600 hover:text-gray-900">
                  ← Back to Event
                </Link>
              )}
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Home
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm">
          <div className="flex items-center gap-2 text-gray-600">
            <Link href="/" className="hover:text-gray-900">Home</Link>
            <span>/</span>
            {listing.event && (
              <>
                <Link href={`/events/${listing.event.id}`} className="hover:text-gray-900">
                  {listing.event.title}
                </Link>
                <span>/</span>
              </>
            )}
            <span className="text-gray-900">Listing Details</span>
          </div>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Listing Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Event Summary Card */}
            {listing.event && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <Link href={`/events/${listing.event.id}`} className="block hover:opacity-80 transition">
                  <div className="mb-2">
                    <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
                      {listing.event.category}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold mb-2">{listing.event.title}</h2>
                  <p className="text-xl text-gray-600 mb-4">{listing.event.artist}</p>
                  <div className="text-sm text-gray-600">
                    <div>{listing.event.dateFormatted} at {listing.event.time}</div>
                    <div>{listing.event.venue.name}</div>
                  </div>
                </Link>
              </div>
            )}

            {/* Listing Image */}
            {listing.imageUrl && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Listing Image</h2>
                <img 
                  src={listing.imageUrl} 
                  alt={`${listing.section} ${listing.row}`}
                  className="w-full h-64 object-cover rounded-lg"
                />
              </div>
            )}

            {/* Seat Information */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold">Seat Information</h2>
                {listing.dealScore !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Deal Score:</span>
                    <div 
                      className={`w-12 h-12 rounded flex items-center justify-center font-bold text-white text-lg ${
                        listing.dealScoreColor === 'green' ? 'bg-green-500' :
                        listing.dealScoreColor === 'yellow' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`}
                    >
                      {listing.dealScore}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Section</div>
                  <div className="text-2xl font-bold text-blue-600">{listing.section}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Row</div>
                  <div className="text-2xl font-bold text-blue-600">{listing.row}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-1">Seats</div>
                  <div className="text-2xl font-bold text-blue-600">{listing.seatsDisplay}</div>
                </div>
              </div>
              
              {/* Seat Visualization Placeholder */}
              <div className="bg-gray-100 rounded-lg p-8 text-center text-gray-500">
                <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p>Seat Map View</p>
              </div>
            </div>

            {/* Seller Information */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-4">Seller Information</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Seller Name</div>
                  <div className="text-lg font-semibold">{listing.sellerName}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 mb-2">Seller Rating</div>
                  {renderStars(listing.sellerRating)}
                </div>
                {listing.sellerVerified !== undefined && listing.sellerVerified && (
                  <div className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm font-semibold rounded-full">
                    Verified Seller
                  </div>
                )}
                {listing.sellerTransactionCount !== undefined && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Transactions</div>
                    <div className="text-lg font-semibold">{listing.sellerTransactionCount.toLocaleString()} completed</div>
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Information */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold mb-4">Delivery Information</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Delivery Method</div>
                  <div className="text-lg font-semibold">{listing.deliveryMethod}</div>
                </div>
                <div className="text-sm text-gray-500">
                  Listed on {new Date(listing.listedAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Listing Notes */}
            {listing.notes && listing.notes.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Listing Notes</h2>
                <div className="flex flex-wrap gap-2">
                  {listing.notes.map((note, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800"
                    >
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Value Score */}
            {listing.valueScore !== undefined && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Value Score</h2>
                <div className="flex items-center gap-4">
                  <div 
                    className={`w-16 h-16 rounded flex items-center justify-center font-bold text-white text-xl ${
                      listing.valueScoreColor === 'green' ? 'bg-green-500' :
                      listing.valueScoreColor === 'yellow' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`}
                  >
                    {listing.valueScore}
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Experience per dollar rating</div>
                    <div className="text-xs text-gray-500">Based on seat quality vs price</div>
                  </div>
                </div>
              </div>
            )}

            {/* Savings Information */}
            {(listing.savingsAmount !== undefined && listing.savingsAmount > 0) || 
             (listing.savingsPercent !== undefined && listing.savingsPercent > 0) || 
             listing.marketValue !== undefined ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Savings & Value</h2>
                <div className="space-y-3">
                  {listing.marketValue !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Market Value</span>
                      <span className="font-semibold">${listing.marketValue.toFixed(2)}</span>
                    </div>
                  )}
                  {listing.savingsAmount !== undefined && listing.savingsAmount > 0 && (
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-green-800 font-semibold">You Save</span>
                      <span className="text-green-800 font-bold text-lg">${listing.savingsAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {listing.savingsPercent !== undefined && listing.savingsPercent > 0 && (
                    <div className="text-center">
                      <span className="text-green-600 font-semibold">{listing.savingsPercent.toFixed(1)}% below market value</span>
                    </div>
                  )}
                  {listing.priceVsMedian !== undefined && (
                    <div className="text-sm text-gray-600 pt-2 border-t">
                      {listing.priceVsMedian > 0 ? '+' : ''}{listing.priceVsMedian.toFixed(1)}% vs median price
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Price History */}
            {listing.priceHistory && listing.priceHistory.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Price History</h2>
                {listing.priceChangePercent !== undefined && listing.priceChangePercent !== 0 && (
                  <div className="mb-4 p-3 rounded-lg bg-gray-50">
                    <div className="text-sm text-gray-600 mb-1">Price Change (7 days)</div>
                    <div className={`text-lg font-semibold ${
                      listing.priceChangePercent > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {listing.priceChangePercent > 0 ? '+' : ''}{listing.priceChangePercent}%
                      {listing.priceChangePercent > 0 ? ' ↑' : ' ↓'}
                    </div>
                    {listing.price7DaysAgo && typeof listing.price7DaysAgo === 'number' && (
                      <div className="text-sm text-gray-500 mt-1">
                        7 days ago: ${listing.price7DaysAgo.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {listing.priceHistory.map((entry, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <div className="text-sm text-gray-600">
                        {entry.dateFormatted || new Date(entry.date).toLocaleDateString()}
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        ${entry.price.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Demand Indicators */}
            {(listing.viewCount !== undefined || listing.soldCount !== undefined || 
              listing.demandLevel !== undefined || listing.priceTrend !== undefined) && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Demand Indicators</h2>
                <div className="grid grid-cols-2 gap-4">
                  {listing.viewCount !== undefined && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Views</div>
                      <div className="text-lg font-semibold">{listing.viewCount.toLocaleString()}</div>
                      {listing.viewsLast24h !== undefined && (
                        <div className="text-xs text-gray-500">{listing.viewsLast24h} in last 24h</div>
                      )}
                    </div>
                  )}
                  {listing.soldCount !== undefined && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Recently Sold</div>
                      <div className="text-lg font-semibold">{listing.soldCount}</div>
                      {listing.soldRecently && (
                        <div className="text-xs text-orange-600 font-semibold">Selling fast!</div>
                      )}
                    </div>
                  )}
                  {listing.demandLevel !== undefined && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Demand Level</div>
                      <div className={`text-lg font-semibold capitalize ${
                        listing.demandLevel === 'high' ? 'text-red-600' :
                        listing.demandLevel === 'medium' ? 'text-yellow-600' :
                        'text-gray-600'
                      }`}>
                        {listing.demandLevel}
                      </div>
                    </div>
                  )}
                  {listing.priceTrend !== undefined && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Price Trend</div>
                      <div className={`text-lg font-semibold capitalize ${
                        listing.priceTrend === 'increasing' ? 'text-red-600' :
                        listing.priceTrend === 'decreasing' ? 'text-green-600' :
                        'text-gray-600'
                      }`}>
                        {listing.priceTrend}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bundle Options */}
            {listing.bundleOptions && Object.keys(listing.bundleOptions).length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Bundle Options</h2>
                <div className="space-y-3">
                  {listing.bundleOptions.parking !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Parking</span>
                      <span className="font-semibold">
                        {listing.bundleOptions.parking === true ? 'Included' : 
                         typeof listing.bundleOptions.parking === 'number' ? `$${listing.bundleOptions.parking.toFixed(2)}` :
                         'Available'}
                      </span>
                    </div>
                  )}
                  {listing.bundleOptions.clubAccess && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Club Lounge Access</span>
                      <span className="font-semibold text-blue-600">Included</span>
                    </div>
                  )}
                  {listing.bundleOptions.vipAccess && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">VIP Entry</span>
                      <span className="font-semibold text-purple-600">Included</span>
                    </div>
                  )}
                  {listing.bundleOptions.backstagePass && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Backstage Pass</span>
                      <span className="font-semibold text-purple-600">Included</span>
                    </div>
                  )}
                  {listing.bundleOptions.foodCredit !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">Food & Beverage Credit</span>
                      <span className="font-semibold">${listing.bundleOptions.foodCredit.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Premium Features */}
            {listing.premiumFeatures && listing.premiumFeatures.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Premium Features</h2>
                <div className="flex flex-wrap gap-2">
                  {listing.premiumFeatures.map((feature, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-3 py-1 text-sm font-semibold rounded-full bg-purple-100 text-purple-800"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Deal Flags */}
            {listing.dealFlags && listing.dealFlags.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Deal Flags</h2>
                <div className="flex flex-wrap gap-2">
                  {listing.dealFlags.map((flag, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800 capitalize"
                    >
                      {flag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Policies */}
            {(listing.refundPolicy || listing.transferMethod) && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-2xl font-bold mb-4">Policies & Transfer</h2>
                <div className="space-y-4">
                  {listing.refundPolicy && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Refund Policy</div>
                      <div className="font-semibold capitalize">
                        {listing.refundPolicy.replace(/_/g, ' ').replace(/\d+days/g, (match) => match + ' ')}
                      </div>
                    </div>
                  )}
                  {listing.transferMethod && (
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Transfer Method</div>
                      <div className="font-semibold capitalize">
                        {listing.transferMethod.replace(/-/g, ' ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Purchase Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-4">
              <h2 className="text-2xl font-bold mb-6">Purchase Tickets</h2>
              
              <div className="mb-6">
                <label className="block text-sm font-semibold mb-2">Quantity</label>
                <select
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {Array.from({ length: listing.quantity }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">{listing.quantity} tickets available</p>
              </div>

              <div className="border-t pt-6 mb-6">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price per ticket</span>
                    <span className="font-semibold">{listing.pricePerTicketFormatted}</span>
                  </div>
                  {listing.feesFormatted && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Fees</span>
                      <span>{listing.feesFormatted}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold pt-4 border-t">
                    <span>Total</span>
                    <span className="text-blue-600">{totalDisplay}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={addToCart}
                className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition"
              >
                Add to Cart
              </button>

              <div className="mt-6 space-y-3 text-sm text-gray-600">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="font-semibold">100% Buyer Guarantee</div>
                    <div>Your tickets will arrive in time for the event</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div>
                    <div className="font-semibold">Secure Checkout</div>
                    <div>Your payment information is protected</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

