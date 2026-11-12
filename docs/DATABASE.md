# Modelo de datos de la elección 2026

La [migración versionada](../supabase/migrations/202611120001_eleccion_2026.sql)
crea las siguientes tablas en `public`. Todos los nombres llevan el prefijo
`eleccion_2026_`. Las tablas anteriores permanecen separadas.

| Tabla | Contenido |
| --- | --- |
| `alumnos` | DNI o código, nombres, apellidos, grado, sección y `ya_voto`. |
| `candidatos` | ID, nombre, descripción, imagen y estado activo. |
| `votos` | Papeleta con lista o voto en blanco, grado, sección y fecha. Sin DNI ni nombre. |
| `usuarios` | Correo, contraseña con scrypt y rol docente/aperturador. |
| `configuracion` | Apertura, voto en blanco y fechas opcionales de inicio/cierre. |
| `intentos_login` | Límite temporal de accesos por una clave HMAC de correo y origen de conexión. |

## Registro atómico

`emitir_voto_2026` verifica el horario, apertura, lista activa y voto en blanco.
Bloquea la fila del alumno con `FOR UPDATE`. Si ya votó, no inserta otra papeleta.
La inserción anónima y la actualización de `ya_voto` pertenecen a la misma
transacción. Si cualquiera falla, ambas se revierten.

La tabla de configuración se bloquea con `FOR SHARE` durante el voto. Así, un
cierre concurrente espera la transacción en curso y las solicitudes posteriores
observan la elección cerrada. El trigger del padrón impide modificaciones una
vez iniciada la elección o emitido el primer voto.

Las papeletas conservan grado, sección y fecha para el escrutinio. La ausencia
de DNI elimina el vínculo directo, pero los registros operativos y horarios
deben seguir bajo control del personal responsable.

## Acceso

RLS está habilitado. Los roles `anon`, `authenticated` y `PUBLIC` no tienen
acceso a las tablas ni permiso de ejecutar las funciones de votación/login.
`service_role` se utiliza únicamente en las rutas de servidor.

El middleware verifica la firma y caducidad de la sesión antes de acceder a los
endpoints sensibles. Un valor `user_role=docente` no concede acceso. Las rutas
de modificación del padrón, exportación y configuración requieren docente.
Verificar un alumno y emitir su voto requieren aperturador. La ruta antigua
`/api/votar` responde 410.

El servidor comprueba el origen de las escrituras del navegador, utiliza cookies
HttpOnly con SameSite estricto y Secure en producción y desactiva caché en API.
Las contraseñas se verifican con scrypt y las sesiones se firman con HMAC-SHA256.
Los intentos de login se limitan en PostgreSQL para compartir el límite entre
instancias del servidor.

## Resultados

El público recibe cantidades agregadas, nunca filas del padrón o papeletas.
Mientras la elección está abierta, solo se muestra la participación. Los
conteos por lista se publican al cerrarla o cumplirse `termina_en`. El docente
autenticado puede consultar el escrutinio y exportar agregados junto con una
hoja de participación que no identifica la lista elegida por cada alumno.

Implementación basada en las guías de Supabase sobre
[funciones](https://supabase.com/docs/guides/database/functions) y
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
