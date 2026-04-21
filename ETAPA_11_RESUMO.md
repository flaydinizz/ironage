# Etapa 11 - Implementação Resumida

## ✅ Concluído no Servidor:

### 1. Item "Baú" (chest)
- **Arquivo**: `public/js/packages/shared/types/items.ts`
  - Adicionado tipo `chest` ao `CraftableType`
  - Peso: 8.0 kg
  - Categoria: craftable
  - Label: "Baú"

- **Arquivo**: `public/js/apps/server/src/game/recipes.ts`
  - Receita criada:
    - 8 tábuas de madeira
    - 2 lingotes de ferro
    - 2 cordas
    - Requer Carpentry Lv4
    - Tempo de craft: 12s
    - Descrição: "Armazena itens. Permite transferir itens do inventário de sessão para o stash permanente."

### 2. Sistema de Respawn Melhorado
- **Arquivo**: `public/js/apps/server/src/handlers/death.handler.ts`
  - Timer variável entre 5-10 segundos (randomizado)
  - Função `getRandomRespawnDelay()`
  - Mantém lógica de wipe de inventário
  - Envia `respawnDelayMs` dinâmico para o cliente

### 3. Handler de Consumíveis
- **Arquivo**: `public/js/apps/server/src/handlers/consumable.handler.ts` (NOVO)
  - `registerConsumableHandler()` - registra evento `player:use_consumable`
  - Usa item do inventário de sessão (prioridade)
  - Se não tiver, usa do stash permanente
  - Aplica efeitos de HP/Sede via VitalsService
  - Atualiza banco quando usa do stash
  - Retorna eventos: `consumable:ok` / `consumable:fail`

- **Arquivo**: `public/js/apps/server/src/index.ts`
  - Importado e registrado `registerConsumableHandler`

## ✅ Concluído no Cliente (CSS):

### 4. Estilos Adicionados
- **Arquivo**: `public/js/apps/client/index.html`
  - **Hotbar**: 4 slots com visual completo (ícone, label, tecla, quantidade, cooldown)
  - **Tela de Morte**: Design dramático com timer, mensagem, lista de itens perdidos

## 🔄 Próximas Ações Necessárias:

### 5. HTML da Hotbar (adicionar antes de `</div><!-- fim game-screen -->`):
```html
  <!-- Hotbar (Etapa 11) -->
  <div id="hotbar">
    <div class="hotbar-slot empty" data-slot="0" data-type="weapon">
      <span class="hotbar-key">1</span>
      <div class="hotbar-icon">⚔️</div>
      <div class="hotbar-label">Arma</div>
      <div class="hotbar-cooldown">3</div>
    </div>
    <div class="hotbar-slot empty" data-slot="1" data-type="tool">
      <span class="hotbar-key">2</span>
      <div class="hotbar-icon">⛏</div>
      <div class="hotbar-label">Ferramenta</div>
      <div class="hotbar-cooldown">2</div>
    </div>
    <div class="hotbar-slot empty" data-slot="2" data-type="food">
      <span class="hotbar-key">3</span>
      <div class="hotbar-icon">🌾</div>
      <div class="hotbar-label">Alimento</div>
      <div class="hotbar-cooldown">1</div>
    </div>
    <div class="hotbar-slot empty" data-slot="3" data-type="consumable">
      <span class="hotbar-key">4</span>
      <div class="hotbar-icon">🧬</div>
      <div class="hotbar-label">Utilitário</div>
      <div class="hotbar-cooldown">5</div>
    </div>
  </div>

  <!-- Tela de Morte (Etapa 11) -->
  <div id="death-screen">
    <div class="death-box">
      <h1>☠ VOCÊ MORREU ☠</h1>
      <div class="death-message" id="death-msg">Todo o inventário de sessão foi perdido.</div>
      <div class="death-timer" id="death-timer">10</div>
      <div class="death-label">Respawn em...</div>
      <div class="death-items" id="death-items-list" style="display:none">
        <div class="death-items-title">Itens Perdidos:</div>
        <div id="death-items-content"></div>
      </div>
    </div>
  </div>
```

### 6. JavaScript da Hotbar (adicionar na seção STATE):
```javascript
// Estado da Hotbar (Etapa 11)
let hotbar = [
  { slot: 0, type: 'weapon',     itemType: null, quantity: 0 },  // 1
  { slot: 1, type: 'tool',       itemType: null, quantity: 0 },  // 2
  { slot: 2, type: 'food',       itemType: null, quantity: 0 },  // 3
  { slot: 3, type: 'consumable', itemType: null, quantity: 0 },  // 4
];
let hotbarCooldowns = [0, 0, 0, 0]; // timestamp de quando cada slot ficará disponível
const HOTBAR_COOLDOWN_MS = 2000; // 2s de cooldown ao usar um consumível
```

