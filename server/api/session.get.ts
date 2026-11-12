import { defineEventHandler } from 'h3'
import { getSchoolSession } from '../utils/auth'
export default defineEventHandler((event) => {
  const session = getSchoolSession(event)
  return { ok: !!session, role: session?.role ?? null }
})
