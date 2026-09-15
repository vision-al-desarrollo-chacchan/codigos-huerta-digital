import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const hash = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim()))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ message: 'Método no permitido.' }, 405)

  try {
    const authorization = req.headers.get('Authorization') || ''
    const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')
    const publishableKey = publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY')
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey!, {
      global: { headers: { Authorization: authorization } },
    })

    const { data: { user }, error: userError } = await userDb.auth.getUser()
    if (userError || !user) return json({ message: 'Tu sesión venció. Vuelve a iniciar sesión.' }, 401)

    const { data: admin, error: adminError } = await userDb
      .from('admin_profiles')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (adminError || !admin) return json({ message: 'Acceso de administrador requerido.' }, 403)

    const { client_id, new_pin } = await req.json()
    const clientId = String(client_id || '').trim()
    const newPin = String(new_pin || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(clientId) || newPin.length < 4 || newPin.length > 40) {
      return json({ message: 'El nuevo PIN debe tener entre 4 y 40 caracteres.' }, 400)
    }

    const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
    const adminDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: updated, error: updateError } = await adminDb
      .from('clients')
      .update({ access_code_hash: await hash(newPin) })
      .eq('id', clientId)
      .select('id,name')
      .maybeSingle()
    if (updateError) throw updateError
    if (!updated) return json({ message: 'Cliente no encontrado.' }, 404)

    return json({ ok: true, client: updated })
  } catch (error) {
    console.error(error)
    return json({ message: 'No se pudo cambiar el PIN.' }, 500)
  }
})
