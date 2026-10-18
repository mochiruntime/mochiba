import { ChampionDefinition } from './types.js';
import { KITSUNE_CHAMPION } from './definitions/kitsune.js';

export const CHAMPION_REGISTRY: Record<string, ChampionDefinition> = {
  kitsune: KITSUNE_CHAMPION
};

export function registerChampionDefinition(def: ChampionDefinition) {
  CHAMPION_REGISTRY[def.id] = def;
}

export function getChampionDefinition(id: string): ChampionDefinition {
  return CHAMPION_REGISTRY[id] || KITSUNE_CHAMPION;
}
