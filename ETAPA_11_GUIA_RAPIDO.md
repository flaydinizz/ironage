# 🎮 Guia de Implementação Manual - Etapa 11

## ✅ Já Concluído (Automático)

Os seguintes arquivos já foram modificados automaticamente:

1. ✅ `public/js/packages/shared/types/items.ts` - Item "chest" adicionado
2. ✅ `public/js/apps/server/src/game/recipes.ts` - Receita do baú criada
3. ✅ `public/js/apps/server/src/handlers/death.handler.ts` - Timer de respawn variável (5-10s)
4. ✅ `public/js/apps/server/src/handlers/consumable.handler.ts` - Handler de consumíveis criado
5. ✅ `public/js/apps/server/src/index.ts` - Handler registrado
6. ✅ `public/js/apps/client/index.html` - CSS da hotbar e tela de morte adicionado

## 🔧 Modificações Manuais Necessárias

Consulte o arquivo completo em: `GUIA_IMPLEMENTACAO_COMPLETO.md` na raiz do projeto.

## 📋 Resumo Rápido:

### Para completar a Etapa 11, edite `public/js/apps/client/index.html`:

1. **Adicionar HTML da Hotbar** (antes de `#bottom-bar`)
2. **Adicionar HTML da Tela de Morte** (antes de fechar `#game-screen`)
3. **Adicionar variáveis JavaScript da hotbar**
4. **Adicionar funções JavaScript da hotbar** 
5. **Modificar handler de teclado** (teclas 1-4)
6. **Adicionar handlers do socket** (consumable:ok, consumable:fail, player:died, player:respawned)
7. **Atualizar ITEM_LABELS** (adicionar 'chest')
8. **Atualizar itemCategory()** (incluir 'chest')

## 🎯 Funcionalidades Implementadas:

- ✅ **Baú Craftável**: 8 tábuas + 2 lingotes + 2 cordas (Carpentry Lv4)
- ✅ **Timer de Respawn Variável**: 5-10 segundos randomizados
- ✅ **Hotbar com 4 Slots**: Arma (1), Ferramenta (2), Alimento (3), Utilitário (4)
- ✅ **Sistema de Consumíveis**: Uso automático do inventário/stash
- ✅ **Tela de Morte Visual**: Timer, mensagem e lista de itens perdidos

## 📞 Teste Rápido:

```bash
# 1. Reiniciar servidor
cd public/js/apps/server
npm run dev

# 2. Abrir navegador em http://localhost:3000
# 3. Fazer login
# 4. Pressionar teclas 1-4 (teste hotbar vazia)
# 5. No console do navegador, equipar um item:
equipToHotbar('bandage', 3)
# 6. Pressionar tecla 4 para usar
```

## ✅ Checklist:

- [ ] Servidor modificações aplicadas (✅ automático)
- [ ] Cliente CSS adicionado (✅ automático)  
- [ ] Cliente HTML da hotbar
- [ ] Cliente HTML da tela de morte
- [ ] Cliente JavaScript completo
- [ ] Teste funcional realizado

---

Consulte `GUIA_IMPLEMENTACAO_COMPLETO.md` para instruções detalhadas passo a passo.
