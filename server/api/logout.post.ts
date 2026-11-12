import { defineEventHandler, deleteCookie } from 'h3'
import { SESSION_COOKIE } from '../../shared/security.mjs'
export default defineEventHandler((event) => {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  deleteCookie(event, 'user_role', { path: '/' })
  return { ok: true }
})
