import { createClient } from 'npm:@supabase/supabase-js@2.57.4'

const fromB64url=(value:string)=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0))
const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes))
async function sign(value:string,secret:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))}
async function encrypt(value:string,secret:string){const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value));return {ciphertext:b64(new Uint8Array(cipher)),iv:b64(iv)}}
const safeEqual=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i])

Deno.serve(async(req)=>{
  const appUrl=Deno.env.get('APP_URL')||'https://codigos.huertadigital.net.pe'
  const redirect=(status:string)=>Response.redirect(`${appUrl}/?gmail=${status}`,302)
  try{
    const url=new URL(req.url);const code=url.searchParams.get('code');const state=url.searchParams.get('state')
    if(!code||!state)return redirect('error')
    const [payload,provided]=state.split('.');if(!payload||!provided)return redirect('error')
    const expected=await sign(payload,Deno.env.get('GMAIL_STATE_SECRET')!);if(!safeEqual(expected,fromB64url(provided)))return redirect('error')
    const decoded=JSON.parse(new TextDecoder().decode(fromB64url(payload)));if(decoded.exp<Date.now())return redirect('expired')
    const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:Deno.env.get('GMAIL_CLIENT_ID')!,client_secret:Deno.env.get('GMAIL_CLIENT_SECRET')!,redirect_uri:Deno.env.get('GMAIL_REDIRECT_URI')!,grant_type:'authorization_code'})})
    const token=await tokenRes.json();if(!tokenRes.ok||!token.refresh_token)throw new Error('token')
    const profileRes=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${token.access_token}`}});const profile=await profileRes.json();if(!profileRes.ok)throw new Error('profile')
    const secretKeys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');const db=createClient(Deno.env.get('SUPABASE_URL')!,secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const {data:client}=await db.from('clients').select('central_gmail').eq('id',decoded.client_id).maybeSingle()
    if(!client||client.central_gmail!==String(profile.emailAddress).toLowerCase())return redirect('wrong-account')
    const encrypted=await encrypt(token.refresh_token,Deno.env.get('GMAIL_TOKEN_ENCRYPTION_KEY')!)
    const {error}=await db.from('gmail_connections').upsert({client_id:decoded.client_id,google_email:String(profile.emailAddress).toLowerCase(),refresh_token_ciphertext:encrypted.ciphertext,refresh_token_iv:encrypted.iv,granted_scope:token.scope||'',status:'active',connected_by:decoded.user_id,connected_at:new Date().toISOString(),sync_error:null},{onConflict:'client_id'})
    if(error)throw error
    return redirect('connected')
  }catch{return redirect('error')}
})