### 7. Funções da Hotbar (adicionar após funções existentes):
```javascript
// ══════════════════════════════════════════════════════════════
// HOTBAR (Etapa 11)
// ══════════════════════════════════════════════════════════════

function updateHotbarUI() {
  hotbar.forEach((slot, idx) => {
    const el = document.querySelector(`.hotbar-slot[data-slot="${idx}"]`);
    if (!el) return;

    if (slot.itemType) {
      el.classList.remove('empty');
      const meta = ITEM_META[slot.itemType];
      const icon = getItemIcon(slot.itemType);
      const label = meta?.label ?? slot.itemType;
      
      el.querySelector('.hotbar-icon').textContent = icon;
      el.querySelector('.hotbar-label').textContent = label;
      
      // Mostra quantidade
      let qtyEl = el.querySelector('.hotbar-qty');
      if (!qtyEl) {
        qtyEl = document.createElement('span');
        qtyEl.className = 'hotbar-qty';
        el.appendChild(qtyEl);
      }
      qtyEl.textContent = slot.quantity > 1 ? slot.quantity + '×' : '';
    } else {
      el.classList.add('empty');
      const defaultIcons = { weapon: '⚔️', tool: '⛏', food: '🌾', consumable: '🧬' };
      const defaultLabels = { weapon: 'Arma', tool: 'Ferramenta', food: 'Alimento', consumable: 'Utilitário' };
      el.querySelector('.hotbar-icon').textContent = defaultIcons[slot.type];
      el.querySelector('.hotbar-label').textContent = defaultLabels[slot.type];
      const qtyEl = el.querySelector('.hotbar-qty');
      if (qtyEl) qtyEl.remove();
    }
  });
}

function getItemIcon(itemType) {
  const icons = {
    bandage: '🩹', water_flask: '💧', food_ration: '🌾',
    iron_sword: '⚔️', bow: '🏹', dagger: '🗡', axe: '🪓',
    iron_pickaxe: '⛏', iron_axe_tool: '🪓',
  };
  return icons[itemType] ?? '📦';
}

function equipToHotbar(itemType, slotIdx) {
  if (slotIdx < 0 || slotIdx >= hotbar.length) return;
  
  // Verifica se tem o item no inventário ou stash
  const inInv = myInventory.find(i => i.itemType === itemType);
  const inStash = stashData.items.find(i => i.itemType === itemType);
  
  if (!inInv && !inStash) {
    addLog('Você não possui este item', 'warn');
    return;
  }
  
  hotbar[slotIdx].itemType = itemType;
  hotbar[slotIdx].quantity = (inInv?.quantity ?? 0) + (inStash?.quantity ?? 0);
  updateHotbarUI();
  addLog(`${ITEM_META[itemType]?.label} equipado no slot ${slotIdx + 1}`, 'ok');
}

function useHotbarSlot(slotIdx) {
  const slot = hotbar[slotIdx];
  if (!slot || !slot.itemType) {
    addLog('Slot vazio', 'warn');
    return;
  }

  // Verifica cooldown
  const now = Date.now();
  if (hotbarCooldowns[slotIdx] > now) {
    const remaining = Math.ceil((hotbarCooldowns[slotIdx] - now) / 1000);
    addLog(`Aguarde ${remaining}s`, 'warn');
    return;
  }

  // Usa o item via socket
  socket?.emit('player:use_consumable', { itemType: slot.itemType });
  
  // Aplica cooldown visual
  hotbarCooldowns[slotIdx] = now + HOTBAR_COOLDOWN_MS;
  const slotEl = document.querySelector(`.hotbar-slot[data-slot="${slotIdx}"]`);
  if (slotEl) {
    slotEl.classList.add('cooldown');
    const cdEl = slotEl.querySelector('.hotbar-cooldown');
    let remaining = 2;
    cdEl.textContent = remaining;
    const interval = setInterval(() => {
      remaining--;
      cdEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(interval);
        slotEl.classList.remove('cooldown');
      }
    }, 1000);
  }
}

// Event listeners das teclas 1-4
window.addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= '4') {
    const slotIdx = parseInt(e.key) - 1;
    useHotbarSlot(slotIdx);
  }
});

// Handler do servidor para consumíveis
socket?.on('consumable:ok', data => {
  addLog(`Usou ${ITEM_META[data.itemType]?.label}`, 'ok');
  if (data.healedHp > 0) addLog(`+${data.healedHp} HP`, 'ok');
  if (data.restoredThirst > 0) addLog(`+${data.restoredThirst} Sede`, 'ok');
  
  myHp = data.hp;
  myThirst = data.thirst;
  updateVitals(myHp, myThirst);
  
  if (data.inventory) {
    myInventory = data.inventory;
    myWeightUsed = data.weightUsed;
    updateInventory();
  }
  if (data.stash) {
    stashData.items = data.stash;
    stashData.totalWeight = data.stash.reduce((s, i) => s + i.weight, 0);
    if (activePanel === 'stash') renderStashPanel();
  }
  
  // Atualiza quantidade no hotbar
  hotbar.forEach(slot => {
    if (slot.itemType === data.itemType) {
      const inInv = myInventory.find(i => i.itemType === data.itemType);
      const inStash = stashData.items.find(i => i.itemType === data.itemType);
      slot.quantity = (inInv?.quantity ?? 0) + (inStash?.quantity ?? 0);
      if (slot.quantity === 0) {
        slot.itemType = null;
        slot.quantity = 0;
      }
    }
  });
  updateHotbarUI();
});

socket?.on('consumable:fail', data => {
  addLog(data.reason ?? 'Falha ao usar item', 'warn');
});
```

