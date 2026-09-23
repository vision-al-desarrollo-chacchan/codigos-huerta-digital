import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const validPlatforms = new Set(['netflix','disney','max','prime','apple'])
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{...cors,'Content-Type':'application/json'}})
const hash=async(value:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.trim()));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
type ScriptResult={ok?:boolean;code?:string;actionUrl?:string;actionType?:'temporary_access'|'household';messageId?:string;message?:string;platform?:string}

function isSafeNetflixUrl(value:string){
  try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='netflix.com'||url.hostname.endsWith('.netflix.com'))}catch{return false}
}

async function requestCode(email:string,platform:string){
  const url=Deno.env.get('APPS_SCRIPT_URL');const token=Deno.env.get('APPS_SCRIPT_TOKEN')
  if(!url||!token)throw new Error('Apps Script no está configurado')
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,platform,token}),redirect:'follow',signal:AbortSignal.timeout(25000)})
  const result=await response.json() as ScriptResult
  if(!response.ok||!result.ok||!result.messageId)return {found:null,message:result.message||'No encontramos un código reciente.'}
  if(result.actionUrl){
    if(platform!=='netflix'||!isSafeNetflixUrl(result.actionUrl))throw new Error('Enlace inválido recibido')
    return {found:{kind:'action' as const,actionUrl:result.actionUrl,actionType:result.actionType==='household'?'household' as const:'temporary_access' as const,messageId:result.messageId},message:''}
  }
  if(!result.code||!/^(?:\d{4}|\d{6})$/.test(result.code))throw new Error('Código inválido recibido')
  return {found:{kind:'code' as const,code:result.code,messageId:result.messageId},message:''}
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({message:'Método no permitido.'},405)
  try{
    const {email,platform_id,access_code}=await req.json();const normalized=String(email||'').trim().toLowerCase();const platform=String(platform_id||'').trim().toLowerCase();const access=String(access_code||'').trim()
    if(!/^\S+@\S+\.\S+$/.test(normalized)||!validPlatforms.has(platform)||access.length<4||access.length>40)return json({message:'Datos inválidos.'},400)
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');const db=createClient(Deno.env.get('SUPABASE_URL')!,secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:client,error:clientError}=await db.from('clients').select('id,created_by').eq('access_code_hash',await hash(access)).eq('status','active').maybeSingle();if(clientError)throw clientError
    if(!client)return json({message:'Correo o código de acceso incorrecto.'},404)
    const {data:account,error:accountError}=await db.from('client_accounts').select('id').eq('client_id',client.id).eq('platform_id',platform).eq('account_email',normalized).eq('active',true).maybeSingle();if(accountError)throw accountError
    if(!account)return json({message:'Correo o código de acceso incorrecto.'},404)
    const {found,message}=await requestCode(normalized,platform);if(!found)return json({message},404)
    if(found.kind==='action')return json({assignment:{type:'action',action_url:found.actionUrl,action_kind:found.actionType,platform:'Netflix',viewed_at:new Date().toISOString()}})
    const {data:inserted,error:insertError}=await db.from('code_assignments').insert({client_id:client.id,customer_email:normalized,platform_id:platform,code:found.code,source_message_id:found.messageId,created_by:client.created_by}).select('id,code,platforms(name)').maybeSingle()
    if(insertError?.code==='23505')return json({message:'Ese código ya fue consultado. Solicita uno nuevo.'},409);if(insertError||!inserted)throw insertError||new Error('Insert')
    const viewed_at=new Date().toISOString();const {data:updated,error:updateError}=await db.from('code_assignments').update({status:'viewed',viewed_at}).eq('id',inserted.id).eq('status','available').select('id').maybeSingle();if(updateError||!updated)return json({message:'Este código ya fue consultado.'},409)
    return json({assignment:{type:'code',code:inserted.code,platform:(inserted.platforms as {name:string}|null)?.name||platform,viewed_at}})
  }catch(error){console.error(error);return json({message:'No pudimos completar la consulta.'},500)}
})
