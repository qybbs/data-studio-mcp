import { z } from 'zod';

export const GlobalStyleSchema = z.object({
  theme: z.string().optional(),
  canvas_width: z.number().optional(),
  canvas_height: z.number().optional()
});

export const DataSourceFieldDimensionSchema = z.object({
  name: z.string(),
  internal_field_id: z.string(),
  type: z.string(),
  is_calculated_field: z.boolean().optional(),
  scope: z.string().optional(),
  sample_values: z.array(z.string()).optional()
});

export const DataSourceFieldMetricSchema = z.object({
  name: z.string(),
  internal_field_id: z.string(),
  type: z.string(),
  aggregation: z.string().optional(),
  formula: z.string().optional()
});

export const DataSourceSchema = z.object({
  type: z.string(),
  project_id: z.string().optional(),
  dataset: z.string().optional(),
  table_name: z.string().optional(),
  region: z.string().optional(),
  extracted_via: z.string().optional(),
  schema: z.object({
    dimensions: z.array(DataSourceFieldDimensionSchema).optional(),
    metrics: z.array(DataSourceFieldMetricSchema).optional()
  }).optional()
});

export const DimensionConfigSchema = z.object({
  field: z.string(),
  internal_field_id: z.string().optional(),
  data_type: z.string().optional(),
  is_calculated_field: z.boolean().optional(),
  scope: z.string().optional(),
  formula: z.string().optional(),
  internal_formula: z.string().optional()
});

export const MetricConfigSchema = z.object({
  field: z.string(),
  internal_field_id: z.string().optional(),
  aggregation: z.string().optional(),
  formula: z.string().optional(),
  display_format: z.string().optional()
});

export const WidgetStyleSchema = z.object({
  position: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }).optional(),
  font_size: z.number().optional(),
  footer_border_color: z.string().optional(),
  show_title: z.boolean().optional()
}).passthrough();

/**
 * Tipe komponen kanvas resmi Google Looker Studio:
 * - Charts (Table, Scorecard, Time Series, Bars, Pies, Lines, Geo, Gauge, Treemap, dll.)
 * - Controls (Dropdown, Fixed list, Input box, Slider, Checkbox, Date picker, Button, dll.)
 * - Layout (Text box, Image, Shape, Embed URL)
 */
export const WidgetTypeEnum = z.enum([
  // Charts & Visualizations
  'table',
  'table_with_bars',
  'table_with_heatmap',
  'pivot_table',
  'scorecard',
  'scorecard_compact',
  'time_series',
  'sparkline',
  'bar_chart',
  'column_chart',
  'stacked_bar_chart',
  'pie_chart',
  'donut_chart',
  'line_chart',
  'area_chart',
  'stacked_area_chart',
  'scatter_chart',
  'bubble_chart',
  'geo_map',
  'google_map',
  'gauge',
  'treemap',
  'bullet_chart',

  // Controls (Filter & Interactive)
  'dropdown_filter',
  'fixed_list_filter',
  'input_box_filter',
  'advanced_filter',
  'slider_filter',
  'checkbox_filter',
  'date_range_picker',
  'data_control',
  'button',

  // Layout & Static Elements
  'text_box',
  'image',
  'shape',
  'embed_url',

  // Fallback
  'custom'
]);

export const WidgetSchema = z.object({
  widget_id: z.string(),
  title: z.string(),
  type: WidgetTypeEnum,
  alias: z.string().optional(),
  data_source_id: z.string().optional(),
  data_source_name: z.string().optional(),
  date_range_field: z.string().optional(),
  default_date_range: z.string().optional(),
  dimension: DimensionConfigSchema.optional(),
  metric: MetricConfigSchema.optional(),
  dimensions: z.array(DimensionConfigSchema).optional(),
  metrics: z.array(MetricConfigSchema).optional(),
  sort: z.object({
    field: z.string(),
    order: z.enum(['ASC', 'DESC'])
  }).optional(),
  limit: z.number().optional(),
  sql_query: z.string().optional(),
  style: WidgetStyleSchema.optional()
});

export const PageSchema = z.object({
  page_id: z.string(),
  page_number: z.number(),
  title: z.string(),
  description: z.string().optional(),
  widgets: z.array(WidgetSchema)
});

export const DashboardManifestSchema = z.object({
  dashboard_id: z.string(),
  name: z.string(),
  url: z.string().url(),
  global_style: GlobalStyleSchema.optional(),
  data_source: DataSourceSchema.optional(),
  pages: z.array(PageSchema)
});

export type GlobalStyle = z.infer<typeof GlobalStyleSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
export type DimensionConfig = z.infer<typeof DimensionConfigSchema>;
export type MetricConfig = z.infer<typeof MetricConfigSchema>;
export type WidgetStyle = z.infer<typeof WidgetStyleSchema>;
export type WidgetType = z.infer<typeof WidgetTypeEnum>;
export type Widget = z.infer<typeof WidgetSchema>;
export type Page = z.infer<typeof PageSchema>;
export type DashboardManifest = z.infer<typeof DashboardManifestSchema>;
