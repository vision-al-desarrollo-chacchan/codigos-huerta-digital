import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"}
const b64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')

async function sign(value:string,secret:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))))
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  if(req.method!=='POST')return Response.json({message:'Metodo no permitido.'},{status:405,headers:cors})
  try{
    const auth=req.headers.get('Authorization')||''
    const publishable=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')
    const userDb=createClient(Deno.env.get('SUPABASE_URL')!,publishable!,{global:{headers:{Authorization:auth}}})
    const {data:{user}}=await userDb.auth.getUser()
    if(!user)return Response.json({message:'Sesion no valida.'},{status:401,headers:cors})
    const {data:admin}=await userDb.from('admin_profiles').select('user_id').eq('user_id',user.id).maybeSingle()
    if(!admin)return Response.json({message:'Acceso denegado.'},{status:403,headers:cors})
    const {client_id}=await req.json()
    const {data:client}=await userDb.from('clients').select('id').eq('id',client_id).maybeSingle()
    if(!client)return Response.json({message:'Cliente no encontrado.'},{status:404,headers:cors})
    const payload=b64url(new TextEncoder().encode(JSON.stringify({client_id,user_id:user.id,exp:Date.now()+10*60_000,nonce:crypto.randomUUID()})))
    const signature=await sign(payload,Deno.env.get('GMAIL_STATE_SECRET')!)
    const params=new URLSearchParams({client_id:Deno.env.get('GMAIL_CLIENT_ID')!,redirect_uri:Deno.env.get('GMAIL_REDIRECT_URI')!,response_type:'code',scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email',access_type:'offline',prompt:'consent',include_granted_scopes:'true',state:`${payload}.${signature}`})
    return Response.json({url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`},{headers:{...cors,'Content-Type':'application/json'}})
  }catch{return Response.json({message:'No se pudo iniciar la conexion con Gmail.'},{status:500,headers:cors})}
})

