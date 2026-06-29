import { Plugin } from "siyuan";
import type { IProtyle, IWebSocketData } from "siyuan/types";
import { addStyle, removeStyle } from "./utils/styleManager";
import {
  initCursor,
  destroyCursor,
  onProtyleLoaded,
  onProtyleSwitched,
  onEditorContentClicked,
  onMenuOpened,
  onWsMain,
  onMobileKeyboardShow,
  onMobileKeyboardHide,
} from "./modules/cursor";
import { initTypewriter, destroyTypewriter } from "./modules/typewriter";
import { initRipple, destroyRipple } from "./modules/ripple";
import * as inputMode from "./modules/inputMode";
import type { ModuleEnabled, ModuleName } from "./types";
import mainCss from "./styles/index.scss";

const STYLE_ID = "main";

const STORAGE_KEY = "zentype-enabled";
const ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

export default class ZenType extends Plugin {
  private enabled: ModuleEnabled = {
    cursor: true,
    typewriter: true,
    ripple: true,
  };

  // P2: 集中管理 EventBus 退订函数，onunload 时统一释放，避免内存泄漏
  private eventBusOffFns: Array<() => void> = [];

  async onload(): Promise<void> {
    const saved = await this.loadData(STORAGE_KEY);
    if (saved && typeof saved === "object") {
      this.enabled = { ...this.enabled, ...(saved as Partial<ModuleEnabled>) };
    }

    // 共享样式一次性注入（光标、打字机高亮条都依赖 index.scss，
    // 之前由 cursor.ts / typewriter.ts 各自 import 同一份 SCSS，
    // esbuild 共享字符串常量但 addStyle 仍会创建两个完全相同的 <style> 标签）
    addStyle(STYLE_ID, mainCss);

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
    this.addCommand({
      langKey: "enable-focus-mode",
      callback: () => {
        inputMode.simulateFocusInput();
      },
    });
    this.addCommand({
      langKey: "enable-typewriter-mode",
      callback: () => {
        inputMode.simulateTypewriterInput();
      },
    });
    this.addCommand({
      langKey: "disable-focus-mode",
      callback: () => {
        inputMode.disableFocus();
      },
    });
    this.addCommand({
      langKey: "disable-typewriter-mode",
      callback: () => {
        inputMode.disableTypewriter();
      },
    });

    const allOn = this.isAllEnabled();
    this.addTopBar({
      icon: ICON_SVG,
      title: allOn ? "zenType 已启用" : "zenType 已禁用",
      callback: () => this.toggleAll(),
    });

    // === P2: EventBus 订阅（替代手动 WS / DOM 事件 / 白名单） ===
    // 所有 8 个事件都按 (on, off) 配对记录到 eventBusOffFns，onunload 时统一释放
    const { eventBus } = this;

    // 1) loaded-protyle-static：新编辑器加载（首次打开文档 / 静态分屏）
    const onLoadedStatic = (e: CustomEvent<{ protyle: IProtyle }>) => {
      if (!this.enabled.cursor) return;
      onProtyleLoaded(e.detail.protyle);
    };
    eventBus.on("loaded-protyle-static", onLoadedStatic);
    this.eventBusOffFns.push(() =>
      eventBus.off("loaded-protyle-static", onLoadedStatic),
    );

    // 2) loaded-protyle-dynamic：动态编辑器（悬浮窗 / 嵌入块 / 链接跳转）
    const onLoadedDynamic = (e: CustomEvent<{ protyle: IProtyle; position: "afterend" | "beforebegin" }>) => {
      if (!this.enabled.cursor) return;
      onProtyleLoaded(e.detail.protyle);
    };
    eventBus.on("loaded-protyle-dynamic", onLoadedDynamic);
    this.eventBusOffFns.push(() =>
      eventBus.off("loaded-protyle-dynamic", onLoadedDynamic),
    );

    // 3) switch-protyle：切 Tab → 光标更新 + 聚焦/打字机模式退出
    const onSwitched = (e: CustomEvent<{ protyle: IProtyle }>) => {
      if (!this.enabled.cursor) return;
      inputMode.setBothOff();
      onProtyleSwitched(e.detail.protyle);
    };
    eventBus.on("switch-protyle", onSwitched);
    this.eventBusOffFns.push(() =>
      eventBus.off("switch-protyle", onSwitched),
    );

    // 5) click-editorcontent：用户在编辑器内点击 → 替代 firstProtyleIds 白名单
    const onClickEditorContent = (e: CustomEvent<{ protyle: IProtyle; event: MouseEvent }>) => {
      if (!this.enabled.cursor) return;
      onEditorContentClicked(e.detail.protyle);
    };
    eventBus.on("click-editorcontent", onClickEditorContent);
    this.eventBusOffFns.push(() =>
      eventBus.off("click-editorcontent", onClickEditorContent),
    );

    // 6) open-menu-content：右键菜单弹出 → 立即隐藏光标
    const onMenuOpenedHandler = () => {
      if (!this.enabled.cursor) return;
      onMenuOpened();
    };
    eventBus.on("open-menu-content", onMenuOpenedHandler);
    this.eventBusOffFns.push(() =>
      eventBus.off("open-menu-content", onMenuOpenedHandler),
    );

    // 7) ws-main：替代手动 WS 监听（思源内核已自动 JSON.parse）
    const onWsMainHandler = (e: CustomEvent<IWebSocketData>) => {
      if (!this.enabled.cursor) return;
      onWsMain(e.detail);
    };
    eventBus.on("ws-main", onWsMainHandler);
    this.eventBusOffFns.push(() =>
      eventBus.off("ws-main", onWsMainHandler),
    );

    // 8) mobile-keyboard-show
    const onKeyboardShow = () => {
      if (!this.enabled.cursor) return;
      onMobileKeyboardShow();
    };
    eventBus.on("mobile-keyboard-show", onKeyboardShow);
    this.eventBusOffFns.push(() =>
      eventBus.off("mobile-keyboard-show", onKeyboardShow),
    );

    // 9) mobile-keyboard-hide
    const onKeyboardHide = () => {
      if (!this.enabled.cursor) return;
      onMobileKeyboardHide();
    };
    eventBus.on("mobile-keyboard-hide", onKeyboardHide);
    this.eventBusOffFns.push(() =>
      eventBus.off("mobile-keyboard-hide", onKeyboardHide),
    );

    // === 模块初始化（与 P0 / round-3 相同） ===
    if (this.enabled.cursor) initCursor();
    if (this.enabled.typewriter) initTypewriter();
    if (this.enabled.ripple) initRipple();

    console.log("zenType v2 loaded (P2 with EventBus)");
  }

  onunload(): void {
    // 1) 先退订 EventBus（必须在销毁模块前完成，否则回调可能引用已销毁的状态）
    this.eventBusOffFns.forEach((off) => off());
    this.eventBusOffFns = [];

    // 2) 销毁模块
    destroyCursor();
    destroyTypewriter();
    destroyRipple();
    inputMode.reset();
    removeStyle(STYLE_ID);
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
