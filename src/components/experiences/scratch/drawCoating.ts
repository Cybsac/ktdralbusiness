import { SCRATCH_VISUAL_CONFIG } from "./scratchVisualConfig";

const coatingRenderVersions = new WeakMap<HTMLCanvasElement, number>();

function drawTrackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  const widths = [...text].map((character) => ctx.measureText(character).width);
  const totalWidth = widths.reduce((sum, value) => sum + value, 0) + spacing * Math.max(0, text.length - 1);
  let cursor = x - totalWidth / 2;
  [...text].forEach((character, index) => { ctx.fillText(character, cursor + widths[index] / 2, y); cursor += widths[index] + spacing; });
}

function drawNightlifeIcon(ctx: CanvasRenderingContext2D, type: string, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.beginPath();
  if (type === "bottle") { ctx.roundRect(-size * .22, -size * .45, size * .44, size * .9, size * .08); ctx.moveTo(-size * .12, -size * .45); ctx.lineTo(-size * .12, -size * .68); ctx.lineTo(size * .12, -size * .68); ctx.lineTo(size * .12, -size * .45); }
  else if (type === "coupe") { ctx.moveTo(-size * .52, -size * .35); ctx.quadraticCurveTo(0, size * .15, size * .52, -size * .35); ctx.moveTo(0, size * .15); ctx.lineTo(0, size * .52); ctx.moveTo(-size * .25, size * .52); ctx.lineTo(size * .25, size * .52); }
  else if (type === "glass") { ctx.moveTo(-size * .42, -size * .42); ctx.lineTo(size * .42, -size * .42); ctx.lineTo(size * .27, size * .48); ctx.lineTo(-size * .27, size * .48); ctx.closePath(); ctx.moveTo(0, size * .48); ctx.lineTo(0, size * .68); }
  else { ctx.moveTo(0, -size * .65); ctx.lineTo(0, size * .65); ctx.moveTo(-size * .65, 0); ctx.lineTo(size * .65, 0); ctx.moveTo(-size * .42, -size * .42); ctx.lineTo(size * .42, size * .42); ctx.moveTo(size * .42, -size * .42); ctx.lineTo(-size * .42, size * .42); }
  ctx.stroke(); ctx.restore();
}

export function drawCoating(canvas: HTMLCanvasElement, width: number, height: number, pixelRatio: number) {
  const renderVersion = (coatingRenderVersions.get(canvas) || 0) + 1;
  coatingRenderVersions.set(canvas, renderVersion);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const base = ctx.createLinearGradient(0, 0, width, height);
  const colors = SCRATCH_VISUAL_CONFIG.coating.base;
  base.addColorStop(0, colors[0]); base.addColorStop(0.28, colors[1]); base.addColorStop(0.55, colors[2]); base.addColorStop(1, colors[3]);
  ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
  const reflection = ctx.createLinearGradient(0, height * 0.1, width, height * 0.75);
  reflection.addColorStop(0, "rgba(255,255,255,0)"); reflection.addColorStop(0.48, "rgba(255,255,255,.25)"); reflection.addColorStop(0.58, "rgba(255,255,255,0)");
  ctx.fillStyle = reflection; ctx.fillRect(0, 0, width, height);
  const grain = document.createElement("canvas"); grain.width = Math.max(1, Math.floor(width / 2)); grain.height = Math.max(1, Math.floor(height / 2));
  const grainCtx = grain.getContext("2d");
  if (grainCtx) {
    const image = grainCtx.createImageData(grain.width, grain.height);
    for (let index = 0; index < image.data.length; index += 4) { const value = 105 + Math.floor(Math.random() * 75); image.data[index] = value; image.data[index + 1] = value; image.data[index + 2] = value; image.data[index + 3] = 18; }
    grainCtx.putImageData(image, 0, 0); ctx.globalAlpha = 0.7; ctx.imageSmoothingEnabled = false; ctx.drawImage(grain, 0, 0, width, height); ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = SCRATCH_VISUAL_CONFIG.coating.border; ctx.lineWidth = 1.2; ctx.strokeRect(14, 14, width - 28, height - 28);
  const pattern = SCRATCH_VISUAL_CONFIG.pattern;
  if (pattern.type === "logo") {
    const patternLogo = new Image();
    patternLogo.onload = () => {
      if (coatingRenderVersions.get(canvas) !== renderVersion) return;
      ctx.save(); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); ctx.globalAlpha = pattern.opacity; ctx.strokeStyle = SCRATCH_VISUAL_CONFIG.coating.pattern; ctx.filter = "sepia(1) saturate(.65)";
      const ratio = patternLogo.naturalHeight / Math.max(1, patternLogo.naturalWidth); const logoHeight = pattern.width * ratio;
      const angle = pattern.rotation * Math.PI / 180;
      const halfWidth = pattern.width / 2; const halfHeight = logoHeight / 2;
      const edgeX = Math.abs(Math.cos(angle) * halfWidth) + Math.abs(Math.sin(angle) * halfHeight);
      const edgeY = Math.abs(Math.sin(angle) * halfWidth) + Math.abs(Math.cos(angle) * halfHeight);
      const verticalSpacing = width <= pattern.responsive.mobileBreakpoint ? pattern.spacing * pattern.responsive.mobileVerticalScale : pattern.spacing;
      const columns = Math.max(1, Math.floor((width - edgeX * 2) / pattern.spacing) + 1);
      const rows = Math.max(1, Math.floor((height - edgeY * 2) / verticalSpacing) + 1);
      const stepX = columns > 1 ? (width - edgeX * 2) / (columns - 1) : 0;
      const stepY = rows > 1 ? (height - edgeY * 2) / (rows - 1) : 0;
      for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
        const drawX = edgeX + column * stepX;
        const y = edgeY + row * stepY;
        ctx.save(); ctx.translate(drawX, y); ctx.rotate(angle); ctx.drawImage(patternLogo, -halfWidth, -halfHeight, pattern.width, logoHeight); ctx.restore();
      }
      ctx.restore();
    };
    patternLogo.src = pattern.asset;
  }
  ctx.fillStyle = SCRATCH_VISUAL_CONFIG.coating.text; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "800 20px system-ui, sans-serif"; drawTrackedText(ctx, SCRATCH_VISUAL_CONFIG.copy.title, width / 2, height / 2 - 2, 2.2); ctx.font = "600 10px system-ui, sans-serif"; ctx.fillText(SCRATCH_VISUAL_CONFIG.copy.instruction, width / 2, height / 2 + 29);
  ctx.restore();
}
