export type WallSegment = {
  x1_percent: number;
  y1_percent: number;
  x2_percent: number;
  y2_percent: number;
};

export type EdgeItem = {
  wall_index: number;
  position_percent: number;
};

export type FurnitureItem = {
  type: string;
  shape_kind: "rect" | "ellipse" | "polygon";
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  rotation_deg: number;
  footprint_points?: Array<{ x_percent: number; y_percent: number }>;
};

export type RoomAnalysis = {
  estimated_width_m: number;
  estimated_height_m: number;
  walls: WallSegment[];
  windows: EdgeItem[];
  doors: EdgeItem[];
  furniture: FurnitureItem[];
  notes?: string[];
  fallback?: boolean;
};

export type LayoutResult = {
  desks: FurnitureItem[];
  notes?: string[];
  fallback?: boolean;
};
