# Reactivación

La web está en `https://votacion-escolar-8161.vercel.app`. Su base de producción
es el proyecto Supabase `kppxekadderegjjkrfcb`, llamado "Voto Electronico - 8161".
Se restauró el 12 de noviembre de 2026. La elección 2026 utiliza apertura manual,
las dos listas nuevas y el padrón definitivo preparado para esta elección.

La copia local antigua apuntaba al proyecto distinto `jaswloybzhqvdywzqvti`.
Antes de importar o ejecutar una migración, comprueba que la URL de `.env`
corresponda al entorno deseado y coincida con las variables de Vercel.

## Base de datos

1. Revisa el proyecto en el [panel de Supabase](https://supabase.com/dashboard).
   Si está pausado, restáuralo. Si ya no existe, utiliza un proyecto nuevo.
2. Configura la URL y las claves actuales en `.env` y en Vercel. No las subas a Git.
3. Ejecuta los SQL de `supabase/migrations/` en orden. Crean las tablas y
   funciones de la elección 2026 y bloquean las consultas directas anónimas a
   las tablas anteriores. No eliminan registros de elecciones anteriores.
4. Ejecuta `scripts/prepare-roll.mjs` y la acción `import` de
   `scripts/setup-election.mjs`, siguiendo el README.
5. En un proyecto recuperado, ejecuta `migrate-users`. En uno nuevo, crea un
   docente y un aperturador. La contraseña se recibe por entrada estándar:

```text
node --env-file=.env scripts/setup-election.mjs user correo@colegio.pe docente
node --env-file=.env scripts/setup-election.mjs user mesa@colegio.pe aperturador
```

No incluyas contraseñas en argumentos del comando o archivos versionados.
La acción `user` espera una contraseña de 12 a 256 caracteres en stdin y EOF.
Puede invocarse desde una consola con entrada oculta, un gestor de secretos o
un proceso que suministre stdin sin imprimirlo.

## Despliegue

Configura `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE`,
`PUBLIC_VOTO_BLANCO` en Vercel. `SESSION_SECRET` es opcional: al omitirlo, se
deriva una clave de sesión exclusiva de la credencial privada existente. Si lo
configuras, utiliza al menos 32 caracteres aleatorios y elimina el valor de
ejemplo. Nuxt también acepta las variables equivalentes con
prefijo `NUXT_` para sobrescribir la configuración en ejecución.

El proyecto utiliza Node.js 24, soportado por
[Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
Comprueba la versión y las variables del entorno Production antes de desplegar.

## Verificación con la conexión recuperada

- Confirma que el padrón y las dos listas aparecen en el panel del docente.
- Abre la elección cuando empiece la jornada y habilita las mesas mediante
  el usuario aperturador. Cada alumno ingresa su DNI o el código `CE-...`.
- Comprueba en un entorno de prueba separado un voto, su rechazo al repetirlo,
  un voto en blanco y la actualización de la participación. No emitas votos de
  prueba en el padrón real.
- Cierra la elección desde el panel y comprueba la publicación de resultados.

Las pruebas locales automatizadas no sustituyen la verificación de la conexión
remota ni una prueba de concurrencia con varias computadoras.
