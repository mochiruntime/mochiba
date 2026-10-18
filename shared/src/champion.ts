import { ProjectileType } from './protocol.js';

export type SkillSlot = 'Q' | 'W' | 'E' | 'R';

export interface SkillDefinition {
  slot: SkillSlot;
  name: string;
  description: string;
  color: string;
  cooldown: number; // seconds
  manaCost: number;
  maxCharges?: number;
}

export interface ChampionDefinition {
  id: string;
  name: string;
  title: string;
  role: 'MAGE' | 'FIGHTER' | 'TANK' | 'MARKSMAN' | 'ASSASSIN' | 'SUPPORT';
  baseHealth: number;
  baseMana: number;
  baseSpeed: number;
  attackRange: number; // meters
  attackCooldown: number; // seconds
  attackDamage: number;
  attackProjectileType: ProjectileType;
  skills: Record<SkillSlot, SkillDefinition>;
}

export const KITSUNE_CHAMPION: ChampionDefinition = {
  id: 'kitsune',
  name: 'Kitsune',
  title: 'Nine-Tailed Fox Mage',
  role: 'MAGE',
  baseHealth: 550,
  baseMana: 400,
  baseSpeed: 16,
  attackRange: 26,
  attackCooldown: 0.8,
  attackDamage: 35,
  attackProjectileType: 'BASIC_ATTACK',
  skills: {
    Q: {
      slot: 'Q',
      name: 'Echo Orb',
      description: 'Fires a boomerang orb forward that deals damage and returns dynamically to your position.',
      color: '#00ffff',
      cooldown: 5.0,
      manaCost: 0
    },
    W: {
      slot: 'W',
      name: 'Spectral Embers',
      description: 'Grants a 40% speed burst and summons 3 orbiting spirit flames that seek nearby enemy champions.',
      color: '#33eeff',
      cooldown: 6.0,
      manaCost: 0
    },
    E: {
      slot: 'E',
      name: 'Charm',
      description: 'Fires a heart bolt that damages and charms the first enemy hit, walking them toward you.',
      color: '#ff33bb',
      cooldown: 8.0,
      manaCost: 0
    },
    R: {
      slot: 'R',
      name: 'Astral Surge',
      description: '3-charge directional dash firing homing bolts at nearby enemy champions.',
      color: '#4466ff',
      cooldown: 18.0,
      manaCost: 0,
      maxCharges: 3
    }
  }
};

export const CHAMPION_REGISTRY: Record<string, ChampionDefinition> = {
  kitsune: KITSUNE_CHAMPION
};

export function registerChampionDefinition(def: ChampionDefinition) {
  CHAMPION_REGISTRY[def.id] = def;
}

export function getChampionDefinition(id: string): ChampionDefinition {
  return CHAMPION_REGISTRY[id] || KITSUNE_CHAMPION;
}

