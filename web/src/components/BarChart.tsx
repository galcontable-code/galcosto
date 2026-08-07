import { useId, useState } from 'react';
import { formatAmount, formatMoney, parseFecha } from '../lib/format';
import type { SerieDiariaPunto } from '../lib/types';

/**
 * Gráfico de barras de facturación diaria, dibujado a mano en SVG.
 * Sin librerías: escala lineal simple, viewBox responsive y tooltip propio.
 */
export function BarChart({
  serie,
  alto = 200,
}: {
  serie: SerieDiariaPunto[];
  alto?: number;
}): JSX.Element {
  const gradId = useId().replace(/:/g, '');
  const [activo, setActivo] = useState<number | null>(null);

  if (serie.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-sm text-slate-400 dark:border-slate-700"
        style={{ height: alto }}
      >
        Todavía no hay facturación en el período.
      </div>
    );
  }

  const ANCHO = 720;
  const PAD_IZQ = 8;
  const PAD_DER = 8;
  const PAD_ARR = 12;
  const PAD_ABA = 22;
  const areaAncho = ANCHO - PAD_IZQ - PAD_DER;
  const areaAlto = alto - PAD_ARR - PAD_ABA;

  const max = Math.max(...serie.map((p) => p.total), 1);
  const paso = areaAncho / serie.length;
  const anchoBarra = Math.max(2, Math.min(38, paso * 0.62));

  // Líneas guía en 0 / 50% / 100% del máximo.
  const guias = [0, 0.5, 1].map((f) => ({
    y: PAD_ARR + areaAlto * (1 - f),
    valor: max * f,
  }));

  // Con muchos días sólo etiquetamos algunos para que no se amontonen.
  const cadaCuantos = Math.ceil(serie.length / 12);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        className="w-full"
        style={{ height: alto }}
        role="img"
        aria-label={`Facturación diaria del período. Máximo diario ${formatMoney(max)}.`}
      >
        <defs>
          <linearGradient id={`g-${gradId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2145e2" />
            <stop offset="100%" stopColor="#3665f5" stopOpacity="0.75" />
          </linearGradient>
        </defs>

        {guias.map((g, i) => (
          <g key={i}>
            <line
              x1={PAD_IZQ}
              y1={g.y}
              x2={ANCHO - PAD_DER}
              y2={g.y}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth={1}
              strokeDasharray={i === 0 ? undefined : '3 4'}
            />
            {i > 0 ? (
              <text
                x={PAD_IZQ + 2}
                y={g.y - 4}
                className="fill-slate-400 text-[10px]"
                style={{ fontSize: 10 }}
              >
                {formatAmount(g.valor)}
              </text>
            ) : null}
          </g>
        ))}

        {serie.map((p, i) => {
          const h = max > 0 ? (p.total / max) * areaAlto : 0;
          const x = PAD_IZQ + paso * i + (paso - anchoBarra) / 2;
          const y = PAD_ARR + areaAlto - h;
          const fecha = parseFecha(p.fecha);
          const etiqueta = fecha ? String(fecha.getDate()) : '';
          return (
            <g key={`${p.fecha}-${i}`}>
              {/* Zona sensible más ancha que la barra, para que sea fácil apuntarle. */}
              <rect
                x={PAD_IZQ + paso * i}
                y={PAD_ARR}
                width={paso}
                height={areaAlto}
                fill="transparent"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo((a) => (a === i ? null : a))}
              />
              <rect
                x={x}
                y={Math.max(y, PAD_ARR)}
                width={anchoBarra}
                height={Math.max(h, p.total > 0 ? 2 : 0)}
                rx={Math.min(3, anchoBarra / 2)}
                fill={`url(#g-${gradId})`}
                opacity={activo === null || activo === i ? 1 : 0.45}
                className="transition-opacity"
              />
              {i % cadaCuantos === 0 ? (
                <text
                  x={PAD_IZQ + paso * i + paso / 2}
                  y={alto - 6}
                  textAnchor="middle"
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  {etiqueta}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {activo !== null && serie[activo] ? (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800"
          style={{ left: `${((activo + 0.5) / serie.length) * 100}%` }}
        >
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {formatMoney(serie[activo].total)}
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            {parseFecha(serie[activo].fecha)?.toLocaleDateString('es-AR', {
              day: '2-digit',
              month: 'short',
            }) ?? serie[activo].fecha}
            {serie[activo].cantidad !== undefined
              ? ` · ${serie[activo].cantidad} cbte.`
              : ''}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Mini barra horizontal para la distribución por tipo de comprobante. */
export function BarraProporcion({
  valor,
  max,
  className,
}: {
  valor: number;
  max: number;
  className?: string;
}): JSX.Element {
  const pct = max > 0 ? Math.max(2, (valor / max) * 100) : 0;
  return (
    <div
      className={`h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800 ${className ?? ''}`}
    >
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
    </div>
  );
}
