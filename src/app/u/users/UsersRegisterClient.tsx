'use client';
import React, { useState, useEffect, useRef } from 'react';
import { DOCUMENT_TYPE_CHOICES, isValidDocumentNumber, normalizeDocumentNumber } from '@/lib/users/document';
import { ALLOWED_AREAS, type Area } from '@/lib/areas';
import { MONTHS_ES, buildBirthdaySubmission } from '@/lib/birthday';

interface UserRow { id: string; username: string; role: string; personCode: string|null; personName: string|null; dni: string|null; area: string|null; whatsapp?: string|null; birthday?: string|null; }

export default function UsersRegisterClient() {
  const [name, setName] = useState('');
  const [dni, setDni] = useState('');
  const [documentType, setDocumentType] = useState('');
  const documentRef = useRef({ dni: '', type: '' });
  const [lookupBusy, setLookupBusy] = useState(false);
  const [birthYear, setBirthYear] = useState<string|null>(null);
  const [documentSexCode, setDocumentSexCode] = useState<string|null>(null);
  const lookupSnapshot = useRef<{name:string; previousName:string; day:string; month:string; previousDay:string; previousMonth:string}|null>(null);
  const [area, setArea] = useState<Area>(ALLOWED_AREAS[0]);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [birthdayDay, setBirthdayDay] = useState('01');
  const [birthdayMonth, setBirthdayMonth] = useState('01');
  const [msg, setMsg] = useState<string|null>(null);
  const [err, setErr] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
  const r = await fetch('/api/pedidos/users');
      const j = await r.json().catch(()=>({}));
      if (r.ok && j?.ok) setUsers(j.users || []);
    } finally { setLoadingUsers(false); }
  }
  useEffect(()=>{ loadUsers(); }, []);

  function clearLookup() {
    const saved = lookupSnapshot.current; lookupSnapshot.current = null;
    if (saved) { if (name === saved.name) setName(saved.previousName); if (birthdayDay === saved.day && birthdayMonth === saved.month) { setBirthdayDay(saved.previousDay); setBirthdayMonth(saved.previousMonth); } }
    setBirthYear(null); setDocumentSexCode(null);
  }
  async function lookupIdentity() {
    const value = normalizeDocumentNumber(dni);
    if (documentType !== "DNI" || !isValidDocumentNumber(value, "DNI")) { setErr("Selecciona DNI peruano e ingresa 8 dígitos"); return; }
    setLookupBusy(true); setErr(null);
    try {
      const response = await fetch('/api/user/auth/dni-lookup', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dni:value,documentType:'DNI'})});
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'No se pudo consultar el DNI');
      if (documentRef.current.dni !== value || documentRef.current.type !== 'DNI') return;
      const parts = typeof data.birthday === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.birthday) ? data.birthday.split('-') : null;
      lookupSnapshot.current = {name:data.name,previousName:name,day:parts?.[2] || birthdayDay,month:parts?.[1] || birthdayMonth,previousDay:birthdayDay,previousMonth:birthdayMonth};
      setName(data.name); if (parts) { setBirthYear(parts[0]); setBirthdayMonth(parts[1]); setBirthdayDay(parts[2]); }
      setDocumentSexCode(data.documentSexCode || null); setMsg('Datos encontrados. Revísalos antes de guardar.');
    } catch(error) {setErr(error instanceof Error ? error.message : 'No se pudo consultar el DNI');} finally {setLookupBusy(false);}
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);
    const n = name.trim();
    const d = normalizeDocumentNumber(dni);
    if (n.length < 2) { setErr('Nombre inválido'); return; }
    if (!documentType || !isValidDocumentNumber(d, documentType)) { setErr('Selecciona un tipo e ingresa un documento válido'); return; }
    if (!ALLOWED_AREAS.includes(area)) { setErr('Área inválida'); return; }
    if (!password || password.length < 8) { setErr('Password mínimo 8 caracteres'); return; }
    if (password !== confirm) { setErr('Las contraseñas no coinciden'); return; }
    const whatsappDigits = (whatsapp||'').replace(/\D+/g,'');
    if (!whatsappDigits || whatsappDigits.length < 8) { setErr('WhatsApp inválido'); return; }
    const birthday = birthYear ? `${birthYear}-${birthdayMonth}-${birthdayDay}` : buildBirthdaySubmission(birthdayDay, birthdayMonth);
    const payload = { name: n, dni: d, documentType, documentSexCode, area, password, whatsapp: whatsappDigits, birthday };
    try {
      setLoading(true);
      const res = await fetch('/api/pedidos/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const j = await res.json().catch(()=>({}));
      if (res.ok && j?.ok) {
        setMsg(`Colaborador creado: ${j.person.name} (${j.person.dni})`);
        setName(''); setDni(''); setDocumentType(''); documentRef.current={dni:'',type:''}; lookupSnapshot.current=null; setBirthYear(null); setDocumentSexCode(null); setArea(ALLOWED_AREAS[0]); setPassword(''); setConfirm(''); setWhatsapp(''); setBirthdayDay('01'); setBirthdayMonth('01');
        loadUsers();
      } else {
        const code = j?.code || j?.message || res.status;
        const map: Record<string,string> = {
          INVALID_PASSWORD: 'Password mínimo 8 caracteres',
          INVALID_DNI: 'Documento inválido',
          DNI_TAKEN: 'El documento ya existe',
          CODE_TAKEN: 'Código ya existe',
          INVALID_AREA: 'Área inválida',
          INVALID_NAME: 'Nombre inválido',
          USERNAME_TAKEN: 'El documento ya está registrado',
          INVALID_WHATSAPP: 'WhatsApp inválido',
          INVALID_BIRTHDAY: 'Cumpleaños inválido',
        };
        setErr(map[String(code)] || `Error: ${code}`);
      }
    } catch (e: any) {
      setErr(`Error de red: ${String(e?.message || e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string, username: string) {
    const sure = window.confirm(`¿Retirar el acceso de ${username}? Se conservará su historial.`);
    if (!sure) return;
    try {
      const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const j = await r.json().catch(()=>({}));
      if (r.ok && j?.ok) {
        setMsg(`Acceso retirado para ${username}`);
        setErr(null);
        loadUsers();
      } else {
        setErr(`No se pudo eliminar (${j?.code||r.status})`);
      }
    } catch(e: any) {
      setErr(`Error al eliminar: ${String(e?.message||e)}`);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] px-4 py-6">
  <div className="mx-auto max-w-5xl">
  <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Usuarios existentes</h1>
  <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 max-w-prose">Listado de colaboradores registrados. Solo los de rol COLLAB pueden eliminarse desde aquí.</p>
        {/* Existing users table FIRST */}
  <div className="mb-10 border rounded border-slate-300 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Colaboradores</h2>
            <button onClick={loadUsers} disabled={loadingUsers} type="button" className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50" title="Refrescar">
              <svg className={`h-4 w-4 ${loadingUsers?'animate-spin':''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9"/><path d="M3 12a9 9 0 0 0 9 9"/><path d="M7 17l-4-5 4-5"/><path d="M17 7l4 5-4 5"/></svg>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2 pr-4">Código</th>
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Documento</th>
                  <th className="py-2 pr-4">Área</th>
                  <th className="py-2 pr-4">Username</th>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">WhatsApp</th>
                  <th className="py-2 pr-4">Cumpleaños</th>
                  <th className="py-2 pr-4">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b last:border-0 border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-4 font-mono text-xs">{u.personCode}</td>
                    <td className="py-2 pr-4">{u.personName}</td>
                    <td className="py-2 pr-4">{u.dni || '-'}</td>
                    <td className="py-2 pr-4">{u.area || '-'}</td>
                    <td className="py-2 pr-4">{u.username}</td>
                    <td className="py-2 pr-4"><span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[11px] font-mono">{u.role}</span></td>
                    <td className="py-2 pr-4">{u.whatsapp || '-'}</td>
                    <td className="py-2 pr-4">{u.birthday || '-'}</td>
                    <td className="py-2 pr-4">
                      {u.role === 'COLLAB' ? (
                        <button onClick={()=>onDelete(u.id, u.username)} className="text-red-600 dark:text-red-400 hover:underline disabled:opacity-50" disabled={loadingUsers}>Retirar acceso</button>
                      ) : (
                        <span className="text-xs text-slate-500">No permitido</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length===0 && !loadingUsers && (
                  <tr><td colSpan={9} className="py-4 text-slate-500 text-sm">Sin usuarios</td></tr>
                )}
                {loadingUsers && (
                  <tr><td colSpan={9} className="py-4 text-slate-500 text-sm animate-pulse">Cargando…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Registra un nuevo colaborador</h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 max-w-prose">Completa los datos para crear un nuevo colaborador (rol COLLAB). El usuario será el número de documento y deberá usar la contraseña definida para iniciar sesión.</p>
        {msg && <div className="mb-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{msg}</div>}
        {err && <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300">{err}</div>}
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Nombre</label>
            <input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" placeholder="Nombre completo" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1" htmlFor="staffDocType">Tipo de documento</label>
            <select id="staffDocType" value={documentType} onChange={e=>{clearLookup(); documentRef.current.type=e.target.value; setDocumentType(e.target.value);}} className="w-full rounded border px-3 py-2"><option value="">Selecciona un tipo</option>{DOCUMENT_TYPE_CHOICES.map(choice=><option key={choice.id} value={choice.id}>{choice.name}</option>)}</select>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mt-3 mb-1" htmlFor="staffDoc">Número de documento</label>
            <input id="staffDoc" value={dni} onChange={e=>{clearLookup(); documentRef.current.dni=normalizeDocumentNumber(e.target.value); setDni(e.target.value);}} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" placeholder="Número de documento" />
            <button type="button" disabled={lookupBusy || documentType !== 'DNI'} onClick={lookupIdentity} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50">{lookupBusy ? 'Consultando…' : 'Buscar DNI'}</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Área</label>
            <select value={area} onChange={e=>setArea(e.target.value as Area)} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
              {ALLOWED_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">WhatsApp</label>
              <input value={whatsapp} onChange={e=>setWhatsapp(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" placeholder="9XXXXXXXX" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Día</label>
              <select value={birthdayDay} onChange={e=>setBirthdayDay(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                {Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0')).map(d=> <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Mes</label>
              <select value={birthdayMonth} onChange={e=>setBirthdayMonth(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                {MONTHS_ES.map((m,idx)=> <option key={m} value={String(idx+1).padStart(2,'0')}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" placeholder="Mínimo 8 caracteres" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Confirmar</label>
              <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            </div>
          </div>
          <button disabled={loading} className="btn">{loading ? 'Creando…' : 'Registrar'}</button>
        </form>
        <div className="mt-6 text-xs text-slate-500 dark:text-slate-400">El colaborador podrá iniciar sesión usando su número de documento como usuario.</div>
      </div>
    </div>
  );
}
