/**
 * Colores y estilos base de los gráficos (CLI-199). La paleta de series se
 * validó con el skill de dataviz (contraste ≥ 3:1 sobre blanco, separación
 * para daltonismo en pares adyacentes): no cambiar un color sin re-validarla.
 * ECharts dibuja en SVG y no lee variables CSS, por eso van como hex.
 */
export const CHART_COLORS = {
  series1: '#008aa1',
  series2: '#d9731f',
  series3: '#6b5fd3',
  series4: '#d93b3b',
  ink: '#1c1b1f',
  inkMuted: '#5c5550',
  grid: '#ece6da',
  surface: '#ffffff',
} as const;

export const CHART_FONT = "'Source Sans 3', system-ui, sans-serif";

const AXIS_LABEL = { color: CHART_COLORS.inkMuted, fontFamily: CHART_FONT, fontSize: 12 };

/** Eje con líneas finas y recesivas: la grilla nunca compite con las marcas. */
export const AXIS_BASE = {
  axisLine: { lineStyle: { color: CHART_COLORS.grid } },
  axisTick: { show: false },
  axisLabel: AXIS_LABEL,
  splitLine: { lineStyle: { color: CHART_COLORS.grid, width: 1 } },
};

export const TOOLTIP_BASE = {
  backgroundColor: CHART_COLORS.surface,
  borderColor: CHART_COLORS.grid,
  textStyle: { color: CHART_COLORS.ink, fontFamily: CHART_FONT, fontSize: 13 },
  extraCssText: 'box-shadow: 0 4px 12px rgb(0 0 0 / 0.08); border-radius: 8px;',
};

export const VALUE_LABEL = { color: CHART_COLORS.ink, fontFamily: CHART_FONT, fontSize: 12 };
