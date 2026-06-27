import { Plugin } from "siyuan";
import { initCursor, destroyCursor } from "./modules/cursor";
import { initTypewriter, destroyTypewriter } from "./modules/typewriter";
import { initRipple, destroyRipple } from "./modules/ripple";
import type { ModuleEnabled, ModuleName } from "./types";

const STORAGE_KEY = "zentype-enabled";
const ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

export default class ZenType extends Plugin {
  private enabled: ModuleEnabled = {
    cursor: true,
    typewriter: true,
    ripple: true,
  };

  async onload(): Promise<void> {
    const saved = await this.loadData(STORAGE_KEY);
    if (saved && typeof saved === "object") {
      this.enabled = { ...this.enabled, ...(saved as Partial<ModuleEnabled>) };
    }

    this.addCommand({
      langKey: "toggle-cursor",
      callback: () => this.toggle("cursor"),
    });
    this.addCommand({
      langKey: "toggle-typewriter",
      callback: () => this.toggle("typewriter"),
    });
    this.addCommand({
      langKey: "toggle-ripple",
      callback: () => this.toggle("ripple"),
    });
    this.addCommand({
      langKey: "toggle-all",
      callback: () => this.toggleAll(),
    });

    const allOn = this.isAllEnabled();
    this.addTopBar({
      icon: ICON_SVG,
      title: allOn ? "zenType 已启用" : "zenType 已禁用",
      callback: () => this.toggleAll(),
    });

    if (this.enabled.cursor) initCursor();
    if (this.enabled.typewriter) initTypewriter();
    if (this.enabled.ripple) initRipple();

    console.log("zenType v2 loaded");
  }

  onunload(): void {
    destroyCursor();
    destroyTypewriter();
    destroyRipple();
    console.log("zenType v2 unloaded");
  }

  private toggle(name: ModuleName): void {
    this.enabled[name] = !this.enabled[name];

    if (name === "cursor") {
      if (this.enabled.cursor) initCursor();
      else destroyCursor();
    } else if (name === "typewriter") {
      if (this.enabled.typewriter) initTypewriter();
      else destroyTypewriter();
    } else if (name === "ripple") {
      if (this.enabled.ripple) initRipple();
      else destroyRipple();
    }

    this.saveData(STORAGE_KEY, this.enabled);
  }

  private toggleAll(): void {
    const allOn = this.isAllEnabled();
    const newState = !allOn;

    if (newState && !this.enabled.cursor) {
      this.enabled.cursor = true;
      initCursor();
    } else if (!newState && this.enabled.cursor) {
      this.enabled.cursor = false;
      destroyCursor();
    }

    if (newState && !this.enabled.typewriter) {
      this.enabled.typewriter = true;
      initTypewriter();
    } else if (!newState && this.enabled.typewriter) {
      this.enabled.typewriter = false;
      destroyTypewriter();
    }

    if (newState && !this.enabled.ripple) {
      this.enabled.ripple = true;
      initRipple();
    } else if (!newState && this.enabled.ripple) {
      this.enabled.ripple = false;
      destroyRipple();
    }

    this.saveData(STORAGE_KEY, this.enabled);
  }

  private isAllEnabled(): boolean {
    return this.enabled.cursor && this.enabled.typewriter && this.enabled.ripple;
  }
}
