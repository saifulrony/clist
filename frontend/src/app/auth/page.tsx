'use client';

import React, { useState, Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function AuthContent() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('test@test.com');
  const [password, setPassword] = useState('test123');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/crawl?tab=database';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password, name);
      }
      router.push(redirectUrl);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async () => {
    setEmail('test@test.com');
    setPassword('test123');
    setError('');
    setLoading(true);
    try {
      await login('test@test.com', 'test123');
      router.push(redirectUrl);
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 selection:bg-blue-500 selection:text-white">
      <div className="card w-full max-w-md p-8 shadow-2xl border border-slate-200 bg-white">
        {/* Header Logo */}
        <div className="flex flex-col items-center text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2 mb-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-extrabold text-slate-900 tracking-tight">ClientList</span>
          </Link>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-bold text-blue-700 mb-2">
            <span>🔒</span>
            <span>Protected Workspace</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {isLogin ? 'Sign In to ClientList' : 'Create an Account'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {searchParams.get('redirect') ? (
              <span className="text-amber-600 font-medium">Please sign in to access this workspace section.</span>
            ) : (
              isLogin ? 'Sign in to access leads database & cold outreach' : 'Start saving business data and launching campaigns'
            )}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
              <input
                className="input-field w-full"
                type="text"
                placeholder="Saiful Islam"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLogin}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
            <input
              className="input-field w-full"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              className="input-field w-full"
              type="password"
              placeholder={isLogin ? 'Enter password' : 'At least 6 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button
            className="btn-primary w-full py-2.5 text-xs font-bold shadow-md shadow-blue-500/20"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Authenticating...' : isLogin ? 'Sign In →' : 'Create Account →'}
          </button>
        </form>

        {/* Demo Login Shortcut */}
        {isLogin && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={handleQuickDemoLogin}
              disabled={loading}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>⚡</span>
              <span>1-Click Demo Sign In (test@test.com)</span>
            </button>
          </div>
        )}

        <div className="mt-5 text-center text-xs text-slate-500">
          {isLogin ? "Don't have an account?" : 'Already registered?'}{' '}
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-blue-600 hover:text-blue-700 font-bold hover:underline"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-600 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>}>
      <AuthContent />
    </Suspense>
  );
}
