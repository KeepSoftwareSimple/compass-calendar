import { useEffect, useRef } from "react";

const CHARS = " .:-=+*%@";
const COLUMNS_PER_240PX = 60;
const MOUSE_RADIUS = 10;
const INTENSITY = 3;
const PERSISTENCE = 0.97;
const RETURN_SPEED = 0.1;
const JIGGLE_INTENSITY = 0.2;
const CONTRAST = 120;

/**
 * Brightness maps from the dark backdrop up to white, so the portrait keeps
 * its light, angelic feel while sitting on the app's dark surface.
 */
const SHADOW_COLOR_VAR = "--color-background";
const HIGHLIGHT_COLOR_VAR = "--color-text";
const BACKDROP_COLOR_VAR = "--color-background";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  char: string;
  color: string;
}

const applyContrast = (brightness: number) => {
  const contrasted = 128 + (CONTRAST / 100) * (brightness - 128);
  return Math.max(0, Math.min(255, contrasted));
};

/** Resolves a CSS color custom property to RGB by letting the canvas parse it. */
const resolveCssColor = (varName: string) => {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return { r: 255, g: 255, b: 255 };
  probe.fillStyle = raw;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
};

const mixColor = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) =>
  `rgb(${Math.round(a.r + (b.r - a.r) * t)}, ${Math.round(a.g + (b.g - a.g) * t)}, ${Math.round(a.b + (b.b - a.b) * t)})`;

interface AsciiPortraitProps {
  src: string;
  alt: string;
  className?: string;
}

export const AsciiPortrait = ({ src, alt, className }: AsciiPortraitProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!container || !canvas || !ctx) return;

    // Not fetched until the dialog first opens: this mounts on every week
    // load behind a closed <dialog>, and a 50 KB portrait has no business on
    // the boot path. The ResizeObserver below starts the load on first open.
    const image = new Image();

    const shadowColor = resolveCssColor(SHADOW_COLOR_VAR);
    const highlightColor = resolveCssColor(HIGHLIGHT_COLOR_VAR);
    const backdropColor = resolveCssColor(BACKDROP_COLOR_VAR);
    const backdropFill = `rgb(${backdropColor.r}, ${backdropColor.g}, ${backdropColor.b})`;

    let particles: Particle[] = [];
    let cellSize = 0;
    let logicalWidth = 0;
    let logicalHeight = 0;
    let dpr = 1;
    let mouseX = -1000;
    let mouseY = -1000;
    let animationFrame = 0;
    let cancelled = false;

    const buildParticles = () => {
      // Zero while the parent <dialog> is closed (display: none); the
      // ResizeObserver rebuilds once it opens and has real dimensions.
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      if (!containerWidth || !containerHeight) return;
      const aspectRatio = image.height / image.width;

      const width =
        containerWidth * aspectRatio <= containerHeight
          ? containerWidth
          : containerHeight / aspectRatio;
      const height = width * aspectRatio;

      // Back the canvas at device resolution so glyphs stay sharp on retina.
      dpr = window.devicePixelRatio || 1;
      logicalWidth = width;
      logicalHeight = height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;

      const columns = Math.round((width / 240) * COLUMNS_PER_240PX);
      const rows = Math.ceil(columns * aspectRatio);
      cellSize = width / columns;

      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = columns;
      sampleCanvas.height = rows;
      const sampleCtx = sampleCanvas.getContext("2d");
      if (!sampleCtx) return;

      sampleCtx.drawImage(image, 0, 0, columns, rows);
      const { data } = sampleCtx.getImageData(0, 0, columns, rows);

      particles = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < columns; x++) {
          const i = (y * columns + x) * 4;
          const brightness = applyContrast(
            0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2],
          );
          const charIndex = Math.min(
            CHARS.length - 1,
            Math.floor((brightness / 256) * CHARS.length),
          );
          const posX = x * cellSize;
          const posY = y * cellSize;

          particles.push({
            x: posX,
            y: posY,
            vx: 0,
            vy: 0,
            targetX: posX,
            targetY: posY,
            char: CHARS[charIndex],
            color: mixColor(shadowColor, highlightColor, brightness / 255),
          });
        }
      }
    };

    const animate = () => {
      if (cancelled) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = backdropFill;
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);
      ctx.font = `${cellSize * 1.15}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const p of particles) {
        const dx = p.x - mouseX;
        const dy = p.y - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Jiggle only near the cursor: at rest every glyph sits exactly on
        // its grid cell, keeping the portrait crisp.
        if (distance < MOUSE_RADIUS) {
          const force = (1 - distance / MOUSE_RADIUS) * INTENSITY;
          const angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * force * 0.2;
          p.vy += Math.sin(angle) * force * 0.2;
          p.vx += (Math.random() - 0.5) * JIGGLE_INTENSITY;
          p.vy += (Math.random() - 0.5) * JIGGLE_INTENSITY;
        }

        p.vx *= PERSISTENCE;
        p.vy *= PERSISTENCE;
        p.x += p.vx;
        p.y += p.vy;
        p.x += (p.targetX - p.x) * RETURN_SPEED;
        p.y += (p.targetY - p.y) * RETURN_SPEED;

        ctx.fillStyle = p.color;
        ctx.fillText(p.char, p.x, p.y);
      }

      animationFrame = requestAnimationFrame(animate);
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    const resizeObserver = new ResizeObserver(() => {
      // Zero while the parent <dialog> is closed (display: none).
      if (!container.clientWidth || !container.clientHeight) return;
      if (!image.src) {
        // First open: start the fetch; onload builds the particles.
        image.src = src;
        return;
      }
      if (image.complete && image.naturalWidth) buildParticles();
    });

    image.onload = () => {
      if (cancelled) return;
      buildParticles();
      animate();
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    resizeObserver.observe(container);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      resizeObserver.disconnect();
    };
  }, [src]);

  return (
    <div ref={containerRef} className={className} role="img" aria-label={alt}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
};
