// Draws sprite-sheet frames onto a canvas with the pixel art left crisp.
import { LAYOUT } from './characters.js';

export function createSprite(canvas) {
  const ctx = canvas.getContext('2d');
  const images = new Map();

  let sheet = null;
  let mirror = false;
  let frame = -1;

  function resize() {
    const first = sheet.frames[0];
    canvas.width = first.w * LAYOUT.scale;
    canvas.height = first.h * LAYOUT.scale;
    ctx.imageSmoothingEnabled = false;
  }

  function draw(index) {
    if (!sheet || !images.has(sheet.name)) return;
    const image = images.get(sheet.name);
    const frames = sheet.frames;
    const f = frames[((index % frames.length) + frames.length) % frames.length];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (mirror) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(image, f.x, f.y, f.w, f.h, 0, 0, f.w * LAYOUT.scale, f.h * LAYOUT.scale);
    ctx.restore();
    frame = index;
  }

  async function load(sheets) {
    await Promise.all(
      sheets.map(async (s) => {
        if (images.has(s.name)) return;
        const img = new Image();
        img.src = s.image;
        await img.decode();
        images.set(s.name, img);
      }),
    );
  }

  function use(nextSheet) {
    sheet = nextSheet;
    frame = -1;
    resize();
    draw(0);
  }

  return {
    load,
    use,
    draw,
    setMirror(value) {
      if (mirror === value) return;
      mirror = value;
      draw(frame < 0 ? 0 : frame);
    },
    get sheet() {
      return sheet;
    },
    get frameCount() {
      return sheet?.frames.length ?? 0;
    },
    get width() {
      return canvas.width;
    },
    get height() {
      return canvas.height;
    },
  };
}
