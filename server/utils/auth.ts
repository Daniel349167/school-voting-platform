import { getCookie, type H3Event } from 'h3'
import { SESSION_COOKIE, verifySession, sessionSigningKey } from '../../shared/security.mjs'

export function getSchoolSigningKey() {
  const cfg = useRuntimeConfig()
  return sessionSigningKey(cfg.sessionSecret, cfg.supabaseServiceRole)
}

export function getSchoolSession(event: H3Event) {
  return verifySession(getCookie(event, SESSION_COOKIE), getSchoolSigningKey())
}
