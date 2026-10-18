import { IChampionBehavior } from './ChampionBehavior.js';
import { KitsuneBehavior } from './KitsuneBehavior.js';

export class ChampionRegistry {
  private behaviors = new Map<string, IChampionBehavior>();

  constructor() {
    this.register(new KitsuneBehavior());
  }

  register(behavior: IChampionBehavior) {
    this.behaviors.set(behavior.definition.id, behavior);
  }

  get(id: string): IChampionBehavior {
    return this.behaviors.get(id) || this.behaviors.get('kitsune')!;
  }

  has(id: string): boolean {
    return this.behaviors.has(id);
  }
}

export const championRegistry = new ChampionRegistry();
