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
// Single static topbar icon — visual state (off/on) is driven by container class
// (.zentype-topbar-icon--on / --off) via SCSS descendant selectors; SVG DOM is
// never replaced post-load so SiYuan's element reference stays stable.
const ICON = `<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="8" class="zt-topbar-circle"/></svg>`;

export default class ZenType extends Plugin {
  private enabled: ModuleEnabled = {
    cursor: true,
    typewriter: true,
    ripple: true,
  };

  // P2: 集中管理 EventBus 退订函数，onunload 时统一释放，避免内存泄漏
  private eventBusOffFns: Array<() => void> = [];

  // 顶栏图标容器引用，供 updateTopBarIcon() 切换 --on / --off class
  private topBarItem: HTMLElement | null = null;

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
      langText: "切换光标",
      hotkey: "⇧⌘C",
      callback: () => this.toggle("cursor"),
    });
    this.addCommand({
      langKey: "toggle-typewriter",
      langText: "切换打字机",
      hotkey: "⇧⌘T",
      callback: () => this.toggle("typewriter"),
    });
    this.addCommand({
      langKey: "toggle-ripple",
      langText: "切换涟漪",
      hotkey: "⇧⌘R",
      callback: () => this.toggle("ripple"),
    });
    this.addCommand({
      langKey: "toggle-type",
      langText: "切换联合（打字机+涟漪）",
      hotkey: "⌃⌥Z",
      callback: () => this.toggleType(),
    });

    const allOn = this.isAllEnabled();
    this.topBarItem = this.addTopBar({
      icon: ICON,
      title: allOn ? "zenType · 聚焦/打字机：开" : "zenType · 聚焦/打字机：关",
      callback: () => this.toggleType(),
    });
    // 容器 class 互斥初始化：off → --off, on → --on
    if (this.topBarItem) {
      this.topBarItem.classList.add(
        allOn ? "zentype-topbar-icon--on" : "zentype-topbar-icon--off",
      );
    }

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
    // v2.3.0：cursor 始终初始化（光标常开），不再受 STORAGE_KEY 中 cursor 字段影响
    initCursor();
    document.body.classList.add("zentype-cursor-active");
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
    document.body.classList.remove("zentype-cursor-active");
    this.topBarItem = null;
    console.log("zenType v2 unloaded");
  }

  // 方案 γ：容器 class 互斥 toggle + aria-label 更新；永不修改 SVG 内部 DOM
  private updateTopBarIcon(): void {
    if (!this.topBarItem) return;
    const allOn = this.isAllEnabled();
    if (allOn) {
      this.topBarItem.classList.add("zentype-topbar-icon--on");
      this.topBarItem.classList.remove("zentype-topbar-icon--off");
    } else {
      this.topBarItem.classList.add("zentype-topbar-icon--off");
      this.topBarItem.classList.remove("zentype-topbar-icon--on");
    }
    this.topBarItem.setAttribute(
      "aria-label",
      allOn ? "zenType · 聚焦/打字机：开" : "zenType · 聚焦/打字机：关",
    );
  }

  private toggle(name: ModuleName): void {
    this.enabled[name] = !this.enabled[name];

    if (name === "cursor") {
      if (this.enabled.cursor) {
        initCursor();
        document.body.classList.add("zentype-cursor-active");
      } else {
        destroyCursor();
        document.body.classList.remove("zentype-cursor-active");
      }
    } else if (name === "typewriter") {
      if (this.enabled.typewriter) initTypewriter();
      else destroyTypewriter();
    } else if (name === "ripple") {
      if (this.enabled.ripple) initRipple();
      else destroyRipple();
    }

    this.saveData(STORAGE_KEY, this.enabled);
    this.updateTopBarIcon();
  }

  private toggleType(): void {
    const allOn = this.isAllEnabled();
    const newState = !allOn;

    // v2.3.0：toggleType 不再 touch cursor（光标常开 spec）

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
    this.updateTopBarIcon();
  }

  private isAllEnabled(): boolean {
    // v2.3.0：语义改为"typewriter + ripple 两者都开"，不再 include cursor
    return this.enabled.typewriter && this.enabled.ripple;
  }
}
