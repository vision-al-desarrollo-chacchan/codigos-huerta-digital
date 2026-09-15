# Códigos Huerta Digital

Panel privado para asignar códigos de acceso y consulta pública por correo y plataforma.

## Puesta en marcha

1. Crear un proyecto en Supabase y ejecutar la migración de `supabase/migrations`.
2. Crear un usuario administrador en Authentication y añadir su UUID a `admin_profiles`.
3. Pegar `apps-script/Code.gs` en Apps Script desde el Gmail central.
4. Crear la propiedad de script `PANEL_TOKEN` y desplegar como aplicación web.
5. Configurar `APPS_SCRIPT_URL` y `APPS_SCRIPT_TOKEN` como secretos de Supabase.
6. Desplegar `lookup-code`.
7. Copiar `.env.example` a `.env.local` y colocar la URL y la clave publicable.
8. Ejecutar `npm install` y `npm run build`.
9. Conectar el repositorio a Cloudflare Pages: comando `npm run build`, salida `dist`.
10. Añadir el dominio `codigos.huertadigital.net.pe`.

La clave secreta de Supabase nunca debe colocarse en GitHub ni en variables `VITE_*`.
