import { FormEvent, useEffect, useState } from 'react'
import { ChevronLeft, Copy, KeyRound, LogOut, Plus, Search, ShieldCheck, Tv } from 'lucide-react'
import { configured, supabase } from './supabase'

type Platform = { id: string; name: string }
type Assignment = { id: string; customer_email: string; code: string; status: string; created_at: string; platforms: { name: string } | null }
const demoPlatforms: Platform[] = [{id:'netflix',name:'Netflix'},{id:'disney',name:'Disney+'},{id:'max',name:'Max'},{id:'prime',name:'Prime Video'},{id:'apple',name:'Apple TV+'}]
async function hashAccessCode(value:string){const bytes=new TextEncoder().encode(value.trim());const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}

export function App() {
  const [admin, setAdmin] = useState(false)
  const [session, setSession] = useState(false)
  useEffect(() => { if (!configured) return; supabase.auth.getSession().then(({data}) => setSession(Boolean(data.session))); return supabase.auth.onAuthStateChange((_e,s) => setSession(Boolean(s))).data.subscription.unsubscribe }, [])
  if (admin) return <Admin onBack={() => setAdmin(false)} loggedIn={session} />
  return <Lookup onAdmin={() => setAdmin(true)} />
}

function Lookup({onAdmin}:{onAdmin:()=>void}) {
  const [email,setEmail]=useState(''); const [platform,setPlatform]=useState(''); const [access,setAccess]=useState(''); const [loading,setLoading]=useState(false)
  const [result,setResult]=useState<{code:string;platform:string;viewed_at:string}|null>(null); const [message,setMessage]=useState(''); const [copied,setCopied]=useState(false)
  const submit=async(e:FormEvent)=>{e.preventDefault();setResult(null);setMessage('');setLoading(true)
    if(!configured){setTimeout(()=>{setMessage('El sistema está listo para conectar con Supabase.');setLoading(false)},500);return}
    const {data,error}=await supabase.functions.invoke('lookup-code',{body:{email,platform_id:platform,access_code:access}}); setLoading(false)
    if(error||!data?.assignment){setMessage(data?.message||'Correo o datos de acceso incorrectos.');return} setResult(data.assignment)
  }
  const copy=async()=>{if(!result)return;await navigator.clipboard.writeText(result.code);setCopied(true);setTimeout(()=>setCopied(false),1800)}
  return <main className="shell secure-shell">
    <nav><div className="brand"><div className="brandmark"><Tv size={22}/></div><span>Huerta <b>Digital</b></span></div><button className="admin-link" onClick={onAdmin}><ShieldCheck size={17}/> Administrador</button></nav>
    <section className="secure-hero">
      <div className="secure-pill"><span></span>MULTI-PLATAFORMA</div>
      <h1>Web<br/><em>Segura</em></h1>
      <p>Acceso seguro y automático a los códigos de verificación de las principales plataformas.</p>
      <form className="secure-card" onSubmit={submit}>
        <h3><Search size={15}/> Consultar datos de acceso</h3>
        <div className="secure-fields">
          <div><label>PLATAFORMA <b>*</b></label><select required value={platform} onChange={e=>setPlatform(e.target.value)}><option value="">Seleccionar</option>{demoPlatforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label>CORREO <b>*</b></label><input required type="email" placeholder="cliente@correo.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div><label>CÓDIGO DE ACCESO <b>*</b></label><input required minLength={4} maxLength={40} placeholder="Ej. Andrexx" value={access} onChange={e=>setAccess(e.target.value)}/></div>
        </div>
        {message&&<div className="secure-error">×&nbsp; {message}</div>}
        <button className="secure-search" disabled={!platform||!email||access.trim().length<4||loading}><Search size={16}/>{loading?'BUSCANDO...':'BUSCAR'}</button>
        {result&&<div className="result secure-result"><small>CÓDIGO PARA {result.platform.toUpperCase()}</small><strong>{result.code}</strong><button type="button" onClick={copy}><Copy size={17}/>{copied?'Copiado':'Copiar código'}</button></div>}
      </form>
    </section>
    <footer>© 2026 Huerta Digital · Acceso protegido</footer>
  </main>
}

function Admin({onBack,loggedIn}:{onBack:()=>void;loggedIn:boolean}) {
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [items,setItems]=useState<Assignment[]>([])
  const [customer,setCustomer]=useState('');const [platform,setPlatform]=useState('');const [code,setCode]=useState('');const [access,setAccess]=useState('');const [saved,setSaved]=useState('')
  const login=async(e:FormEvent)=>{e.preventDefault();setError('');if(!configured){setError('Falta conectar el proyecto de Supabase.');return}const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError('Correo o contraseña incorrectos.')}
  const load=async()=>{const {data}=await supabase.from('code_assignments').select('id,customer_email,code,status,created_at,platforms(name)').order('created_at',{ascending:false}).limit(30);setItems((data as unknown as Assignment[])||[])}
  useEffect(()=>{if(loggedIn)load()},[loggedIn])
  const add=async(e:FormEvent)=>{e.preventDefault();setSaved('');const access_code_hash=await hashAccessCode(access);const {error}=await supabase.from('code_assignments').insert({customer_email:customer.trim().toLowerCase(),platform_id:platform,code:code.trim(),access_code_hash});if(error){setSaved('No se pudo guardar: '+error.message);return}setCustomer('');setCode('');setAccess('');setSaved('Código y acceso asignados correctamente.');load()}
  if(!loggedIn)return <main className="shell admin-shell"><button className="back" onClick={onBack}><ChevronLeft/> Volver a consulta</button><form className="card login" onSubmit={login}><div className="login-icon"><KeyRound/></div><h2>Panel administrador</h2><p>Ingresa con tu cuenta autorizada.</p><label>Correo</label><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/><label>Contraseña</label><input required type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="primary">Ingresar</button>{error&&<div className="notice">{error}</div>}</form></main>
  return <main className="dashboard"><header><div className="brand"><div className="brandmark"><Tv size={22}/></div><span>Huerta <b>Digital</b></span></div><button onClick={()=>supabase.auth.signOut()}><LogOut size={17}/>Salir</button></header><div className="dash-grid"><aside><button className="active"><KeyRound/>Códigos</button><button onClick={onBack}><Search/>Consulta pública</button></aside><section><div className="title"><div><small>ADMINISTRACIÓN</small><h1>Gestión de códigos</h1></div></div><form className="card assignment" onSubmit={add}><h3><Plus/>Asignar nuevo código</h3><div className="form-grid"><div><label>Correo del cliente</label><input required type="email" placeholder="cliente@correo.com" value={customer} onChange={e=>setCustomer(e.target.value)}/></div><div><label>Plataforma</label><select required value={platform} onChange={e=>setPlatform(e.target.value)}><option value="">Seleccionar</option>{demoPlatforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div><label>Código de plataforma</label><input required placeholder="Ej. 839204" value={code} onChange={e=>setCode(e.target.value)}/></div><div><label>Código de acceso</label><input required minLength={4} maxLength={40} placeholder="Ej. Andrexx" value={access} onChange={e=>setAccess(e.target.value)}/></div><button className="primary">Guardar y asignar</button></div>{saved&&<div className="notice">{saved}</div>}</form><div className="card table-card"><h3>Códigos recientes</h3><div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>PLATAFORMA</th><th>CÓDIGO</th><th>ESTADO</th><th>FECHA</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td>{i.customer_email}</td><td>{i.platforms?.name||'—'}</td><td className="mono">{i.code}</td><td><span className={'badge '+i.status}>{i.status}</span></td><td>{new Date(i.created_at).toLocaleString('es-PE')}</td></tr>)}{!items.length&&<tr><td colSpan={5} className="empty">Aún no hay códigos registrados.</td></tr>}</tbody></table></div></div></section></div></main>
}
