import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/api'

export interface LocalUser {
  id: string
  full_name: string
  email: string
  created_at: string
  user_metadata?: { full_name?: string }
}

interface AuthContextValue {
  session: LocalUser | null
  user: LocalUser | null
  loading: boolean
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  refreshSession: async () => undefined,
  signOut: async () => undefined,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LocalUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ user: LocalUser | null }>('/auth/me').then(({ user }) => setSession(user)).catch(() => setSession(null)).finally(() => setLoading(false))
  }, [])

  const refreshSession = async () => {
    try {
      const { user } = await api<{ user: LocalUser | null }>('/auth/me')
      setSession(user)
    } catch {
      setSession(null)
    }
  }

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' })
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, user: session, loading, refreshSession, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
