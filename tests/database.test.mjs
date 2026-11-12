import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('migración real de PostgreSQL, voto atómico, padrón inmutable y acceso restringido', async () => {
  const db=new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    const migration=await fs.readFile(new URL('../supabase/migrations/202611120001_eleccion_2026.sql',import.meta.url),'utf8')
    await db.exec(migration)
    await db.exec(migration) // reproducible y sin reiniciar votos ni configuración
    await db.exec("insert into eleccion_2026_alumnos(dni,nombres,apellidos,grado,seccion) values ('00123456','ANA','PEREZ','1','A'),('00123457','LUIS','PAZ','2','B'),('00123458','EVA','DIAZ','3','C')")
    const vote=async (dni,id,blank)=> (await db.query('select emitir_voto_2026($1,$2,$3) as r',[dni,id,blank])).rows[0].r
    assert.equal((await vote('00123456',1,false)).ok,false) // cerrada por defecto
    await db.exec('update eleccion_2026_configuracion set abierta=true where id=1')
    assert.equal((await vote('00123456',999,false)).ok,false)
    assert.equal((await db.query("select ya_voto from eleccion_2026_alumnos where dni='00123456'")).rows[0].ya_voto,false)
    // Forzar un fallo después de INSERT: toda la función debe revertirse.
    await db.exec("create function fail_mark_test() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end $$; create trigger fail_mark_test before update on eleccion_2026_alumnos for each row execute function fail_mark_test();")
    await assert.rejects(vote('00123456',1,false),/test rollback/)
    assert.equal((await db.query('select count(*)::int n from eleccion_2026_votos')).rows[0].n,0)
    await db.exec('drop trigger fail_mark_test on eleccion_2026_alumnos; drop function fail_mark_test();')
    assert.equal((await vote('00123456',1,false)).ok,true)
    assert.equal((await vote('00123456',2,false)).ok,false)
    assert.equal((await db.query('select count(*)::int n from eleccion_2026_votos')).rows[0].n,1)
    assert.equal((await db.query("select ya_voto from eleccion_2026_alumnos where dni='00123456'")).rows[0].ya_voto,true)
    await assert.rejects(db.exec("delete from eleccion_2026_alumnos where dni='00123456'"),/padrón/)
    await assert.rejects(db.exec("update eleccion_2026_alumnos set apellidos='OTRO' where dni='00123457'"),/padrón/)
    await db.exec('update eleccion_2026_configuracion set voto_blanco=false where id=1')
    assert.equal((await vote('00123457',null,true)).ok,false)
    await db.exec('update eleccion_2026_configuracion set voto_blanco=true where id=1')
    assert.equal((await vote('00123457',null,true)).ok,true)
    await db.exec('update eleccion_2026_configuracion set termina_en=now()-interval \'1 second\' where id=1')
    assert.equal((await vote('00123458',1,false)).ok,false)
    const columns=(await db.query("select column_name from information_schema.columns where table_name='eleccion_2026_votos'")).rows.map(r=>r.column_name)
    assert.ok(!columns.includes('dni')); assert.ok(!columns.includes('alumno_id'))
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select * from eleccion_2026_alumnos'),/permission denied/)
      await assert.rejects(vote('00123458',1,false),/permission denied/)
      await db.exec('reset role')
    }
    for(let i=0;i<20;i++) assert.equal((await db.query("select intento_login_2026('test@escuela.invalid') r")).rows[0].r,true)
    assert.equal((await db.query("select intento_login_2026('test@escuela.invalid') r")).rows[0].r,false)
    await db.exec('set role service_role')
    assert.equal((await db.query('select count(*)::int n from eleccion_2026_votos')).rows[0].n,2)
  } finally { await db.close() }
})
