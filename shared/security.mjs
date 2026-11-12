import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'school_session'
export const SESSION_SECONDS = 8 * 60 * 60
const ROLES = new Set(['docente', 'aperturador'])

export function sessionSigningKey(configured, serviceKey) {
  if (configured) return typeof configured === 'string' && configured.length >= 32 ? configured : ''
  if (typeof serviceKey !== 'string' || serviceKey.length < 32) return ''
  // Clave derivada con un contexto exclusivo: nunca se firma con el token de Supabase directamente.
  return createHmac('sha256', serviceKey).update('school-voting-platform/session/2026/v1').digest('hex')
}

export function signSession(user, secret, now = Date.now()) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET debe tener al menos 32 caracteres.')
  if (!ROLES.has(user.role)) throw new Error('Rol inválido.')
  const payload = Buffer.from(JSON.stringify({ sub: String(user.id), role: user.role, exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`
}

export function verifySession(token, secret, now = Date.now()) {
  if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 2048) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const expected = createHmac('sha256', secret).update(parts[0]).digest()
  const actual = Buffer.from(parts[1], 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
    return typeof p.sub === 'string' && ROLES.has(p.role) && Number.isSafeInteger(p.exp) && p.exp > Math.floor(now / 1000) ? p : null
  } catch { return null }
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 256 || typeof stored !== 'string') return false
  const [kind, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(hash || '')) return false
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'))
}

export function requiredRole(path) {
  if (path === '/api/practica/control') return 'docente'
  if (path === '/api/practica/verificar' || path === '/api/practica/emitir') return 'aperturador'
  if (path === '/api/votar') return 'disabled'
  if (path.startsWith('/api/alumnos/') || path === '/api/eleccion' || path === '/api/votos/export' || path === '/api/votos/realtime') return 'docente'
  if (path.startsWith('/api/salones/') || path === '/api/votos/avance-salon' || path === '/api/votos/estado') return 'authenticated'
  if (path === '/api/votos/verificar' || path === '/api/votos/emitir') return 'aperturador'
  if (['/api/login','/api/logout','/api/session','/api/votos/resultados'].includes(path)) return null
  return path.startsWith('/api/') ? 'authenticated' : null
}

export function validateVote(body, allowBlank = true) {
  if (!body || typeof body.dni !== 'string' || !/^[A-Z0-9-]{4,32}$/.test(body.dni)) return 'Ingresa un DNI o código válido.'
  if (typeof body.enBlanco !== 'boolean') return 'Voto inválido.'
  if (body.enBlanco) return !allowBlank ? 'El voto en blanco está deshabilitado.' : body.candidatoId !== null ? 'Voto inválido.' : null
  return Number.isSafeInteger(body.candidatoId) && body.candidatoId > 0 ? null : 'Selecciona una lista válida.'
}
