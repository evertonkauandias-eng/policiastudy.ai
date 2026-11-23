export function normalizeDatabaseUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (process.env.NODE_ENV === 'production' && url.hostname !== 'dpg-dc26pl67bikc738lg4ug-a') {
      url.hostname = 'dpg-dc26pl67bikc738lg4ug-a'
    }
    return url.toString()
  } catch {
    return rawUrl
  }
}
