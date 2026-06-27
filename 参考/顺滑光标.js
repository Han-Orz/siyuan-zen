// 思源编辑器自定义光标
// 顺滑光标+是否闪烁+自定义样式
// 目前仅支持在编辑器中使用
// todo 极致性能优化，太复杂暂时不实现(可参考下文优化说明)
// see https://pipe.b3log.org/blogs/wilsons/%E6%80%9D%E6%BA%90/%E5%AE%9E%E6%97%B6%E8%8E%B7%E5%8F%96%E5%85%89%E6%A0%87%E4%BD%8D%E7%BD%AE%E4%BC%98%E5%8C%96%E6%80%9D%E8%B7%AF
// version 0.0.12.4
// 0.0.12.4 修复手机版，弹出输入法时光标丢失问题
// 0.0.12.3 修复与加密文档js冲突问题
// 0.0.12.2 修复0.0.11+引起的悬浮窗光标意外丢失问题
// 0.0.12.1 增加文档编辑时对光标的监控，防止文本被动态改变时光标无变化
// 0.0.12 修复0.0.11导致的滚动时光标消失问题
// 0.0.11 彻底解决打开文档或从搜索打开文档出现意外光标问题
// 0.0.10.5 修复公式，嵌入块，备注等关闭弹窗后光标定位不到问题
// 0.0.10.4 修复av光标定位不准问题
// 0.0.10.3 兼容编辑器被其他程序改变大小时光标定位不准问题
// 0.0.10.2 兼容表格等空行元素定位不准问题
// 0.0.10.1 修复手机版点击光标消失问题
// 0.0.10 重构光标获取算法；修复光标在行内公式等特殊情况时定位不准的问题；改进光标获取性能；改进标签切换等出现意外光标
// 0.0.9.2 修改多层滚动条嵌套下的滚动延迟问题；
// 0.0.9.1 优化滚动性能
// 0.0.9 优化光标插入性能
// 0.0.8 优化拖动时计算光标算法
// 0.0.7 修复侧边栏拖动时，光标只能临时被隐藏的问题；增加手机版支持开关
// 0.0.6 修复侧边栏拖动后光标定位不准和悬浮窗拖动时不能实时定位光标问题
// 0.0.5 改进在光标闪烁时，当移动/输入/点击时的不自然，有光标突然消失感的问题；改进滚动时光标有闪烁的问题；取消选择文本是的顺滑效果
// 0.0.4 优化滑动鼠标动画，更加丝滑
// 0.0.3 修复手动拖动滚动条的bug和改变尺寸编辑器和拖动悬浮窗口光标刷新延后问题和光标位置及可见区域细节调整
// 0.0.2 修复打开块等菜单时，光标显示在菜单之上的问题
// see https://ld246.com/article/1747269101239 发布帖
// see https://ld246.com/article/1747200651209 需求贴
(() => {
  // 是否使用光标顺滑动画效果 true 使用顺滑光标 false 不使用顺滑光标
  const isCursorSmoothEnabled = true;

  // 是否使用光标闪烁动画效果 true 闪动 false 不闪动
  const isCursorBlinkEnabled = true;

  // 是否也应用于文档标题中 true 应用 false 不应用
  const isApplyToTitle = true;

  // 设置光标是光标所在元素行高的多少倍，相当于按光标所在文本行高百分比设置光标高度
  const cursorHeightRelativeToLineHeight = 0.88;

  // 是否在手机端使用，如果手机端出现不兼容问时可以禁用手机端
  // true 使用 false 不使用
  const isUseInMobile = true;

  if (!isUseInMobile && isMobile()) return;

  // 其他光标样式，可以在这里改，颜色，宽高什么的
  addStyle(`
        .protyle-wysiwyg{ caret-color: transparent; } /* 隐藏编辑器默认光标 */
        .protyle-wysiwyg :is(input, texetarea) { caret-color: auto; }
        ${isApplyToTitle ? `.protyle-title__input{caret-color: transparent;}` : ""} /* 隐藏标题默认光标 */
        /* 新光标样式 */
        #custom-cursor {
          /* 光标宽度 */
          width: 3px;

          /* 预设光标高度，也可以这里写死，但写死不同的元素可能有差异（这里优先级高于动态计算） */
          /* 这里行高仍然受cursorHeightRelativeToLineHeight的影响，如果想不受影响，把倍数设为1 */
          /* height: 26px; */

          /* 光标颜色 */
          background: #5d8cd7;

          /* 以下样式，非必要勿改动 */
          position: fixed;
          pointer-events: none;
          transition: ${isCursorSmoothEnabled ? "transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)" : "none"};
          z-index: 1; /* 这个会实时动态计算，这里设置并不起作用 */
          transform: translate(0, 0);
          will-change: transform; /* 启用 GPU 加速 */
          backface-visibility: hidden; /* 避免重绘闪烁 */
          opacity: 1; /* 默认不透明 */
        }
        /* 隐藏光标 */
        #custom-cursor.hidden {
          opacity: 0 !important;
          animation: none !important;
          transition: none !important;
        }
        /* 停止光标闪动 */
        #custom-cursor.no-animation {
            animation: none !important;
        }
        /* 停止顺滑光标效果 */
        #custom-cursor.no-transition {
          transition: none !important;
        }
        /* 添加闪烁动画 */
        ${
          isCursorBlinkEnabled
            ? `
            #custom-cursor {
              animation: cursor-blink 3s 1.5s ease-in-out infinite;
            }
            @keyframes cursor-blink {
              0% { opacity: 1; }
              60% { opacity: 0.9; }
              90% { opacity: 0; }
              95% { opacity: 0; }
              100% { opacity: 0.3; }
            }
        `
            : ""
        }
        /* 侧边栏拖动手柄禁止选择，防止拖动时，被误插入marker标记（用于计算光标位置） */
        .layout__resize{user-select: none;}
    `);

  // 插入光标元素并开启光标监听事件
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div id="custom-cursor" class="hidden"></div>',
  );
  addCursorEvent();

  //////////// 以下功能函数非必要勿动 /////////////
  function addCursorEvent() {
    const cursor = document.getElementById("custom-cursor");
    let scrollTimeout = null;
    let isUpdating = false;
    let lastValidPos = null;
    let lastScrollPos = { x: window.scrollX, y: window.scrollY };
    let isFirstMove = true; // 新增首次移动标记
    let blinkTimeout;
    const BLINK_DELAY = 500; // 静止后开始闪烁的延迟时间
    //let editorLastLeft = 0;
    let firstProtyleIds = [];
    let clickedProtyleIds = [];
    let currentDocId = "";
    let hidePos = null;

    // 优先获取光标元素自身预设行高
    const cursorElement = document.getElementById("custom-cursor");
    const cursorStyle = cursorElement
      ? window.getComputedStyle(cursorElement)
      : null;
    const presetHeight = cursorStyle ? parseFloat(cursorStyle.height) : null;

    // 创建全局唯一 marker
    const globalMarker = (() => {
      const marker = document.createElement("span");
      marker.textContent = "\u200b";
      marker.style.cssText =
        "position: absolute; visibility: hidden; pointer-events: none;";
      return marker;
    })();

    const handleScroll = () => {
      // 清除闪烁并停止后续闪烁(滚动时必须停止动画，不然动画效果会让光标悬浮固定不动)
      if (blinkTimeout) clearTimeout(blinkTimeout);
      cursor.classList.add("no-animation");
      // 清除顺滑效果，防止滚动时上下跳动
      cursor.classList.add("no-transition");
      updateCursor();
      // clearTimeout(scrollTimeout);
      // scrollTimeout = setTimeout(() => {
      //     requestAnimationFrame(() => {
      //         if (!isScrolling()) {
      //             updateCursor();
      //         }
      //     });
      // }, 200);
    };

    const isScrolling = () => {
      const currentScrollPos = { x: window.scrollX, y: window.scrollY };
      const isMoving =
        currentScrollPos.x !== lastScrollPos.x ||
        currentScrollPos.y !== lastScrollPos.y;
      lastScrollPos = currentScrollPos;
      return isMoving;
    };

    // 获取光标位置，新方案
    function getStablePosition() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return null;
      // 克隆并 collapse Range
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      // 找到可编辑容器，用于取行高
      let hitNode = sel.focusNode;
      if (hitNode.nodeType === Node.TEXT_NODE) hitNode = hitNode.parentElement;
      if (hitNode.closest(".av") || hitNode.closest(".av__mask")) return null; // av不返回光标
      let lineEl = hitNode.closest('[contenteditable="true"]');
      // 尝试浏览器原生的 clientRects
      const rects = Array.from(range.getClientRects());
      let baseRect, rangePos;
      if (rects.length) {
        baseRect = rects[rects.length - 1];
      } else {
        // 先判断是否是段落空行，段落空行直接通过段落获取
        const cursorEl =
          range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;
        const paragraph = findParentParagraph(cursorEl);
        if (
          cursorEl &&
          paragraph &&
          !paragraph.textContent.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
        ) {
          baseRect = cursorEl.getBoundingClientRect();
          lineEl = cursorEl;
          rangePos = baseRect.left;
        }
        // 判断是否表格，表格空单元格需要特殊处理
        else if (
          cursorEl &&
          cursorEl.closest &&
          cursorEl.closest("td,th") &&
          !cursorEl
            .closest("td,th")
            .textContent.replace(/[\u200B-\u200D\uFEFF]/g, "")
            .trim()
        ) {
          const td = cursorEl.closest("td,th");
          baseRect = td.getBoundingClientRect();
          lineEl = td;
          rangePos = baseRect.left;
        }
        // 其他类型的元素空行兼容判断
        else if (
          cursorEl &&
          cursorEl.closest &&
          !cursorEl.textContent.replace(/[\u200B-\u200D\uFEFF]/g, "").trim()
        ) {
          baseRect = cursorEl.getBoundingClientRect();
          lineEl = cursorEl;
          rangePos = baseRect.left;
        } else {
          // 回退：插 marker 测一次
          range.insertNode(globalMarker);
          baseRect = globalMarker.getBoundingClientRect();
          globalMarker.remove();
        }
      }

      const style = lineEl ? window.getComputedStyle(lineEl) : null;
      // 优先用 line-height，否则 fallback 到 font-size * 1.625 或 26px
      const rawLineH =
        (style && parseFloat(style.lineHeight)) ||
        (style && parseFloat(style.fontSize) * 1.625) ||
        26;
      const lineH = rawLineH;
      // 获取 padding 和 border
      const paddingLeft = style ? parseFloat(style.paddingLeft) || 0 : 0;
      const borderLeft = style ? parseFloat(style.borderLeftWidth) || 0 : 0;
      // 计算高度：统一用行高 * 比例
      const height = lineH * cursorHeightRelativeToLineHeight;
      // 计算 y：把原生/marker 获取的 rect.top 对齐到行高
      // rectTop + (rect.height - height)/2  可能让光标在垂直居中
      const gap = (baseRect.height - height) / 2;

      // 定位光标位置(空白行+左边距和边框)
      const x = rangePos ? rangePos + paddingLeft + borderLeft : baseRect.right;
      const y = baseRect.top + gap;
      return baseRect.width + baseRect.height > 0 ? { x, y, height } : null;
    }

    // const getStablePosition = () => {
    //     const sel = window.getSelection();
    //     if (!sel.rangeCount) return null;

    //     document.body.clientWidth; // 强制重绘
    //     const range = sel.getRangeAt(0).cloneRange();
    //     range.collapse(true);

    //     // （暂没用这个方案）使用优先级：光标预设高度 > 段落行高 > 默认20px
    //     // const paragraph = findParentParagraph(range.startContainer);
    //     // if (paragraph && !paragraph.textContent.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()) {
    //     //     const rect = paragraph.getBoundingClientRect();
    //     //     const style = window.getComputedStyle(paragraph);
    //     //     const height = (presetHeight || parseFloat(style.lineHeight) || 26) * cursorHeightRelativeToLineHeight;
    //     //     const topGap = (parseFloat(style.lineHeight) - height) / 2;
    //     //     return {
    //     //         x: rect.left + parseFloat(style.paddingLeft),
    //     //         y: rect.top + parseFloat(style.paddingTop) + topGap,
    //     //         height: height
    //     //     };
    //     // }

    //     // const marker = document.createElement('span');
    //     // marker.textContent = '\u200b';
    //     // marker.style.cssText = 'position: absolute; visibility: hidden; pointer-events: none;';
    //     // range.insertNode(marker);
    //     // const rect = marker.getBoundingClientRect();
    //     // marker.remove();

    //     range.insertNode(globalMarker);
    //     const rect = globalMarker.getBoundingClientRect();
    //     globalMarker.remove();

    //     // 最终高度逻辑：优先使用光标预设高度，否则用实际测量高度
    //     const height = (presetHeight || rect.height)*cursorHeightRelativeToLineHeight;
    //     const topGap = (rect.height - height) / 2;
    //     return rect.width + rect.height > 0 ?
    //         { x: rect.left, y: rect.top + topGap, height: height } :
    //         null;
    // };

    const updateCursor = (event, eventType) => {
      if (isUpdating) return;
      isUpdating = true;
      if (
        event?.target?.tagName === "INPUT" ||
        event?.target?.tagName === "TEXTAREA"
      ) {
        isUpdating = false;
        return;
      }
      //requestAnimationFrame(() => {
      const pos = hidePos ? hidePos : getStablePosition();
      const output = { cursorElement: null, isOuterElement: false };

      if (!pos || !isInAllowElements(pos, output)) {
        // 编辑器内的元素，但超出编辑器范围了隐藏
        cursor.classList.add("hidden");
        isUpdating = false;
        //hidePos = pos;
        return;
      }

      // 如果不是编辑器区域则隐藏光标(防止标签切换等出现意外光标)
      const protyleId = isMobile()
        ? output.cursorElement
            ?.closest(".protyle")
            ?.querySelector(".protyle-title")?.dataset?.nodeId
        : output.cursorElement?.closest(".protyle:not(.fn__none)")?.dataset?.id;
      if (eventType === "selectionchange") {
        if (isMobile()) {
          // const docId =  output.cursorElement?.closest('.protyle:not(.fn__none)')?.querySelector('.protyle-title')?.dataset?.nodeId;
          // if(currentDocId !== docId) {
          //     if(docId) currentDocId = docId;
          //     cursor.classList.add('hidden');
          //     isUpdating = false;
          //     return;
          // }
        } else {
          if (!firstProtyleIds.includes(protyleId)) {
            if (protyleId) firstProtyleIds.push(protyleId);
            cursor.classList.add("hidden");
            isUpdating = false;
            return;
          }
        }
      }

      // 点击非可编辑区域时不做任何操作，直接返回
      if (
        output.cursorElement &&
        !output.cursorElement.closest('[data-node-id] [contenteditable="true"]')
      ) {
        cursor.classList.add("hidden");
        isUpdating = false;
        return;
      }

      // 清除之前的闪烁定时器
      if (blinkTimeout) clearTimeout(blinkTimeout);
      // 移除闪烁效果（当光标移动/输入/点击时不需要闪烁，不然会有突然消失感）
      cursor.classList.add("no-animation");

      // 处理首次移动
      if (isFirstMove) {
        cursor.classList.add("no-transition");
        isFirstMove = false;
      }

      // 当选择文本时，不需要顺滑动画
      if (eventType === "selectionchange") {
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && selection.toString()) {
          cursor.classList.add("no-transition");
        }
      }

      // 悬浮窗拖动窗口时，取消顺滑动画
      if (
        ["blockPopoverMove", "protyleResize", "protyleWysiwygResize"].includes(
          eventType,
        )
      ) {
        cursor.classList.add("no-transition");
      }

      // 更新位置前强制清除过渡
      //const protyleContent = output.cursorElement?.closest('.protyle:not(.fn__none) .protyle-content');
      //const editorRect = protyleContent.getBoundingClientRect();
      // 兼容拖动侧边栏，鼠标位置+编辑器被移动距离（移动距离=当前编辑器left-上次编辑器left）
      // 这里还有其他的算法，比如在或者光标位置时用 编辑器left-marker left得出相对距离，然后用pos.x+相对距离
      //const realX = pos.x + (editorRect.left - (editorLastLeft||editorRect.left));
      //editorLastLeft = editorRect.left;
      cursor.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      cursor.style.height = `${pos.height}px`;
      // click时才显示，解决打开文档或从搜索打开文档出现意外光标问题
      if (
        eventType === "click" ||
        clickedProtyleIds.includes(protyleId) ||
        output.cursorElement?.closest(".block__popover")
      ) {
        if (eventType === "click" && protyleId)
          clickedProtyleIds.push(protyleId);
        cursor.classList.remove("hidden");
      }
      //hidePos = null;
      cursor.style.zIndex = output.cursorElement
        ? getEffectiveZIndex(output.cursorElement) + 1
        : ++window.siyuan.zIndex;

      // 强制布局同步
      void cursor.offsetHeight;

      // 延迟恢复顺滑效果
      requestAnimationFrame(() => {
        cursor.classList.remove("no-transition");
      });

      // 延迟添加闪烁效果（待光标静止后恢复闪烁）
      blinkTimeout = setTimeout(() => {
        cursor.classList.remove("no-animation");
      }, BLINK_DELAY);

      lastValidPos = pos;
      isUpdating = false;
      //});
    };

    // 暂未用到
    // const isInViewport = (pos) => {
    //     return pos.y >= 0 &&
    //            pos.y <= window.innerHeight &&
    //            pos.x >= 0 &&
    //            pos.x <= window.innerWidth;
    // };

    const isInAllowElements = (pos, output = { cursorElement: null }) => {
      const cursorElement = getCursorElement();
      if (typeof output === "object") output.cursorElement = cursorElement;

      // 动态获取当前活动编辑区域
      let protyleContent = cursorElement?.closest(
        ".protyle:not(.fn__none) .protyle-content",
      );
      // 非编辑器内的元素返回
      if (!protyleContent) {
        output.isOuterElement = true;
        return false;
      }
      // 如果不应用于标题返回
      if (cursorElement.closest(".protyle-title__input") && !isApplyToTitle)
        return;

      // 获取编辑区域可视范围
      const editorRect = protyleContent.getBoundingClientRect();

      // 检查坐标是否在编辑区域可视范围内
      const isInEditor =
        pos.x >= editorRect.left &&
        pos.x <= editorRect.right &&
        pos.y >= editorRect.top &&
        pos.y <= editorRect.bottom;

      //获取滚动元素
      const scrollEl = findClosestScrollableElement(cursorElement);
      // 不是滚动元素直接返回编辑器区域
      if (
        protyleContent === scrollEl ||
        !isSelfOrDescendant(protyleContent, scrollEl)
      ) {
        return isInEditor;
      }
      // 获取滚动元素区域
      const scrollElRect = scrollEl.getBoundingClientRect();
      const isInScrollEl =
        pos.x >= scrollElRect.left &&
        pos.x <= scrollElRect.right &&
        pos.y >= scrollElRect.top &&
        pos.y <= scrollElRect.bottom;

      // 必须在滚动元素内且编辑器内
      return isInScrollEl && isInEditor;
    };

    // 给元素添加绑定事件
    const checkElementEvents = () => {
      const cursorElement = getCursorElement();
      if (!cursorElement) return;
      // 给内部带有滚动条的元素添加滚动事件
      const scrollEls = findClosestScrollableElements(cursorElement);
      scrollEls.forEach((scrollEl) => {
        if (scrollEl && !scrollEl.handleClick) {
          scrollEl.handleClick = handleScroll;
          scrollEl.addEventListener("scroll", scrollEl.handleClick);
          scrollEl.addEventListener("wheel", scrollEl.handleClick);
        }
      });
      // 给protyle-content绑定改变尺寸事件
      const protyleContent = cursorElement?.closest(
        ".protyle:not(.fn__none) .protyle-content",
      );
      if (protyleContent && !protyleContent.handleResize) {
        new ResizeObserver((entries) => {
          updateCursor({ target: protyleContent }, "protyleResize");
        }).observe(protyleContent);
      }
      // 给protyle-wysiwyg绑定改变尺寸事件
      const protyleWysiwyg = cursorElement?.closest(
        ".protyle:not(.fn__none) .protyle-wysiwyg",
      );
      if (protyleWysiwyg && !protyleWysiwyg.handleResize) {
        new ResizeObserver((entries) => {
          updateCursor({ target: protyleWysiwyg }, "protyleWysiwygResize");
        }).observe(protyleWysiwyg);
      }
      // 给block__popover绑定拖动事件
      const blockPopover = cursorElement?.closest(".block__popover");
      if (blockPopover && !blockPopover.handleDrag) {
        const dragEl = blockPopover.querySelector(".resize__move");
        if (!dragEl) return;
        blockPopover.handleDrag = true;
        let isDragging = false;
        dragEl.addEventListener("mousedown", function (e) {
          isDragging = true;
        });
        dragEl.addEventListener("mousemove", function (e) {
          if (isDragging) updateCursor(e, "blockPopoverMove");
        });
        dragEl.addEventListener("mouseup", function (e) {
          isDragging = false;
        });
      }
    };

    const events = [
      ["scroll", () => handleScroll],
      ["wheel", () => handleScroll],
      ["touchmove", () => handleScroll],
      [
        "selectionchange",
        (e) => updateCursor(e, "selectionchange"),
        { passive: true },
      ],
      ["keydown", () => requestAnimationFrame(updateCursor)],
      ["input", () => requestAnimationFrame(updateCursor)],
      [
        "click",
        (e) => {
          updateCursor(e, "click");
          checkElementEvents();
        },
      ],
      ["compositionend", updateCursor],
      ["mouseup", updateCursor],
      ["resize", () => requestAnimationFrame(updateCursor), { passive: true }],
      [
        "keyup",
        () => {
          checkElementEvents();
        },
      ],
    ];

    events.forEach(([e, h, opts]) => {
      document.addEventListener(e, h, opts);
    });

    // 监控文本动态发生变化
    // onDomChange((target) => {
    //     if(target.closest('.protyle-wysiwyg')) {
    //         updateCursor();
    //     }
    // });
    window.siyuan.ws.ws.addEventListener("message", async (e) => {
      const msg = JSON.parse(e.data);
      if (msg.cmd === "transactions") {
        const block = msg?.data
          ?.flatMap((item) => item?.doOperations || [])
          ?.find((it) => it?.action === "update");
        if (
          document.querySelector(
            '.protyle-wysiwyg [data-node-id="' + block?.id + '"]',
          )
        ) {
          updateCursor();
        }
      }
    });
  }

  function onDomChange(callback, delay = 100) {
    let timeoutId;
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type === "childList") {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            callback(mutation.target);
          }, delay); // 延迟执行，合并多次变化
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
    });
  }

  function findParentParagraph(node) {
    let current = node;
    while (current && current !== document.body) {
      if (current?.dataset?.type === "NodeParagraph") return current;
      current = current.parentElement;
    }
    return null;
  }

  function getCursorElement() {
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      // 获取选择范围的起始位置所在的节点
      const startContainer = range.startContainer;
      // 如果起始位置是文本节点，返回其父元素节点
      const cursorElement =
        startContainer.nodeType === Node.TEXT_NODE
          ? startContainer.parentElement
          : startContainer;

      return cursorElement;
    }
    return null;
  }

  function addStyle(css) {
    const style = document.createElement("style");
    style.innerHTML = css;
    document.head.appendChild(style);
  }

  // 获取实际生效的z-index
  function getEffectiveZIndex(element) {
    let current = element;
    while (current) {
      const style = window.getComputedStyle(current);
      const zIndex = style.zIndex;
      const position = style.position;

      // 如果是根元素，直接返回 0
      if (current === document.documentElement) return 0;

      // 判断当前元素是否创建了层叠上下文
      let isStackingContext = false;
      // 条件1: position 是 fixed 或 sticky（自动创建层叠上下文，即使 z-index 是 auto）
      if (position === "fixed" || position === "sticky") {
        isStackingContext = true;
      }
      // 条件2: position 是 absolute/relative 且 z-index 非 auto
      else if (
        (position === "absolute" || position === "relative") &&
        zIndex !== "auto"
      ) {
        isStackingContext = true;
      }
      // 其他条件（如 opacity < 1、transform 等）需要额外判断，此处暂未实现

      // 如果当前元素是层叠上下文，返回其 z-index（auto 视为 0）
      if (isStackingContext) {
        return zIndex === "auto" ? 0 : parseInt(zIndex, 10);
      }

      current = current.parentElement;
    }
    return 0; // 理论上不会执行到此处
  }

  function hasScroll(el) {
    const style = getComputedStyle(el);
    const canScrollY =
      (style.overflowY === "scroll" || style.overflowY === "auto") &&
      el.scrollHeight > el.clientHeight;
    const canScrollX =
      (style.overflowX === "scroll" || style.overflowX === "auto") &&
      el.scrollWidth > el.clientWidth;
    return canScrollY || canScrollX;
  }

  // 检查有滚动条的父元素，返回所有
  function findClosestScrollableElements(element) {
    const scrollableElements = [];
    while (element) {
      if (hasScroll(element)) {
        scrollableElements.push(element);
      }
      element = element.parentElement;
    }
    return scrollableElements;
  }

  // 检查有滚动条的父元素，只返回最近一个
  function findClosestScrollableElement(element) {
    while (element && element !== document.documentElement) {
      if (hasScroll(element)) return element;
      element = element.parentElement;
    }

    // 显式检查根元素
    const roots = [document.body, document.documentElement];
    for (const root of roots) {
      if (hasScroll(root)) return root;
    }

    return null;
  }

  // 检查是否自身或后代
  function isSelfOrDescendant(protyleContent, scrollEl) {
    return protyleContent === scrollEl || protyleContent.contains(scrollEl);
  }

  function isMobile() {
    return !!document.getElementById("sidebar");
  }
})();
