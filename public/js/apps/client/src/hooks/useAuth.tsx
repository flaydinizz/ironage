// ============================================================
// CLIENT — useAuth hook (Next.js)
//
// Gerencia estado de autenticação no lado do cliente.
// O JWT é armazenado em localStorage por simplicidade.
// Em produção, considere httpOnly cookies via BFF.
// ============================================================

'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'survival_token';

interface Player {
  id:       string;
  username: string;
  level:    number;
}

interface AuthState {
  player:   Player | null;
  token:    string | null;
  loading:  boolean;
}

interface AuthActions {
  register: (username: string, password: string) => Promise<void>;
  login:    (username: string, password: string) => Promise<void>;
  logout:   () => Promise<void>;
}

export type AuthContext = AuthState & AuthActions;

// ── Context ──────────────────────────────────────────────────
const AuthCtx = createContext<AuthContext | null>(null);

// ── Provider ─────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    player:  null,
    token:   null,
    loading: true,
  });

  // Restaura sessão do localStorage ao montar
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState(s => ({ ...s, loading: false }));
      return;
    }

    // Valida token consultando /auth/me
    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data) => {
        setState({ player: data, token, loading: false });
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setState({ player: null, token: null, loading: false });
      });
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Erro no registro');

    localStorage.setItem(TOKEN_KEY, data.token);
    setState({ player: data.player, token: data.token, loading: false });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ username, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Erro no login');

    localStorage.setItem(TOKEN_KEY, data.token);
    setState({ player: data.player, token: data.token, loading: false });
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      // Chama logout no servidor para invalidar a sessão no banco
      await fetch(`${API_URL}/auth/logout`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionSeconds: 0 }),
      }).catch(() => {}); // Silencioso: mesmo se falhar, limpamos local
    }

    localStorage.removeItem(TOKEN_KEY);
    setState({ player: null, token: null, loading: false });
  }, []);

  return (
    <AuthCtx.Provider value={{ ...state, register, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────
export function useAuth(): AuthContext {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}

// Helper para obter token direto (para passar ao Socket.io)
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
