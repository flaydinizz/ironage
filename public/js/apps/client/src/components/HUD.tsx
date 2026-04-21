'use client';

// ============================================================
// HUD — Heads-Up Display do jogo
//
// Exibe em tempo real:
//   - Barra de HP com status visual (ok / warn / critical)
//   - Barra de Sede com alertas progressivos
//   - Inventário de sessão com peso atual/máximo
//   - Indicador de zona de extração ativa
//   - Tela de morte com countdown de respawn
//   - Notificações de ação (loot, dano, etc.)
// ============================================================

import { useEffect, useState, useRef } from 'react';
import type { LocalPlayer } from '../hooks/useGame';
import type { VitalStatus } from '../../types/vitals';

interface HUDProps {
  player:         LocalPlayer | null;
  inExtractionZone: boolean;
  notification:   string | null;
  onExtract:      () => void;
}

interface DeathScreen {
  message:    string;
  lostItems:  { itemType: string; quantity: number }[];
  countdown:  number;
}

export function HUD({ player, inExtractionZone, notification, onExtract }: HUDProps) {
  const [death, setDeath]       = useState<DeathScreen | null>(null);
  const [toasts, setToasts]     = useState<{ id: number; text: string; type: 'info' | 'danger' | 'success' }[]>([]);
  const toastId = useRef(0);

  // Ouve eventos globais do socket via window.dispatchEvent
  // (o useGame.ts emite estes custom events para desacoplar do HUD)
  useEffect(() => {
    const onDied = (e: CustomEvent) => {
      setDeath({
        message:   e.detail.message,
        lostItems: e.detail.lostItems ?? [],
        countdown: 3,
      });
    };

    const onRespawned = () => setDeath(null);

    const onHit = (e: CustomEvent) => {
      addToast(`-${e.detail.damage} HP`, 'danger');
    };

    window.addEventListener('game:player_died',     onDied     as EventListener);
    window.addEventListener('game:player_respawned', onRespawned);
    window.addEventListener('game:player_hit',      onHit      as EventListener);

    return () => {
      window.removeEventListener('game:player_died',     onDied     as EventListener);
      window.removeEventListener('game:player_respawned', onRespawned);
      window.removeEventListener('game:player_hit',      onHit      as EventListener);
    };
  }, []);

  // Countdown da tela de morte
  useEffect(() => {
    if (!death || death.countdown <= 0) return;
    const t = setTimeout(() =>
      setDeath(d => d ? { ...d, countdown: d.countdown - 1 } : null)
    , 1000);
    return () => clearTimeout(t);
  }, [death]);

  // Toast de notificação
  useEffect(() => {
    if (!notification) return;
    addToast(notification, 'info');
  }, [notification]);

  function addToast(text: string, type: 'info' | 'danger' | 'success') {
    const id = ++toastId.current;
    setToasts(t => [...t.slice(-4), { id, text, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2500);
  }

  if (!player) return null;

  const hpPct     = Math.round((player.hp / player.maxHp) * 100);
  const thirstPct = Math.round(player.thirst);
  const weightPct = Math.round((player.weightUsed / player.weightLimit) * 100);

  const hpStatus     = hpPct <= 20 ? 'critical' : hpPct <= 40 ? 'warn' : 'ok';
  const thirstStatus = thirstPct <= 10 ? 'critical' : thirstPct <= 30 ? 'warn' : 'ok';

  return (
    <>
      {/* ── Tela de morte ────────────────────────────────────── */}
      {death && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.82)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          color: '#fff', fontFamily: 'var(--font-sans)',
        }}>
          <p style={{ fontSize: 28, fontWeight: 500, color: '#F09595' }}>Você morreu</p>
          <p style={{ fontSize: 15, color: '#B4B2A9', maxWidth: 320, textAlign: 'center' }}>
            {death.message}
          </p>

          {death.lostItems.length > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.07)', borderRadius: 10,
              padding: '12px 20px', maxWidth: 300, width: '100%',
            }}>
              <p style={{ fontSize: 12, color: '#888780', marginBottom: 8 }}>ITENS PERDIDOS</p>
              {death.lostItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', color: '#D3D1C7' }}>
                  <span>{item.itemType.replace(/_/g, ' ')}</span>
                  <span style={{ color: '#F09595' }}>×{item.quantity}</span>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: 13, color: '#888780' }}>
            Respawnando em <span style={{ color: '#fff', fontWeight: 500 }}>{death.countdown}s</span>…
          </p>
        </div>
      )}

      {/* ── Vitais (canto superior esquerdo) ─────────────────── */}
      <div style={{
        position: 'absolute', top: 16, left: 16,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        <VitalBar
          label="HP"
          value={player.hp}
          max={player.maxHp}
          pct={hpPct}
          status={hpStatus}
          color={hpStatus === 'critical' ? '#E24B4A' : hpStatus === 'warn' ? '#EF9F27' : '#1D9E75'}
        />
        <VitalBar
          label="Sede"
          value={thirstPct}
          max={100}
          pct={thirstPct}
          status={thirstStatus}
          color={thirstStatus === 'critical' ? '#E24B4A' : thirstStatus === 'warn' ? '#EF9F27' : '#378ADD'}
        />
      </div>

      {/* ── Inventário de sessão (canto inferior esquerdo) ───── */}
      <div style={{
        position: 'absolute', bottom: 16, left: 16,
        background: 'rgba(0,0,0,0.6)', borderRadius: 10,
        padding: '10px 14px', minWidth: 180,
        fontFamily: 'var(--font-sans)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#888780', letterSpacing: '.06em' }}>MOCHILA</span>
          <span style={{ fontSize: 11, color: weightPct > 90 ? '#E24B4A' : '#888780' }}>
            {player.weightUsed.toFixed(1)} / {player.weightLimit} kg
          </span>
        </div>

        {/* Barra de peso */}
        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 8 }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${Math.min(100, weightPct)}%`,
            background: weightPct > 90 ? '#E24B4A' : '#EF9F27',
            transition: 'width .2s',
          }} />
        </div>

        {player.inventory.length === 0 ? (
          <p style={{ fontSize: 12, color: '#5F5E5A', margin: 0 }}>Vazia</p>
        ) : (
          player.inventory.map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, color: '#D3D1C7', padding: '2px 0',
            }}>
              <span>{item.itemType.replace(/_/g, ' ')}</span>
              <span style={{ color: '#9FE1CB' }}>×{item.quantity}</span>
            </div>
          ))
        )}
      </div>

      {/* ── Indicador de zona de extração (centro-baixo) ─────── */}
      {inExtractionZone && !death && (
        <div style={{
          position: 'absolute', bottom: 80, left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <div style={{
            background: 'rgba(29, 158, 117, 0.9)', color: '#fff',
            padding: '6px 18px', borderRadius: 20, fontSize: 13,
          }}>
            Zona de extração
          </div>
          <button
            onClick={onExtract}
            disabled={player.inventory.length === 0 || player.isExtracting}
            style={{
              background: player.isExtracting ? 'rgba(255,255,255,0.1)' : '#1D9E75',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '10px 28px', fontSize: 14, fontWeight: 500,
              cursor: player.inventory.length === 0 ? 'not-allowed' : 'pointer',
              opacity: player.inventory.length === 0 ? 0.5 : 1,
            }}
          >
            {player.isExtracting ? 'Extraindo…' : 'Extrair (E)'}
          </button>
        </div>
      )}

      {/* ── Toasts de notificação (canto superior direito) ───── */}
      <div style={{
        position: 'absolute', top: 16, right: 16,
        display: 'flex', flexDirection: 'column', gap: 6,
        alignItems: 'flex-end', pointerEvents: 'none',
      }}>
        {toasts.map(toast => (
          <div key={toast.id} style={{
            background: toast.type === 'danger'  ? 'rgba(226, 75, 74, 0.9)'  :
                        toast.type === 'success' ? 'rgba(29, 158, 117, 0.9)' :
                                                   'rgba(0,0,0,0.7)',
            color: '#fff', padding: '6px 14px',
            borderRadius: 8, fontSize: 13,
            animation: 'fadeIn .15s ease',
          }}>
            {toast.text}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; } }
        @keyframes pulse  { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </>
  );
}

// ── Componente de barra vital ─────────────────────────────────
function VitalBar({ label, value, max, pct, status, color }: {
  label: string; value: number; max: number;
  pct: number; status: VitalStatus; color: string;
}) {
  return (
    <div style={{ width: 160 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{
          fontSize: 11, color: '#888780', letterSpacing: '.06em',
          animation: status === 'critical' ? 'pulse .8s infinite' : 'none',
        }}>{label}</span>
        <span style={{ fontSize: 11, color, fontWeight: 500 }}>{Math.round(value)}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 3 }}>
        <div style={{
          height: '100%', borderRadius: 3,
          width: `${Math.min(100, pct)}%`,
          background: color,
          transition: 'width .3s, background .3s',
        }} />
      </div>
    </div>
  );
}
