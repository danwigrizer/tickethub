import { getServerApiUrl } from '@/lib/api'
import ListingDetail from './ListingClient'

async function getListing(id: string) {
  try {
    const apiUrl = getServerApiUrl()
    const res = await fetch(`${apiUrl}/listings/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const listing = await getListing(id)
  return <ListingDetail initialListing={listing} />
}
