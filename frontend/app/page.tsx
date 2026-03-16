import { getServerApiUrl } from '@/lib/api'
import Home from './HomeClient'

async function getEvents() {
  try {
    const apiUrl = getServerApiUrl()
    const res = await fetch(`${apiUrl}/events`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export default async function HomePage() {
  const events = await getEvents()
  return <Home initialEvents={events} />
}
