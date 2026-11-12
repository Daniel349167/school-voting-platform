import { defineEventHandler, getRequestIP, readBody, setCookie } from 'h3'
import { createHmac } from 'node:crypto'
import { signSession, verifyPassword, SESSION_COOKIE, SESSION_SECONDS } from '../../shared/security.mjs'
import { dbTable, getDatabase } from '../utils/database'
import { getSchoolSigningKey } from '../utils/auth'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = body?.password
  if (!email || email.length > 254 || typeof password !== 'string' || !password || password.length > 256) return { ok: false, msg: 'Completa usuario y contraseña.' }
  const signingKey = getSchoolSigningKey()
  if (!signingKey) return { ok: false, msg: 'Falta configurar la sesión del servidor.' }
  const supa = getDatabase()
  const rateKey = createHmac('sha256', signingKey).update(`${email}|${getRequestIP(event,{xForwardedFor:true}) || 'unknown'}`).digest('hex')
  const { data: allowed, error: rateError } = await supa.rpc('intento_login_2026', { p_email: rateKey })
  if (rateError || !allowed) return { ok: false, msg: 'No se pudo iniciar sesión. Si agotaste los intentos, espera 15 minutos.' }
  const { data: user, error } = await supa.from(dbTable('usuarios')).select('id,email,role,password').eq('email', email).maybeSingle()
  if (error || !user || !verifyPassword(password, user.password)) return { ok: false, msg: 'Credenciales inválidas.' }
  await supa.from(dbTable('intentos_login')).delete().eq('email',rateKey)
  const token = signSession(user, signingKey)
  setCookie(event, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: !import.meta.dev, path: '/', maxAge: SESSION_SECONDS })
  return { ok: true, role: user.role }
})
