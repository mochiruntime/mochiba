import { ProjectileType } from '../protocol.js';

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
