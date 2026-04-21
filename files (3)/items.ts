// ============================================================
// SHARED TYPES — Items & Stash
// ============================================================

export type ItemCategory = 'resource' | 'weapon' | 'armor' | 'food' | 'consumable' | 'craftable';

export type ResourceType  = 'iron_ore' | 'wood' | 'food_ration' | 'stone' | 'fiber' | 'coal';
export type WeaponType    = 'iron_sword' | 'bow' | 'dagger' | 'axe';
export type ArmorType     = 'leather_vest' | 'iron_helmet' | 'iron_chestplate';
// Intermediários e consumíveis craftáveis
export type CraftableType =
  | 'iron_ingot'    // iron_ore + coal → fundição
  | 'wood_plank'    // wood → carpintaria
  | 'rope'          // fiber → tecelagem
  | 'bandage'       // fiber → primeiros socorros (restaura HP)
  | 'water_flask'   // wood_plank + fiber → restaura sede
  | 'arrow'         // wood_plank + fiber → munição para arco
  | 'iron_pickaxe'  // iron_ingot + wood_plank → aumenta coleta de minério
  | 'iron_axe_tool';// iron_ingot + wood_plank → aumenta coleta de madeira

export type ItemType = ResourceType | WeaponType | ArmorType | CraftableType;

export interface ItemStack {
  itemType: ItemType;
  quantity: number;
  weight: number;     // peso total do stack (kg)
  metadata?: Record<string, unknown>; // durabilidade, encantamentos, etc.
}

export type StashData = ItemStack[];

export const ITEM_WEIGHT_TABLE: Record<ItemType, number> = {
  // recursos
  iron_ore:        2.5,
  wood:            1.0,
  food_ration:     0.5,
  stone:           3.0,
  fiber:           0.2,
  coal:            2.0,
  // armas
  iron_sword:      4.5,
  bow:             2.0,
  dagger:          1.5,
  axe:             3.5,
  // armaduras
  leather_vest:    3.0,
  iron_helmet:     5.0,
  iron_chestplate: 8.0,
  // craftáveis
  iron_ingot:      2.0,
  wood_plank:      0.8,
  rope:            0.3,
  bandage:         0.1,
  water_flask:     0.6,
  arrow:           0.05,
  iron_pickaxe:    3.0,
  iron_axe_tool:   3.2,
};

// Metadados de item para UI e lógica de consumo
export interface ItemMeta {
  label:    string;
  category: ItemCategory;
  // Efeito de consumo (bandage, water_flask, food_ration)
  onUse?: {
    restoreHp?:     number;
    restoreThirst?: number;
  };
}

export const ITEM_META: Record<ItemType, ItemMeta> = {
  iron_ore:        { label: 'Minério de Ferro',     category: 'resource'   },
  wood:            { label: 'Madeira',              category: 'resource'   },
  food_ration:     { label: 'Ração',                category: 'food',    onUse: { restoreThirst: 20, restoreHp: 5 } },
  stone:           { label: 'Pedra',                category: 'resource'   },
  fiber:           { label: 'Fibra',                category: 'resource'   },
  coal:            { label: 'Carvão',               category: 'resource'   },
  iron_sword:      { label: 'Espada de Ferro',      category: 'weapon'     },
  bow:             { label: 'Arco',                 category: 'weapon'     },
  dagger:          { label: 'Adaga',                category: 'weapon'     },
  axe:             { label: 'Machado',              category: 'weapon'     },
  leather_vest:    { label: 'Colete de Couro',      category: 'armor'      },
  iron_helmet:     { label: 'Capacete de Ferro',    category: 'armor'      },
  iron_chestplate: { label: 'Peitoral de Ferro',    category: 'armor'      },
  iron_ingot:      { label: 'Lingote de Ferro',     category: 'craftable'  },
  wood_plank:      { label: 'Tábua de Madeira',     category: 'craftable'  },
  rope:            { label: 'Corda',                category: 'craftable'  },
  bandage:         { label: 'Curativo',             category: 'consumable', onUse: { restoreHp: 30 } },
  water_flask:     { label: 'Cantil de Água',       category: 'consumable', onUse: { restoreThirst: 50 } },
  arrow:           { label: 'Flecha',               category: 'craftable'  },
  iron_pickaxe:    { label: 'Picareta de Ferro',    category: 'craftable'  },
  iron_axe_tool:   { label: 'Machado de Ferro',     category: 'craftable'  },
};

export const DEFAULT_STASH_WEIGHT_LIMIT = 500;
