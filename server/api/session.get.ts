import { defineEventHandler, getCookie } from 'h3'

export default defineEventHandler((event) => {
  const role = getCookie(event, 'user_role') || null
  return { ok: !!role, role }
})
