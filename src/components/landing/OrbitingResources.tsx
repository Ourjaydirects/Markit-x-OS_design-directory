import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { getFaviconUrl } from '@/lib/favicon';
import { OrbitIcon } from './OrbitIcon';
import {
  RING_CONFIGS,
  BASE_CONTAINER_SIZE,
  RESPONSIVE_BREAKPOINTS,
  RESPONSIVE_SCALES,
  distributeResources,
} from './orbit-config';
import type { NormalizedResource } from '@/types/resource';

/* ─── Mark-it monogram placeholder ─── */

function BrandMonogram({ size }: { size: number }) {
  return (
    <div
      aria-hidden="true"
      className="font-notable text-brand-vanilla leading-none select-none"
      style={{ fontSize: Math.round(size * 0.72) }}
    >
      M
    </div>
  );
}

/* ─── Props ─── */

interface OrbitingResourcesProps {
  resources: NormalizedResource[];
}

/* ─── Main Component ─── */

export function OrbitingResources({ resources }: OrbitingResourcesProps) {
  const prefersReducedMotion = useReducedMotion();
  const [scale, setScale] = useState(1);
  const animationRef = useRef(0);
  const timeRef = useRef(0);
  const iconRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Distribute resources across rings
  const iconConfigs = useMemo(
    () => distributeResources(resources),
    [resources],
  );

  // Responsive scale
  const updateScale = useCallback(() => {
    const w = window.innerWidth;
    if (w < RESPONSIVE_BREAKPOINTS.sm) setScale(RESPONSIVE_SCALES.sm);
    else if (w < RESPONSIVE_BREAKPOINTS.lg) setScale(RESPONSIVE_SCALES.md);
    else setScale(RESPONSIVE_SCALES.lg);
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  // Preload favicons
  useEffect(() => {
    iconConfigs.forEach(({ resource }) => {
      const url = getFaviconUrl(resource.url, 'sm');
      if (url) {
        const img = new Image();
        img.src = url;
      }
    });
  }, [iconConfigs]);

  // Place icons at static positions (used for reduced motion & initial frame)
  const placeIcons = useCallback(
    (time: number) => {
      let idx = 0;
      for (const ring of RING_CONFIGS) {
        const r = ring.radius * scale;
        for (let i = 0; i < ring.count; i++) {
          const phase = (2 * Math.PI * i) / ring.count;
          const angle = time * ring.speed + phase;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          const el = iconRefs.current[idx];
          if (el) el.style.transform = `translate(${x}px, ${y}px)`;
          idx++;
        }
      }
    },
    [scale],
  );

  // Animation loop
  useEffect(() => {
    if (prefersReducedMotion) {
      placeIcons(0);
      return;
    }

    let last = 0;

    const tick = (ts: number) => {
      if (!last) last = ts;
      const dt = (ts - last) / 1000;
      last = ts;
      timeRef.current += dt;
      placeIcons(timeRef.current);
      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [prefersReducedMotion, placeIcons]);

  const containerSize = BASE_CONTAINER_SIZE * scale;
  const center = containerSize / 2;

  return (
    <div
      className="relative"
      style={{ width: containerSize, height: containerSize }}
      role="img"
      aria-label="Top design resources orbiting around the Mark-it monogram"
    >
      {/* Ring paths + glow */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${containerSize} ${containerSize}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          {RING_CONFIGS.map((ring, i) => (
            <radialGradient
              key={i}
              id={`ring-glow-${i}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop
                offset="0%"
                stopColor={ring.glowColor}
                stopOpacity={ring.strokeOpacity * 0.6}
              />
              <stop
                offset="100%"
                stopColor={ring.glowColor}
                stopOpacity={0}
              />
            </radialGradient>
          ))}
        </defs>

        {RING_CONFIGS.map((ring, i) => {
          const r = ring.radius * scale;
          return (
            <g key={i}>
              {/* Ambient glow disc */}
              <circle
                cx={center}
                cy={center}
                r={r + 12 * scale}
                fill={`url(#ring-glow-${i})`}
                opacity={0.5}
              />
              {/* Ring stroke */}
              <circle
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={ring.glowColor}
                strokeWidth={1.5}
                strokeOpacity={ring.strokeOpacity * 0.7}
                strokeDasharray="6 6"
                shapeRendering="geometricPrecision"
              />
            </g>
          );
        })}
      </svg>

      {/* Center glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="rounded-full"
          style={{
            width: 100 * scale,
            height: 100 * scale,
            background:
              'radial-gradient(circle, rgba(254,81,2,0.12) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Center logo */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <BrandMonogram size={Math.round(60 * scale)} />
      </div>

      {/* Orbiting icons */}
      {iconConfigs.map((config, i) => (
        <OrbitIcon
          key={config.resource.id ?? config.resource.name}
          ref={(el) => {
            iconRefs.current[i] = el;
          }}
          resource={config.resource}
          size={Math.round(config.size * scale)}
          ringGlowColor={RING_CONFIGS[config.ring].glowColor}
        />
      ))}
    </div>
  );
}
