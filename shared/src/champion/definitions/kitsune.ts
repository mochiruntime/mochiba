import { ChampionDefinition } from '../types.js';

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
