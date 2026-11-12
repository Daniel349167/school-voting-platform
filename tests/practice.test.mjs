import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { withPracticeDatabase,electionTablePrefix,electionVoteFunction } from '../server/utils/practice-scope.mjs'
import { requiredRole } from '../shared/security.mjs'
import { blankVoteEnabled } from '../shared/election-options.mjs'

test('la práctica respeta las opciones habilitadas por la institución',()=>{
  for(const v of ['no','false','0','off',false])assert.equal(blankVoteEnabled(v),false)
  for(const v of ['si','sí','yes','true','1','on',' SI ',true])assert.equal(blankVoteEnabled(v),true)
})

test('la práctica mantiene su contexto separado de solicitudes reales simultáneas',async()=>{
  const prefix=()=>electionTablePrefix('eleccion_2026_')
  const rpc=()=>electionVoteFunction('emitir_voto_2026')
  await Promise.all(Array.from({length:30},(_,i)=>i%2 ? withPracticeDatabase(async()=>{
    await new Promise(r=>setTimeout(r,i%3))
    assert.equal(prefix(),'practica_2026_');assert.equal(rpc(),'emitir_voto_practica_2026')
  }) : (async()=>{
    await new Promise(r=>setTimeout(r,i%3))
    assert.equal(prefix(),'eleccion_2026_');assert.equal(rpc(),'emitir_voto_2026')
  })()))
  assert.equal(prefix(),'eleccion_2026_')
  assert.equal(requiredRole('/api/practica/control'),'docente')
  assert.equal(requiredRole('/api/practica/emitir'),'aperturador')
  assert.equal(requiredRole('/api/practica/verificar'),'aperturador')
  assert.equal(requiredRole('/api/practica'),'authenticated')
})

test('votar, repetir y reiniciar en práctica conservan intacta la elección real',async()=>{
  const db=new PGlite()
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
    await db.exec(await fs.readFile(new URL('../supabase/migrations/202611120001_eleccion_2026.sql',import.meta.url),'utf8'))
    const practice=await fs.readFile(new URL('../supabase/migrations/202611120003_practica.sql',import.meta.url),'utf8')
    await db.exec(practice)
    await db.exec("insert into eleccion_2026_alumnos(dni,nombres,apellidos,grado,seccion)values('REAL0001','Alumno','Real','1','A');update eleccion_2026_configuracion set abierta=true where id=1;")
    const count=async(table)=>(await db.query(`select count(*)::int n from ${table}`)).rows[0].n
    const vote=async(dni,id,blank)=>(await db.query('select emitir_voto_practica_2026($1,$2,$3) r',[dni,id,blank])).rows[0].r
    assert.equal(await count('practica_2026_alumnos'),3)
    assert.equal((await vote('PRUEBA01',1,false)).ok,false)
    await db.exec('update practica_2026_configuracion set abierta=true where id=1')
    assert.equal((await vote('PRUEBA01',1,false)).ok,true)
    assert.equal((await vote('PRUEBA01',2,false)).ok,false)
    await db.exec(practice)
    assert.equal(await count('practica_2026_votos'),1)
    assert.equal((await vote('PRUEBA02',null,true)).ok,true)
    assert.equal((await vote('REAL0001',1,false)).ok,false)
    assert.equal((await db.query("select emitir_voto_2026('PRUEBA03',1,false) r")).rows[0].r.ok,false)
    assert.equal(await count('eleccion_2026_votos'),0)
    assert.equal((await db.query("select ya_voto from eleccion_2026_alumnos where dni='REAL0001'")).rows[0].ya_voto,false)
    const definition=(await db.query("select pg_get_functiondef('emitir_voto_practica_2026(text,integer,boolean)'::regprocedure) d")).rows[0].d
    assert.ok(!definition.includes('eleccion_2026_'))
    await db.query('select reiniciar_practica_2026()')
    assert.equal(await count('practica_2026_votos'),0)
    assert.equal((await db.query('select count(*)::int n from practica_2026_alumnos where ya_voto')).rows[0].n,0)
    assert.equal((await db.query('select abierta from practica_2026_configuracion')).rows[0].abierta,false)
    assert.equal((await db.query('select abierta from eleccion_2026_configuracion')).rows[0].abierta,true)
    for(const role of ['anon','authenticated']){
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select * from practica_2026_alumnos'),/permission denied/)
      await assert.rejects(db.query('select reiniciar_practica_2026()'),/permission denied/)
      await db.exec('reset role')
    }
  } finally {await db.close()}
})