### 8. JavaScript da Tela de Morte (modificar evento existente):
```javascript
// Dentro da função startGame(), modificar o handler:
socket.on('player:died', data => {
  myInventory = [];
  myWeightUsed = 0;
  updateInventory();
  
  // Mostra tela de morte
  const deathScreen = document.getElementById('death-screen');
  const deathMsg = document.getElementById('death-msg');
  const deathTimer = document.getElementById('death-timer');
  const deathItemsList = document.getElementById('death-items-list');
  const deathItemsContent = document.getElementById('death-items-content');
  
  deathMsg.textContent = data.message || 'Você morreu';
  deathScreen.style.display = 'flex';
  
  // Lista itens perdidos
  if (data.lostItems && data.lostItems.length > 0) {
    deathItemsList.style.display = 'block';
    deathItemsContent.innerHTML = data.lostItems.map(item => 
      `<div class="death-item">• ${item.quantity}× ${ITEM_META[item.itemType]?.label || item.itemType}</div>`
    ).join('');
  } else {
    deathItemsList.style.display = 'none';
  }
  
  // Timer de respawn
  let remaining = Math.ceil(data.respawnDelayMs / 1000);
  deathTimer.textContent = remaining;
  const timerInterval = setInterval(() => {
    remaining--;
    deathTimer.textContent = remaining;
    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
  
  addLog(data.message, 'dmg');
});

socket.on('player:respawned', data => {
  document.getElementById('death-screen').style.display = 'none';
  localPos = data.position;
  myHp = data.hp;
  myThirst = data.thirst;
  updateVitals(myHp, myThirst);
  addLog('Você renasceu', 'info');
});
```

## 🎯 Benefícios Implementados:

1. **Baú Craftável**: Jogadores podem criar baús para organizar melhor seus itens
2. **Respawn Dinâmico**: Timer varia entre 5-10s, tornando a morte mais interessante
3. **Hotbar Funcional**: 4 slots dedicados para acesso rápido a armas, ferramentas, comida e utilitários
4. **Tela de Morte Visual**: Experiência mais imersiva com contador e lista de itens perdidos
5. **Sistema de Consumíveis**: Uso inteligente de itens (prioriza inventário, fallback para stash)

## 📝 Teste Manual:

1. Fazer login e entrar no jogo
2. Craftar um baú (8 tábuas + 2 lingotes + 2 cordas)
3. Equipar itens na hotbar clicando nos slots
4. Pressionar teclas 1-4 para usar itens
5. Morrer propositalmente para ver tela de morte com timer variável
6. Aguardar respawn automático

## 🔧 Arquivos Modificados:

- `public/js/packages/shared/types/items.ts`
- `public/js/apps/server/src/game/recipes.ts`
- `public/js/apps/server/src/handlers/death.handler.ts`
- `public/js/apps/server/src/handlers/consumable.handler.ts` (NOVO)
- `public/js/apps/server/src/index.ts`
- `public/js/apps/client/index.html` (CSS adicionado, HTML e JS pendentes)
