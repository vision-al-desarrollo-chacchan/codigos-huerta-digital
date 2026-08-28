import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}
const hashAccessCode=async(value:string)=>{const bytes=new TextEncoder().encode(value.trim());const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return Response.json({message:'Método no permitido.'},{status:405,headers:cors})
  try{
    const {email,platform_id,access_code}=await req.json()
    const normalized=String(email||'').trim().toLowerCase()
    const access=String(access_code||'').trim()
    if(!/^\S+@\S+\.\S+$/.test(normalized)||!platform_id||access.length<4||access.length>40)return Response.json({message:'Datos inválidos.'},{status:400,headers:cors})
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
    const key=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const db=createClient(Deno.env.get('SUPABASE_URL')!,key!)
    const accessHash=await hashAccessCode(access)
    const {data,error}=await db.from('code_assignments').select('id,code,platforms(name)').eq('customer_email',normalized).eq('platform_id',platform_id).eq('access_code_hash',accessHash).eq('status','available').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(error)throw error
    if(!data)return Response.json({message:'Correo o código de acceso incorrecto.'},{status:404,headers:cors})
    const viewed_at=new Date().toISOString()
    const {data:updated,error:updateError}=await db.from('code_assignments').update({status:'viewed',viewed_at}).eq('id',data.id).eq('status','available').select('id').maybeSingle()
    if(updateError||!updated)return Response.json({message:'Este código ya fue consultado.'},{status:409,headers:cors})
    return Response.json({assignment:{code:data.code,platform:(data.platforms as {name:string})?.name||platform_id,viewed_at}},{headers:{...cors,'Content-Type':'application/json'}})
  }catch{return Response.json({message:'No pudimos completar la consulta.'},{status:500,headers:cors})}
})
