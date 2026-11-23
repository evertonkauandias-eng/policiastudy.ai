const API_URL = '/api'

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    let message = 'Não foi possível concluir a ação.'
    try {
      const data = await response.json()
      message = data.message || message
    } catch {
      // Use the generic message for non-JSON responses.
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}
