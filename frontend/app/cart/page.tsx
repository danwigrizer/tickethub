'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API_URL = 'http://localhost:3001/api'

interface CartItem {
  listingId: number
  quantity: number
  listing: {
    id: number
    section: string
    row: string
    seatsDisplay: string
    pricePerTicket: number
    pricePerTicketFormatted: string
    fees?: number
    feesFormatted?: string
    totalPrice: number
    totalPriceFormatted: string
    sellerName: string
    sellerRating: number
    deliveryMethod: string
  }
  event: {
    id: number
    title: string
    artist: string
    dateFormatted: string
    time: string
    venue: {
      name: string
    }
  }
}

export default function Cart() {
  const router = useRouter()
  const [cartItems, setCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCart()
  }, [])

  const fetchCart = async () => {
    try {
      const response = await fetch(`${API_URL}/cart`)
      const data = await response.json()
      setCartItems(data)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching cart:', error)
      setLoading(false)
    }
  }

  const removeFromCart = async (listingId: number) => {
    try {
      await fetch(`${API_URL}/cart/${listingId}`, { method: 'DELETE' })
      fetchCart()
    } catch (error) {
      console.error('Error removing from cart:', error)
    }
  }

  const calculateTotal = () => {
    return cartItems.reduce((sum, item) => {
      // totalPrice already includes fees if configured
      return sum + item.listing.totalPrice * item.quantity
    }, 0)
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
              <linearGradient id={`half-${rating}`}>
                <stop offset="50%" stopColor="currentColor" />
                <stop offset="50%" stopColor="transparent" stopOpacity="1" />
              </linearGradient>
            </defs>
            <path fill={`url(#half-${rating})`} d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        )}
        {Array(emptyStars).fill(0).map((_, i) => (
          <svg key={i} className="w-4 h-4 text-gray-300 fill-current" viewBox="0 0 20 20">
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        ))}
        <span className="ml-1 text-xs text-gray-600">({rating.toFixed(1)})</span>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading cart...</p>
        </div>
      </div>
    )
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
              Continue Shopping
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-3xl font-bold mb-8">Shopping Cart</h1>

        {cartItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-xl text-gray-600 mb-4">Your cart is empty</p>
            <Link href="/" className="text-blue-600 hover:underline">
              Browse events
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {cartItems.map((item) => (
                <div key={item.listingId} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between">
                    <div className="flex-1">
                      <Link href={`/events/${item.event.id}`} className="hover:underline">
                        <h2 className="text-xl font-bold mb-1">{item.event.title}</h2>
                      </Link>
                      <p className="text-gray-600 mb-2">{item.event.artist}</p>
                      <div className="text-sm text-gray-600 space-y-1 mb-4">
                        <div>{item.event.dateFormatted} at {item.event.time}</div>
                        <div>{item.event.venue.name}</div>
                      </div>
                      
                      <div className="border-t pt-4 space-y-2">
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Section: </span>
                            <span className="font-semibold">{item.listing.section}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Row: </span>
                            <span className="font-semibold">{item.listing.row}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Seats: </span>
                            <span className="font-semibold">{item.listing.seatsDisplay}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Quantity: </span>
                            <span className="font-semibold">{item.quantity}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Price per ticket: </span>
                            <span className="font-semibold">{item.listing.pricePerTicketFormatted}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Seller: </span>
                            <span className="font-semibold">{item.listing.sellerName}</span>
                            {renderStars(item.listing.sellerRating)}
                          </div>
                          <div>
                            <span className="text-gray-600">Delivery: </span>
                            <span className="font-semibold">{item.listing.deliveryMethod}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-blue-600 mb-4">
                        ${(item.listing.totalPrice * item.quantity).toFixed(2)}
                      </div>
                      <button
                        onClick={() => removeFromCart(item.listingId)}
                        className="text-sm text-red-600 hover:text-red-800 font-semibold"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-6 sticky top-4">
                <h2 className="text-xl font-bold mb-4">Order Summary</h2>
                <div className="space-y-2 mb-4">
                  {cartItems.map((item) => (
                    <div key={item.listingId} className="flex justify-between text-sm">
                      <span>{item.event.title} - {item.listing.section} x{item.quantity}</span>
                      <span>${(item.listing.totalPrice * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between text-xl font-bold">
                    <span>Total</span>
                    <span className="text-blue-600">${calculateTotal().toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-6 text-sm text-gray-600">
                  <p className="mb-2">Your tickets are reserved for a limited time.</p>
                  <p>Complete your purchase to secure your seats.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
