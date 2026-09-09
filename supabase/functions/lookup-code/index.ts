import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const queries:Record<string,string>={netflix:'from:(netflix.com)',disney:'from:(disneyplus.com OR disney.com)',max:'from:(max.com OR hbomax.com)',prime:'from:(amazon.com OR primevideo.com)',apple:'from:(apple.com)'}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{...cors,'Content-Type':'application/json'}})
const hash=async(value:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value.trim()));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
const fromB64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0))

async function decrypt(ciphertext:string,iv:string,secret:string){
  const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))
  const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt'])
  const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(iv)},key,fromB64(ciphertext))
  return new TextDecoder().decode(clear)
}

function decode(value?:string){
  if(!value)return ''
  try{const normalized=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4);return new TextDecoder().decode(fromB64(normalized))}catch{return ''}
}
type Part={body?:{data?:string};parts?:Part[]}
const body=(part?:Part):string=>part?`${decode(part.body?.data)}\n${(part.parts||[]).map(body).join('\n')}`:''
const clean=(value:string)=>value.replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim()
function extract(value:string){
  for(const pattern of [/(?:c[oó]digo|code|pin|passcode)[^\d]{0,250}(\d{6})(?!\d)/i,/(?<!\d)(\d{6})[^\w]{0,120}(?:es tu c[oó]digo|is your code|verification code)/i,/(?<!\d)(\d{6})(?!\d)/]){const match=value.match(pattern);if(match)return match[1]}
  return null
}

async function googleToken(refreshToken:string){
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:Deno.env.get('GMAIL_CLIENT_ID')!,client_secret:Deno.env.get('GMAIL_CLIENT_SECRET')!,refresh_token:refreshToken,grant_type:'refresh_token'})})
  const result=await response.json();if(!response.ok||!result.access_token)throw new Error('Google token');return String(result.access_token)
}

async function latestCode(accessToken:string,platform:string){
  const listResponse=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=${encodeURIComponent(`${queries[platform]} newer_than:1d`)}`,{headers:{Authorization:`Bearer ${accessToken}`}})
  const list=await listResponse.json();if(!listResponse.ok)throw new Error('Gmail list')
  for(const item of list.messages||[]){
    const response=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=full`,{headers:{Authorization:`Bearer ${accessToken}`}})
    const message=await response.json();if(!response.ok)continue
    const receivedAt=Number(message.internalDate||0);if(!receivedAt||Date.now()-receivedAt>30*60_000)continue
    const headers=message.payload?.headers||[];const subject=headers.find((h:{name:string})=>h.name.toLowerCase()==='subject')?.value||''
    const code=extract(clean(`${subject}\n${body(message.payload)}`));if(code)return {code,messageId:String(message.id)}
  }
  return null
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return json({message:'Método no permitido.'},405)
  try{
    const {email,platform_id,access_code}=await req.json();const normalized=String(email||'').trim().toLowerCase();const platform=String(platform_id||'').trim().toLowerCase();const access=String(access_code||'').trim()
    if(!/^\S+@\S+\.\S+$/.test(normalized)||!queries[platform]||access.length<4||access.length>40)return json({message:'Datos inválidos.'},400)
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');const db=createClient(Deno.env.get('SUPABASE_URL')!,secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:client,error:clientError}=await db.from('clients').select('id').eq('access_code_hash',await hash(access)).eq('status','active').maybeSingle();if(clientError)throw clientError
    if(!client)return json({message:'Correo o código de acceso incorrecto.'},404)
    const {data:account,error:accountError}=await db.from('client_accounts').select('id').eq('client_id',client.id).eq('platform_id',platform).eq('account_email',normalized).eq('active',true).maybeSingle();if(accountError)throw accountError
    if(!account)return json({message:'Correo o código de acceso incorrecto.'},404)
    const {data:connection,error:connectionError}=await db.from('gmail_connections').select('refresh_token_ciphertext,refresh_token_iv,status,connected_by').eq('client_id',client.id).maybeSingle();if(connectionError)throw connectionError
    if(!connection||connection.status!=='active')return json({message:'El Gmail de este cliente todavía no está conectado.'},409)
    const refreshToken=await decrypt(connection.refresh_token_ciphertext,connection.refresh_token_iv,Deno.env.get('GMAIL_TOKEN_ENCRYPTION_KEY')!);const found=await latestCode(await googleToken(refreshToken),platform)
    if(!found)return json({message:'No encontramos un código reciente. Solicita uno nuevo y vuelve a intentar.'},404)
    const {data:inserted,error:insertError}=await db.from('code_assignments').insert({client_id:client.id,customer_email:normalized,platform_id:platform,code:found.code,source_message_id:found.messageId,created_by:connection.connected_by}).select('id,code,platforms(name)').maybeSingle()
    if(insertError?.code==='23505')return json({message:'Ese código ya fue consultado. Solicita uno nuevo.'},409);if(insertError||!inserted)throw insertError||new Error('Insert')
    const viewed_at=new Date().toISOString();const {data:updated,error:updateError}=await db.from('code_assignments').update({status:'viewed',viewed_at}).eq('id',inserted.id).eq('status','available').select('id').maybeSingle();if(updateError||!updated)return json({message:'Este código ya fue consultado.'},409)
    await db.from('gmail_connections').update({last_sync_at:new Date().toISOString(),sync_error:null,updated_at:new Date().toISOString()}).eq('client_id',client.id)
    return json({assignment:{code:inserted.code,platform:(inserted.platforms as {name:string}|null)?.name||platform,viewed_at}})
  }catch(error){console.error(error);return json({message:'No pudimos completar la consulta.'},500)}
})
