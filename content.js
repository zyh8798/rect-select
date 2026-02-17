/**
 * 多选文字 - 按住 Alt 拖拽可添加选区，不打断之前的选择，支持跨行
 */

(function () {
  'use strict';

  let highlightContainer = null;
  let previewContainer = null;
  let selectedRanges = [];
  let selectedText = '';
  let isDragging = false;
  let dragStart = null;
  let justAddedSelection = false;
  let scrollRaf = 0;
  let previewRaf = 0;
  let lastMouse = { x: 0, y: 0 };

  function ensureHighlightContainer() {
    if (!highlightContainer) {
      highlightContainer = document.createElement('div');
      highlightContainer.id = 'multi-select-highlights';
      highlightContainer.style.cssText = `
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        z-index: 2147483646;
      `;
      document.body.appendChild(highlightContainer);
    }
  }

  function ensurePreviewContainer() {
    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.id = 'multi-select-preview';
      previewContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647';
      document.body.appendChild(previewContainer);
    }
  }

  function updatePreview() {
    if (!isDragging || !dragStart || !previewContainer) {
      previewRaf = 0;
      return;
    }
    const endPos = getCaretFromPoint(lastMouse.x, lastMouse.y);
    if (!endPos) {
      previewRaf = 0;
      return;
    }
    const range = document.createRange();
    range.setStart(dragStart.node, dragStart.offset);
    range.setEnd(endPos.node, endPos.offset);
    if (range.collapsed) {
      previewContainer.innerHTML = '';
      previewRaf = 0;
      return;
    }
    const frag = document.createDocumentFragment();
    try {
      const rects = range.getClientRects();
      for (const rect of rects) {
        const div = document.createElement('div');
        div.className = 'rect-select-highlight';
        div.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
        frag.appendChild(div);
      }
      previewContainer.innerHTML = '';
      previewContainer.appendChild(frag);
    } catch (e) {
      previewContainer.innerHTML = '';
    }
    previewRaf = 0;
  }

  function clearPreview() {
    if (previewContainer) previewContainer.innerHTML = '';
  }

  function getCaretFromPoint(x, y) {
    const r = document.caretRangeFromPoint?.(x, y);
    if (r) return { node: r.startContainer, offset: r.startOffset };
    const p = document.caretPositionFromPoint?.(x, y);
    if (p) return { node: p.offsetNode, offset: p.offset };
    return null;
  }

  // 将 Range 拆成多个 { node, start, end } 片段（每个对应一个 text node）
  function rangeToSegments(range) {
    const segments = [];
    const sc = range.startContainer;
    const ec = range.endContainer;
    const so = range.startOffset;
    const eo = range.endOffset;

    if (sc.nodeType !== Node.TEXT_NODE || ec.nodeType !== Node.TEXT_NODE) {
      return segments;
    }

    if (sc === ec) {
      segments.push({ node: sc, start: so, end: eo });
      return segments;
    }

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (n) => {
          const tag = (n.parentElement?.tagName || '').toUpperCase();
          if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    walker.currentNode = sc;
    let node = sc;
    while (node) {
      const isStart = (node === sc);
      const isEnd = (node === ec);
      const start = isStart ? so : 0;
      const end = isEnd ? eo : node.length;
      segments.push({ node, start, end });
      if (isEnd) break;
      node = walker.nextNode();
    }
    return segments;
  }

  function updateHighlights() {
    if (!highlightContainer) ensureHighlightContainer();
    const frag = document.createDocumentFragment();
    selectedText = '';

    for (const r of selectedRanges) {
      const range = document.createRange();
      range.setStart(r.node, r.start);
      range.setEnd(r.node, r.end);
      try {
        const rects = range.getClientRects();
        for (const rect of rects) {
          const div = document.createElement('div');
          div.className = 'rect-select-highlight';
          div.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
          frag.appendChild(div);
        }
        selectedText += range.toString();
      } catch (e) {}
    }
    highlightContainer.innerHTML = '';
    highlightContainer.appendChild(frag);
  }

  function clearSelection() {
    if (previewRaf) cancelAnimationFrame(previewRaf);
    previewRaf = 0;
    clearPreview();
    if (highlightContainer) highlightContainer.innerHTML = '';
    selectedRanges = [];
    selectedText = '';
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
  }

  function copyToClipboard() {
    if (selectedText) navigator.clipboard.writeText(selectedText);
  }

  function onMouseDown(e) {
    if (e.button !== 0) return;

    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      const pos = getCaretFromPoint(e.clientX, e.clientY);
      if (pos) {
        isDragging = true;
        dragStart = pos;
        lastMouse.x = e.clientX;
        lastMouse.y = e.clientY;
        ensurePreviewContainer();
        updatePreview();
      }
    } else {
      clearSelection();
      isDragging = false;
    }
  }

  function onMouseMove(e) {
    if (!isDragging || !dragStart) return;
    lastMouse.x = e.clientX;
    lastMouse.y = e.clientY;
    if (previewRaf) return;
    previewRaf = requestAnimationFrame(updatePreview);
  }

  function onMouseUp(e) {
    if (e.button !== 0) return;

    if (isDragging && dragStart) {
      e.preventDefault();
      e.stopPropagation();
      if (previewRaf) cancelAnimationFrame(previewRaf);
      previewRaf = 0;
      clearPreview();
      const endPos = getCaretFromPoint(e.clientX, e.clientY);
      if (endPos) {
        const range = document.createRange();
        range.setStart(dragStart.node, dragStart.offset);
        range.setEnd(endPos.node, endPos.offset);

        if (!range.collapsed) {
          const segments = rangeToSegments(range);
          selectedRanges.push(...segments);
          justAddedSelection = true;
        }
      }
      updateHighlights();
      isDragging = false;
      dragStart = null;

      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    }
  }

  function onClick(e) {
    if (e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (justAddedSelection) {
      justAddedSelection = false;
      return;
    }
    if (selectedRanges.length > 0) {
      clearSelection();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Alt' && document.body) {
      document.body.classList.add('multi-select-alt-held');
    }
    if (e.key === 'c' && (e.ctrlKey || e.metaKey) && selectedRanges.length > 0) {
      e.preventDefault();
      copyToClipboard();
    }
    if (e.key === 'Escape') {
      clearSelection();
    }
  }

  function onKeyUp(e) {
    if (e.key === 'Alt' && document.body) {
      document.body.classList.remove('multi-select-alt-held');
    }
  }

  function removeAltClass() {
    if (document.body) document.body.classList.remove('multi-select-alt-held');
  }

  function onScroll() {
    if (selectedRanges.length === 0) return;
    if (scrollRaf) cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      updateHighlights();
      scrollRaf = 0;
    });
  }

  function init() {
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', removeAltClass);
    window.addEventListener('scroll', onScroll, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
