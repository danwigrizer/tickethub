import { getServerApiUrl } from '@/lib/api'
import EventPage from './EventClient'

async function getEvent(id: string) {
  try {
    const apiUrl = getServerApiUrl()
    const res = await fetch(`${apiUrl}/events/${id}`, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function getListings(id: string) {
  try {
    const apiUrl = getServerApiUrl()
    const res = await fetch(`${apiUrl}/events/${id}/listings`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [event, listings] = await Promise.all([getEvent(id), getListings(id)])
  return <EventPage initialEvent={event} initialListings={listings} />
}
