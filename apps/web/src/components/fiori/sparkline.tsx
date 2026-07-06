'use client';

import { useEffect, useRef } from 'react';

/** Area-Sparkline auf Canvas mit betontem Endpunkt. Themebewusst (liest CSS-Variablen). */
export function Sparkline({
  data,
  colorVar = '--teal',
  className,
}: {
  data: number[];
  colorVar?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c || data.length < 2) return;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth;
      const h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const css = (v: string) =>
        getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#0a8f8a';
      const color = css(colorVar);
      const surface = css('--surface');
      const mn = Math.min(...data);
      const mx = Math.max(...data);
      const pad = 6;
      const X = (i: number) => pad + (i * (w - 2 * pad)) / (data.length - 1);
      const Y = (v: number) => h - pad - ((v - mn) / (mx - mn || 1)) * (h - 2 * pad);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, color + '55');
      grad.addColorStop(1, color + '00');
      ctx.beginPath();
      ctx.moveTo(X(0), Y(data[0]!));
      data.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
      ctx.lineTo(X(data.length - 1), h - pad);
      ctx.lineTo(X(0), h - pad);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(X(0), Y(data[0]!));
      data.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(X(data.length - 1), Y(data[data.length - 1]!), 3.2, 0, 7);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = surface;
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    draw();
    window.addEventListener('resize', draw);
    const obs = new MutationObserver(draw);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      window.removeEventListener('resize', draw);
      obs.disconnect();
    };
  }, [data, colorVar]);

  return <canvas ref={ref} className={className} />;
}
