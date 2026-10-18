import { ChampionState, ChampionDefinition, KITSUNE_CHAMPION } from '@mochiba/shared';

interface SlotUI {
  container: HTMLElement;
  keyLabel: HTMLElement;
  nameLabel: HTMLElement;
  overlay: HTMLElement;
  lastCdText: string;
  lastDisplay: string;
}

export class SkillHUD {
  private container: HTMLDivElement;
  private currentDef: ChampionDefinition = KITSUNE_CHAMPION;
  private slots: {
    q: SlotUI;
    w: SlotUI;
    e: SlotUI;
    r: SlotUI;
  };

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'skill-hud';
    this.container.style.position = 'absolute';
    this.container.style.bottom = '20px';
    this.container.style.left = '50%';
    this.container.style.transform = 'translateX(-50%)';
    this.container.style.display = 'flex';
    this.container.style.gap = '12px';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '100';

    this.slots = {
      q: this.createSlot('Q', this.currentDef.skills.Q.name, this.currentDef.skills.Q.color, this.currentDef.skills.Q.description),
      w: this.createSlot('W', this.currentDef.skills.W.name, this.currentDef.skills.W.color, this.currentDef.skills.W.description),
      e: this.createSlot('E', this.currentDef.skills.E.name, this.currentDef.skills.E.color, this.currentDef.skills.E.description),
      r: this.createSlot('R', this.currentDef.skills.R.name, this.currentDef.skills.R.color, this.currentDef.skills.R.description)
    };

    document.body.appendChild(this.container);
  }

  setChampion(def: ChampionDefinition) {
    this.currentDef = def;
    this.configureSlot(this.slots.q, 'Q', def.skills.Q.name, def.skills.Q.color, def.skills.Q.description);
    this.configureSlot(this.slots.w, 'W', def.skills.W.name, def.skills.W.color, def.skills.W.description);
    this.configureSlot(this.slots.e, 'E', def.skills.E.name, def.skills.E.color, def.skills.E.description);
    this.configureSlot(this.slots.r, 'R', def.skills.R.name, def.skills.R.color, def.skills.R.description);
  }

  private configureSlot(slot: SlotUI, _key: string, name: string, color: string, description: string) {
    slot.container.style.borderColor = color;
    slot.container.title = `${name}: ${description}`;
    slot.nameLabel.innerText = name;
    slot.nameLabel.style.color = color;
  }

  private createSlot(key: string, name: string, color: string, description: string): SlotUI {
    const slot = document.createElement('div');
    slot.style.width = '64px';
    slot.style.height = '64px';
    slot.style.background = 'rgba(12, 16, 23, 0.9)';
    slot.style.border = `2px solid ${color}`;
    slot.style.borderRadius = '8px';
    slot.style.position = 'relative';
    slot.style.display = 'flex';
    slot.style.flexDirection = 'column';
    slot.style.alignItems = 'center';
    slot.style.justifyContent = 'center';
    slot.style.boxShadow = `0 4px 12px rgba(0,0,0,0.6)`;
    slot.title = `${name}: ${description}`;

    const keyLabel = document.createElement('div');
    keyLabel.innerText = key;
    keyLabel.style.color = '#ffffff';
    keyLabel.style.fontWeight = 'bold';
    keyLabel.style.fontSize = '18px';
    slot.appendChild(keyLabel);

    const nameLabel = document.createElement('div');
    nameLabel.innerText = name;
    nameLabel.style.color = color;
    nameLabel.style.fontSize = '8px';
    nameLabel.style.textAlign = 'center';
    nameLabel.style.marginTop = '2px';
    nameLabel.style.padding = '0 2px';
    slot.appendChild(nameLabel);

    const overlay = document.createElement('div');
    overlay.className = 'cd-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.background = 'rgba(0, 0, 0, 0.7)';
    overlay.style.borderRadius = '6px';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.color = '#ffffff';
    overlay.style.fontWeight = 'bold';
    overlay.style.fontSize = '16px';
    slot.appendChild(overlay);

    this.container.appendChild(slot);

    return {
      container: slot,
      keyLabel,
      nameLabel,
      overlay,
      lastCdText: '',
      lastDisplay: 'none'
    };
  }

  update(champ?: ChampionState) {
    if (!champ) return;

    this.updateSlotCD(this.slots.q, champ.cooldowns.q);
    this.updateSlotCD(this.slots.w, champ.cooldowns.w);
    this.updateSlotCD(this.slots.e, champ.cooldowns.e);

    // R slot with charges if champion has a multi-charge ultimate
    const rDef = this.currentDef.skills.R;

    if (champ.cooldowns.r > 0) {
      if (this.slots.r.lastDisplay !== 'flex') {
        this.slots.r.overlay.style.display = 'flex';
        this.slots.r.lastDisplay = 'flex';
      }
      const text = champ.cooldowns.r.toFixed(1);
      if (this.slots.r.lastCdText !== text) {
        this.slots.r.overlay.innerText = text;
        this.slots.r.lastCdText = text;
      }
      if (this.slots.r.nameLabel.innerText !== rDef.name) {
        this.slots.r.nameLabel.innerText = rDef.name;
      }
    } else {
      if (this.slots.r.lastDisplay !== 'none') {
        this.slots.r.overlay.style.display = 'none';
        this.slots.r.lastDisplay = 'none';
        this.slots.r.lastCdText = '';
      }
      const targetName = rDef.maxCharges
        ? `${rDef.name.substring(0, 6)} (${champ.rCharges}/${rDef.maxCharges})`
        : rDef.name;
      if (this.slots.r.nameLabel.innerText !== targetName) {
        this.slots.r.nameLabel.innerText = targetName;
      }
    }
  }

  private updateSlotCD(slot: SlotUI, cd: number) {
    if (cd > 0) {
      if (slot.lastDisplay !== 'flex') {
        slot.overlay.style.display = 'flex';
        slot.lastDisplay = 'flex';
      }
      const text = cd.toFixed(1);
      if (slot.lastCdText !== text) {
        slot.overlay.innerText = text;
        slot.lastCdText = text;
      }
    } else {
      if (slot.lastDisplay !== 'none') {
        slot.overlay.style.display = 'none';
        slot.lastDisplay = 'none';
        slot.lastCdText = '';
      }
    }
  }

  dispose() {
    this.container.remove();
  }
}
