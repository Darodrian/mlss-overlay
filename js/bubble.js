// The 9-slice speech bubble: nine frame tiles from box/, the tail and the
// message text.
//
// The bubble is measured once from the whole message and then never resized,
// so the tail stays put while the text types itself in.
import { LAYOUT } from './characters.js';

// The corner tiles come last: the tail tile starts with a solid white block
// that has to cover the bubble's own bottom border, and it would otherwise
// paint over the rounded corner it leans into.
const TILES = ['t', 'l', 'c', 'r', 'b', 'p', 'tl', 'tr', 'bl', 'br'];

export function bubbleMarkup() {
  const tiles = TILES.map(
    (name) => `      <div class="bubble-tile" data-tile="${name}"></div>`,
  ).join('\n');
  return [
    '    <div class="bubble is-hidden" id="bubble">',
    tiles,
    '      <div class="bubble-ghost" id="bubble-ghost"></div>',
    '      <div class="bubble-text" id="bubble-text"></div>',
    '    </div>',
  ].join('\n');
}

function roundUp(value, grid) {
  if (!grid || grid < 1) return Math.round(value);
  return Math.ceil(value / grid) * grid;
}

export function bubbleSize({
  textWidth,
  textHeight,
  padding = 16,
  maxWidth = Infinity,
  grid = 4,
}) {
  const content = Math.min(Math.max(0, textWidth), Math.max(0, maxWidth - padding * 2));
  return {
    width: roundUp(content + padding * 2, grid),
    height: roundUp(textHeight + padding * 2, grid),
  };
}

export function createBubble(host) {
  host.insertAdjacentHTML('beforeend', bubbleMarkup());

  const root = host.querySelector('.bubble');
  const textEl = host.querySelector('.bubble-text');
  const ghostEl = host.querySelector('.bubble-ghost');
  const tailEl = host.querySelector('[data-tile="p"]');

  const measureCtx = document.createElement('canvas').getContext('2d');
  const size = { width: 0, height: 0 };

  function textWidth(text) {
    measureCtx.font = `${LAYOUT.fontSize}px Zpix, monospace`;
    return measureCtx.measureText(text).width;
  }

  // Measures the whole message so the bubble can be laid out once.
  function setMessage(message, maxWidth) {
    const padding = LAYOUT.bubblePadding;
    const room = Math.max(0, maxWidth - padding * 2);
    const contentWidth = Math.floor(room / LAYOUT.scale) * LAYOUT.scale;

    ghostEl.style.width = `${contentWidth}px`;
    ghostEl.textContent = message;

    const next = bubbleSize({
      textWidth: textWidth(message),
      textHeight: ghostEl.offsetHeight,
      padding,
      maxWidth: contentWidth + padding * 2,
      grid: LAYOUT.scale,
    });

    size.width = next.width;
    size.height = next.height;
    root.style.width = `${next.width}px`;
    root.style.height = `${next.height}px`;
    // The text wraps exactly like the ghost it was measured against.
    textEl.style.width = `${Math.max(0, next.width - padding * 2)}px`;
    return next;
  }

  function setText(text) {
    textEl.textContent = text;
  }

  function setPosition({ left, top }) {
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  }

  function setTail(offsetX) {
    tailEl.style.left = `${Math.round(offsetX)}px`;
  }

  function show() {
    root.classList.remove('is-hidden');
  }

  function hide() {
    root.classList.add('is-hidden');
  }

  return {
    get width() {
      return size.width;
    },
    get height() {
      return size.height;
    },
    setMessage,
    setText,
    setPosition,
    setTail,
    show,
    hide,
    root,
  };
}
