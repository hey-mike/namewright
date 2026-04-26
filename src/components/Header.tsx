import { cookies } from 'next/headers'
import { HeaderClient } from './HeaderClient'

export async function Header() {
  const cookieStore = await cookies()
  const isLoggedIn = cookieStore.has('session')

  return <HeaderClient isLoggedIn={isLoggedIn} />
}
