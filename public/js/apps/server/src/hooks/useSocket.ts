'use client';

// ============================================================
// useSocket — Gerencia conexão Socket.io com JWT
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { io, Socket }                  from 'socket.io-client';
import { getStoredToken }              from './useAuth';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export function useSocket() {
  const socketRef = useState<Socket | null>(null);
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const socket = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) { setStatus('error'); return; }

    setStatus('connecting');
    const s = io(SOCKET_URL, {
      auth:              { token: `Bearer ${token}` },
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ['websocket'],
    });

    s.on('connect',       () => setStatus('connected'));
    s.on('disconnect',    () => setStatus('disconnected'));
    s.on('connect_error', () => setStatus('error'));

    socket.current = s;
    return () => { s.disconnect(); socket.current = null; };
  }, []);

  return { socket: socket.current, status };
}
