import { getCookie, type H3Event } from 'h3'
import { SESSION_COOKIE, verifySession } from '../../shared/security.mjs'

export function getSchoolSession(event: H3Event) {
  return verifySession(getCookie(event, SESSION_COOKIE), useRuntimeConfig().sessionSecret)
}
