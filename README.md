# Códigos Huerta Digital

Panel privado para asignar códigos de acceso y consulta pública por correo y plataforma.

## Puesta en marcha

1. Crear un proyecto en Supabase y ejecutar la migración de `supabase/migrations`.
2. Crear un usuario administrador en Authentication y añadir su UUID a `admin_profiles`.
3. Desplegar la función `lookup-code`.
4. Copiar `.env.example` a `.env.local` y colocar la URL y la clave publicable.
5. Ejecutar `npm install` y `npm run build`.
6. Conectar el repositorio a Cloudflare Pages: comando `npm run build`, salida `dist`.
7. Añadir el dominio `codigos.huertadigital.net.pe`.

La clave secreta de Supabase nunca debe colocarse en GitHub ni en variables `VITE_*`.
