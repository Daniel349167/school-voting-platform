import { createError, defineEventHandler, getHeader, getRequestURL, setResponseHeaders } from 'h3'
import { requiredRole } from '../../shared/security.mjs'
import { getSchoolSession } from '../utils/auth'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  let path: string
  try { path = decodeURIComponent(url.pathname).replace(/\/+/g, '/').replace(/\/+$/, '') }
  catch { throw createError({statusCode:400,statusMessage:'Ruta inválida.'}) }
  if (!path.startsWith('/api/')) return
  setResponseHeaders(event, { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.method)) {
    const origin = getHeader(event, 'origin')
    const originHost = (() => { try { return origin ? new URL(origin).host : null } catch { return 'invalid' } })()
    if (originHost && originHost !== getHeader(event, 'host')) throw createError({ statusCode: 403, statusMessage: 'Origen no permitido.' })
    if (getHeader(event, 'sec-fetch-site') === 'cross-site') throw createError({ statusCode: 403, statusMessage: 'Origen no permitido.' })
  }
  const role = requiredRole(path)
  if (role === 'disabled') throw createError({ statusCode: 410, statusMessage: 'Usa la ruta vigente de votación.' })
  if (!role) return
  const session = getSchoolSession(event)
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Inicia sesión para continuar.' })
  if (role !== 'authenticated' && role !== session.role) throw createError({ statusCode: 403, statusMessage: 'Tu usuario no tiene permiso.' })
  event.context.schoolSession = session
})
