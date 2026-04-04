# ironage
Survivor RPG

🎮 PROMPT PROFISSIONAL — JOGO SURVIVOR (HTML + NODE)

🧠 CONTEXTO DO PROJETO

Desenvolver um jogo survival multiplayer inspirado em experiências como DayZ e Escape from Tarkov, com foco em:

- Sessões instanciadas (até 200 players)
- Loop de risco vs recompensa
- Progressão persistente
- Economia dinâmica com NPCs
- Sistema de habilidades evolutivas

O jogo inicialmente será executado em ambiente web (HTML + JavaScript), com backend em Node.js.

---

🎯 OBJETIVO

Criar um sistema modular, escalável e performático para um jogo survival com:

- Mundo baseado em sessões (instâncias)
- Sistema de extração
- Perda de progresso parcial ao morrer
- Progressão contínua via habilidades

---

🧱 ARQUITETURA

🔹 Frontend (HTML + JS)

- Renderização do jogo (Canvas ou DOM)
- Input do jogador
- Comunicação via WebSocket

🔹 Backend

- Servidor em Node.js
- Gerenciamento de sessões
- Simulação do mundo (tempo real)
- Persistência de dados

🔹 Banco de dados

Utilizar PostgreSQL para:

- Dados persistentes do jogador
- Economia global
- Stash e progressão

---

🎮 LOOP DE GAMEPLAY

1. Player entra no matchmaking
2. É inserido em uma sessão
3. Realiza ações (loot, combate, exploração)
4. Decide entre:
   - Continuar explorando (risco ↑)
   - Extrair (salvar progresso)
5. Ao morrer:
   - Perde itens da sessão
6. Ao extrair:
   - Salva itens no stash
   - Ganha experiência

---

🧠 SISTEMA DE HABILIDADES

Cada jogador possui habilidades que evoluem com uso:

Exemplos:

- Carpintaria
- Cozinha
- Caça
- Sobrevivência
- Resistência física

Mecânica:

- XP baseado em ação (uso real)
- Níveis liberam:
  - novas receitas
  - eficiência aumentada
  - bônus passivos

Estrutura:

{
  "skills": {
    "carpintaria": { "level": 3, "xp": 120 },
    "cozinha": { "level": 2, "xp": 60 },
    "caca": { "level": 4, "xp": 200 }
  }
}

---

🎒 SISTEMA DE INVENTÁRIO

- Baseado em peso e slots
- Itens possuem:
  - peso
  - valor
  - tipo
- Inventário dividido em:
  - Temporário (sessão)
  - Permanente (stash)

---

🏘️ ECONOMIA (NPCs)

- NPCs compram e vendem itens
- Preços dinâmicos baseados em:
  - oferta
  - demanda
  - estoque

Exemplo:

- Muito item vendido → preço cai
- Item raro → preço sobe

---

🐗 IA DO MUNDO

Fauna:

- Estados: neutro / fuga / agressivo
- Spawn dinâmico

NPCs:

- Comerciantes
- Possível expansão para missões

---

💾 PERSISTÊNCIA

Salvar apenas em momentos estratégicos:

- Extração
- Logout
- Checkpoints

Evitar escrita constante no banco.

---

⚡ BOAS PRÁTICAS

- Separar lógica de jogo e persistência
- Usar memória para tempo real
- Estruturar código em módulos:
  - player
  - session
  - inventory
  - skills
- Evitar acoplamento direto com banco

---

🚀 EXPANSÕES FUTURAS

- Sistema de crafting avançado
- Construção de base
- Clãs / grupos
- Eventos dinâmicos no mapa

---

🎯 OBJETIVO FINAL

Criar um jogo onde:

- Cada sessão conta uma história única
- O jogador toma decisões reais de risco
- A progressão é sentida, não apenas acumulada
- O mundo responde às ações dos jogadores