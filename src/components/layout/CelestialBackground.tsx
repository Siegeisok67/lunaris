import { useEffect, useRef } from "react";

interface Star {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  phase: number;
  speed: number;
  hue: number;
  opacity: number;
}

function makeStars(width: number, height: number): Star[] {
  const count = Math.max(48, Math.min(130, Math.round((width * height) / 8500)));
  return Array.from({ length: count }, () => {
    const x = Math.random() * width;
    const y = Math.random() * height;
    return {
      homeX: x,
      homeY: y,
      x,
      y,
      velocityX: 0,
      velocityY: 0,
      radius: 0.7 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 1.25,
      hue: Math.random() > 0.72 ? 190 : 220 + Math.random() * 50,
      opacity: 0.32 + Math.random() * 0.58,
    };
  });
}

export function CelestialBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) return;

    let width = 0;
    let height = 0;
    let pixelRatio = 1;
    let stars: Star[] = [];
    let animationFrame = 0;
    let elapsed = 0;
    let lastFrame = 0;
    let pointerX = -10_000;
    let pointerY = -10_000;
    let reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      stars = makeStars(width, height);
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) {
        pointerX = -10_000;
        pointerY = -10_000;
      } else {
        pointerX = x;
        pointerY = y;
      }
    };

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotionChange = (event: MediaQueryListEvent) => { reducedMotion = event.matches; };

    const drawMoon = () => {
      const x = width * 0.79;
      const y = height * 0.2;
      const radius = Math.min(49, Math.max(33, width * 0.042));
      const distance = Math.hypot(pointerX - x, pointerY - y);
      const near = reducedMotion ? 0 : Math.max(0, 1 - distance / 255);

      const glow = context.createRadialGradient(x, y, radius * 0.35, x, y, radius * (2.7 + near * 1.5));
      glow.addColorStop(0, `rgba(174, 221, 255, ${0.055 + near * 0.13})`);
      glow.addColorStop(0.35, `rgba(138, 170, 231, ${0.035 + near * 0.09})`);
      glow.addColorStop(1, "rgba(128, 150, 220, 0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, radius * (2.7 + near * 1.5), 0, Math.PI * 2);
      context.fill();

      context.save();
      context.shadowColor = `rgba(184, 221, 255, ${0.18 + near * 0.52})`;
      context.shadowBlur = 12 + near * 34;
      const surface = context.createRadialGradient(x - radius * 0.36, y - radius * 0.42, radius * 0.08, x, y, radius * 1.2);
      surface.addColorStop(0, `rgba(237, 246, 255, ${0.75 + near * 0.2})`);
      surface.addColorStop(0.58, `rgba(188, 211, 244, ${0.58 + near * 0.24})`);
      surface.addColorStop(1, `rgba(132, 158, 207, ${0.44 + near * 0.22})`);
      context.fillStyle = surface;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.fillStyle = `rgba(99, 127, 173, ${0.13 + near * 0.08})`;
      context.beginPath();
      context.ellipse(x - radius * 0.28, y - radius * 0.12, radius * 0.16, radius * 0.1, -0.35, 0, Math.PI * 2);
      context.ellipse(x + radius * 0.3, y + radius * 0.29, radius * 0.22, radius * 0.13, 0.28, 0, Math.PI * 2);
      context.ellipse(x + radius * 0.35, y - radius * 0.3, radius * 0.11, radius * 0.08, -0.2, 0, Math.PI * 2);
      context.fill();
    };

    const render = (timestamp: number) => {
      const delta = lastFrame ? Math.min((timestamp - lastFrame) / 16.67, 2) : 1;
      lastFrame = timestamp;
      elapsed += delta;
      context.clearRect(0, 0, width, height);

      for (const star of stars) {
        if (!reducedMotion) {
          const dx = star.x - pointerX;
          const dy = star.y - pointerY;
          const distance = Math.hypot(dx, dy) || 1;
          const influence = Math.max(0, 1 - distance / 112);
          if (influence > 0) {
            const force = influence * influence * 0.58 * delta;
            star.velocityX += (dx / distance) * force;
            star.velocityY += (dy / distance) * force;
          }
          star.velocityX += (star.homeX - star.x) * 0.0018 * delta;
          star.velocityY += (star.homeY - star.y) * 0.0018 * delta;
          star.velocityX *= 0.94;
          star.velocityY *= 0.94;
          star.x += star.velocityX * delta;
          star.y += star.velocityY * delta;
        }

        const twinkle = reducedMotion ? 0.62 : 0.42 + (Math.sin(elapsed * 0.035 * star.speed + star.phase) + 1) * 0.29;
        const alpha = star.opacity * twinkle;
        const haloRadius = star.radius * (4 + twinkle * 2.5);
        const halo = context.createRadialGradient(star.x, star.y, 0, star.x, star.y, haloRadius);
        halo.addColorStop(0, `hsla(${star.hue}, 92%, 89%, ${alpha * 0.72})`);
        halo.addColorStop(0.18, `hsla(${star.hue}, 92%, 78%, ${alpha * 0.2})`);
        halo.addColorStop(1, `hsla(${star.hue}, 92%, 70%, 0)`);
        context.fillStyle = halo;
        context.beginPath();
        context.arc(star.x, star.y, haloRadius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = `rgba(237, 246, 255, ${alpha})`;
        context.beginPath();
        context.arc(star.x, star.y, star.radius * (0.75 + twinkle * 0.35), 0, Math.PI * 2);
        context.fill();
      }

      drawMoon();
      animationFrame = window.requestAnimationFrame(render);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement ?? canvas);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    motionQuery.addEventListener("change", onMotionChange);
    resize();
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      motionQuery.removeEventListener("change", onMotionChange);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  return <div className="celestial-background" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
