import { createClient } from 'npm:@supabase/supabase-js@2.57.4'
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return Response.json({message:'Método no permitido.'},{status:405,headers:cors})
  try{
    const {email,platform_id}=await req.json(); const normalized=String(email||'').trim().toLowerCase()
    if(!/^\S+@\S+\.\S+$/.test(normalized)||!platform_id)return Response.json({message:'Datos inválidos.'},{status:400,headers:cors})
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')
    const key=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const db=createClient(Deno.env.get('SUPABASE_URL')!,key!)
    const {data,error}=await db.from('code_assignments').select('id,code,platforms(name)').eq('customer_email',normalized).eq('platform_id',platform_id).eq('status','available').order('created_at',{ascending:false}).limit(1).maybeSingle()
    if(error)throw error;if(!data)return Response.json({message:'No encontramos un código disponible con esos datos.'},{status:404,headers:cors})
    const viewed_at=new Date().toISOString();await db.from('code_assignments').update({status:'viewed',viewed_at}).eq('id',data.id).eq('status','available')
    return Response.json({assignment:{code:data.code,platform:(data.platforms as {name:string})?.name||platform_id,viewed_at}},{headers:{...cors,'Content-Type':'application/json'}})
  }catch{return Response.json({message:'No pudimos completar la consulta.'},{status:500,headers:cors})}
})
