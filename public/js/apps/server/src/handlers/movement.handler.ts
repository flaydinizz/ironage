// ============================================================
// MOVEMENT HANDLER — Client Prediction + Server Reconciliation
//                    + Colisão de Terreno (7.3)
// ============================================================

import type { Socket } from 'socket.io';
import { getRoomBySocket, getPlayerBySocket } from '../game/room.manager';
import { applyMovement } from '../game/physics';
import type { MoveInput } from '../game/world.state';

export function registerMovementHandler(socket: Socket): void {
  socket.on('player:move', (input: MoveInput) => {
    const room   = getRoomBySocket(socket.id);
    const player = getPlayerBySocket(socket.id);
    if (!room || !player) return;

    // Descarta inputs fora de ordem
    if (input.seq <= player.lastProcessedInput) return;

    // Aplica física + colisão de terreno no servidor
    const { position, speedMult } = applyMovement(player, input, room.heightmap);
    player.position           = position;
    player.lastProcessedInput = input.seq;

    // Envia ack ao cliente com posição autoritativa + speedMult
    // O cliente usa speedMult para espelhar a desaceleração na predição local
    socket.emit('player:move_ack', {
      seq:       input.seq,
      position,
      speedMult,
    });
  });
}
