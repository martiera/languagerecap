'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Brand } from '@/components/Brand';
export default function Login() {
  const [register, setRegister] = useState(false), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const router = useRouter();
  useEffect(() => {
    setRegister(new URLSearchParams(window.location.search).get('register') === 'true');
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const response = await fetch(register ? '/api/auth/register' : '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }
      router.replace('/learn');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  }
  return <main className="shell grid-paper min-h-screen"><div className="mx-auto max-w-md px-5 py-16"><Link href="/" aria-label="LanguageRecap home" className="mb-8 block"><Brand className="mx-auto h-8 w-auto" /><span className="mt-2 block text-center text-sm font-bold text-[#6f7e76] underline">← Back</span></Link><section className="panel p-8"><h1 className="serif text-4xl font-bold">{register ? 'Create account' : 'Welcome back'}</h1><p className="mt-3 text-[#6f7e76]">Your vocabulary and progress stay private to your account.</p><form onSubmit={submit} className="mt-8 grid gap-4"><input type="email" required value={email} onChange={event=>setEmail(event.target.value)} placeholder="Email" className="rounded-md border bg-[#f5f1e9] px-4 py-3"/><input type="password" required value={password} onChange={event=>setPassword(event.target.value)} placeholder={register?'Password (10+ characters)':'Password'} className="rounded-md border bg-[#f5f1e9] px-4 py-3"/><button disabled={loading} className="rounded-md bg-[#173c3b] px-4 py-3 font-bold text-white">{loading?'Please wait...':register?'Create account':'Sign in'}</button></form>{error&&<p role="alert" className="mt-4 text-sm font-bold text-[#e56f50]">{error}</p>}<button onClick={()=>setRegister(value=>!value)} className="mt-6 text-sm font-bold text-[#6f7e76] underline">{register?'Already have an account? Sign in':'Need an account? Create one'}</button></section></div></main>;
}
