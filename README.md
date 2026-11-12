# Votación escolar 2026

Sistema para las elecciones de la I.E. 8161 Manuel Scorza Torre. Nuxt, Vue,
TypeScript y Supabase. Incluye mesa de votación, padrón por salón, apertura y
cierre de la jornada, resultados públicos y exportación a Excel.

## Elección 2026

- Lista 1: imagen y lema proporcionados por la institución.
- Lista 2: Juntos por un colegio mejor.
- Los datos nuevos se guardan en tablas `eleccion_2026_*`, separadas de las
  elecciones anteriores. La migración no borra tablas ni votos anteriores.
- La elección comienza cerrada. El docente carga el padrón y abre la jornada.
- Las papeletas no guardan el DNI ni el nombre. El padrón registra únicamente
  si el alumno ya votó. Ambas operaciones se confirman en una transacción.
- Durante la jornada se publica la participación. Los resultados por lista
  se muestran al cerrar la votación.

## Preparación

Requiere Node.js 24.15 o posterior de la rama 24 y un proyecto Supabase activo.

```sh
npm ci
```

Copia `.env.example` a `.env` y configura la URL y las claves del proyecto.
Opcionalmente, configura `SESSION_SECRET` con al menos 32 caracteres aleatorios.
Si se omite, el servidor deriva una clave de sesión con HMAC y contexto exclusivo
a partir de la credencial privada existente de Supabase. La clave
`SUPABASE_SERVICE_ROLE` y el secreto de sesión son exclusivos del servidor.

Ejecuta las migraciones de `supabase/migrations/` en orden en el SQL Editor de
Supabase. La primera crea la elección y la segunda cierra el acceso directo a
las tablas anteriores sin borrar sus registros. Después prepara e importa el padrón:

```sh
node scripts/prepare-roll.mjs "ruta/al/padron.xlsx" private/padron-2026.json
node --env-file=.env scripts/setup-election.mjs import private/padron-2026.json
```

El lector reconoce las dos filas de cabeceras de SIAGIE, une los apellidos y
normaliza secciones como `1A` a grado `1`, sección `A`. Excluye matrículas
`TRASLADADO` por defecto. Para incluirlas al preparar un padrón utiliza
`--include-transfers`. Los alumnos sin DNI conservan un identificador estable
`CE-<código del estudiante>`. Las filas inválidas o duplicadas impiden importar.
`private/` está excluido de Git. No subas padrones ni credenciales al repositorio.

En un proyecto recuperado se pueden conservar los usuarios anteriores:

```sh
node --env-file=.env scripts/setup-election.mjs migrate-users
```

Esta operación copia los roles docente y aperturador a la elección nueva,
protege las contraseñas con scrypt y no sobrescribe usuarios ya migrados.
En un proyecto nuevo, usa la acción `user` documentada en
[reactivación](docs/REACTIVACION.md).

## Uso

Para ensayar con datos ficticios abre `/practica`. Usa las mismas cuentas del
personal: el docente abre/cierra o reinicia la práctica y la mesa vota con
`PRUEBA01`, `PRUEBA02` o `PRUEBA03`. Sus tablas `practica_2026_*` están separadas
de la elección real. El reinicio solo borra votos ficticios. La práctica reutiliza
la misma verificación y función transaccional, con referencias a sus propias tablas.

```sh
npm run dev
```

- `/login`: ingreso del personal.
- `/docente`: padrón, apertura/cierre, seguimiento y exportaciones.
- `/votar`: mesa habilitada por un usuario con rol `aperturador`.
- `/resultados`: participación y resultados públicos, sin información personal.

El padrón se puede modificar antes del primer voto y con la elección cerrada.
Durante la elección queda protegido también mediante un trigger de PostgreSQL.
La sesión dura ocho horas y el botón de cierre de sesión elimina la cookie.

## Producción y comprobaciones

```sh
npm test
npm audit --omit=dev --audit-level=high
npm run build
npm run preview
```

Las pruebas ejecutan la migración en PostgreSQL mediante PGlite y comprueban
reversión de una transacción fallida, doble voto, cierre, voto en blanco, permisos,
firmas de sesión y lectura del padrón. La integración continua ejecuta estos
controles. PGlite se usa solo para pruebas, no para almacenar votos en producción.

En Vercel configura las mismas variables de `.env` y vuelve a desplegar.
Consulta [reactivación y verificación](docs/REACTIVACION.md) y el
[modelo de datos](docs/DATABASE.md). No se generan resultados simulados cuando
la base de datos falla.
