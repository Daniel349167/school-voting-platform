import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, signSession, verifySession, requiredRole, validateVote } from '../shared/security.mjs'
import { parseRoll } from '../shared/roll.mjs'
import { summarize } from '../shared/results.mjs'

test('una cookie manipulada, un rol sin firma y una sesión vencida no autentican', () => {
  const secret='a'.repeat(64), now=100000
  const token=signSession({id:'7',role:'docente'},secret,now)
  assert.equal(verifySession(token,secret,now).role,'docente')
  assert.equal(verifySession(token.replace('docente','aperturador')+'x',secret,now),null)
  assert.equal(verifySession('docente',secret,now),null)
  assert.equal(verifySession(token,'b'.repeat(64),now),null)
  assert.equal(verifySession(token,secret,now+8*3600*1000),null)
})

test('contraseñas con sal y sin compatibilidad con texto claro', () => {
  const h=hashPassword('una-contraseña-larga')
  assert.notEqual(h,hashPassword('una-contraseña-larga'))
  assert.equal(verifyPassword('una-contraseña-larga',h),true)
  assert.equal(verifyPassword('otra',h),false)
  assert.equal(verifyPassword('demo','demo'),false)
})

test('las rutas sensibles exigen el rol correcto y el voto legado está deshabilitado', () => {
  for (const p of ['/api/alumnos/import','/api/alumnos/add','/api/alumnos/delete','/api/alumnos/export-generados','/api/votos/export','/api/votos/realtime','/api/eleccion']) assert.equal(requiredRole(p),'docente')
  for (const p of ['/api/votos/emitir','/api/votos/verificar']) assert.equal(requiredRole(p),'aperturador')
  assert.equal(requiredRole('/api/votar'),'disabled')
  assert.equal(requiredRole('/api/votos/resultados'),null)
})

test('rechaza votos incompletos, candidatos inválidos y blancos deshabilitados', () => {
  const v={dni:'00123456',candidatoId:1,enBlanco:false}
  assert.equal(validateVote(v),null)
  for (const candidatoId of [null,undefined,0,-1,'1',1.5]) assert.ok(validateVote({...v,candidatoId}))
  assert.ok(validateVote({...v,enBlanco:'false'}))
  assert.ok(validateVote({...v,enBlanco:true,candidatoId:null},false))
  assert.equal(validateVote({...v,enBlanco:true,candidatoId:null}),null)
})

test('SIAGIE: une dos filas de cabeceras, excluye traslados y conserva el código sin DNI', () => {
  const m=[['Informe'],['ITEM','GRADO','SECCIÓN','ESTUDIANTE','','','','','',''],['','','','TIPO DE DOCUMENTO','NÚMERO DE DOCUMENTO','CÓDIGO DEL ESTUDIANTE','APELLIDO PATERNO','APELLIDO MATERNO','NOMBRES','ESTADO DE MATRICULA'],[1,'PRIMERO','1A','DNI','00123456','12345678900001','PEREZ','GOMEZ','ANA','DEFINITIVA'],[2,'SEGUNDO','2B','','','12345678900002','LOPEZ','RUIZ','LUIS','DEFINITIVA'],[3,'TERCERO','3C','DNI','00123457','','DIAZ','PAZ','EVA','TRASLADADO']]
  const a=parseRoll(m),b=parseRoll(m)
  assert.equal(a.total,3); assert.equal(a.alumnos.length,2); assert.equal(a.transferred,1); assert.equal(a.withoutDni,1)
  assert.deepEqual(a,b)
  assert.equal(a.alumnos[0].dni,'00123456')
  assert.equal(a.alumnos[1].dni,'CE-12345678900002')
  assert.equal(a.alumnos[1].seccion,'B')
  assert.equal(parseRoll(m,{includeTransfers:true}).alumnos.length,3)
  assert.equal(parseRoll([...m,m[3]]).errors.length,1)
})

test('los resultados públicos ocultan la elección de lista durante la jornada', () => {
  const alumnos=[{grado:'1'},{grado:'2'}],votos=[{grado:'1',candidato_id:1,en_blanco:false}],candidatos=[{id:1,nombre:'Lista 1'},{id:2,nombre:'Lista 2'}]
  const hidden=summarize(alumnos,votos,candidatos,{hidden:true})
  assert.equal(hidden.totales.totalEmitidos,1)
  assert.ok(hidden.totales.porLista.every(c=>c.conteo===0))
  assert.equal(summarize(alumnos,votos,candidatos).totales.porLista[0].conteo,1)
})
