export const OBJECT_TYPES = {
  desk: {
    label: "Desk",
    shape_kind: "rect",
    width_percent: 10,
    height_percent: 6,
    tone: "#8ec5ff",
    stroke: "#0f4c81"
  },
  l_shaped_desk: {
    label: "L Desk",
    shape_kind: "polygon",
    width_percent: 12,
    height_percent: 8,
    tone: "#9fd0ff",
    stroke: "#0f4c81",
    footprint_points: [
      { x_percent: -50, y_percent: -50 },
      { x_percent: 12, y_percent: -50 },
      { x_percent: 12, y_percent: -12 },
      { x_percent: 50, y_percent: -12 },
      { x_percent: 50, y_percent: 50 },
      { x_percent: -50, y_percent: 50 }
    ]
  },
  meeting_table: {
    label: "Meeting Table",
    shape_kind: "ellipse",
    width_percent: 16,
    height_percent: 10,
    seat_count: 6,
    tone: "#d9d2c3",
    stroke: "#786047"
  },
  armchair: {
    label: "Armchair",
    shape_kind: "rect",
    width_percent: 7,
    height_percent: 7,
    tone: "#c7e3d5",
    stroke: "#2b6b53"
  },
  table: {
    label: "Table",
    shape_kind: "rect",
    width_percent: 10,
    height_percent: 7,
    tone: "#dce6cf",
    stroke: "#5f7152"
  },
  plant: {
    label: "Plant",
    shape_kind: "ellipse",
    width_percent: 4,
    height_percent: 4,
    tone: "#d9f0cf",
    stroke: "#48703d"
  },
  office_equipment: {
    label: "Equipment",
    shape_kind: "rect",
    width_percent: 6,
    height_percent: 4,
    tone: "#eaded2",
    stroke: "#8b6e56"
  },
  toilet: {
    label: "Toilet",
    shape_kind: "ellipse",
    width_percent: 5,
    height_percent: 7,
    tone: "#edf3f7",
    stroke: "#6b8596"
  },
  sink: {
    label: "Sink",
    shape_kind: "rect",
    width_percent: 6,
    height_percent: 4,
    tone: "#d7ebf3",
    stroke: "#5c879a"
  },
  shower: {
    label: "Shower",
    shape_kind: "rect",
    width_percent: 8,
    height_percent: 8,
    tone: "#dceaf2",
    stroke: "#5b8293"
  }
};

const OBJECT_ALIASES = {
  workstation: "desk",
  workstation_desk: "desk",
  office_desk: "desk",
  ldesk: "l_shaped_desk",
  l_desk: "l_shaped_desk",
  conference_table: "meeting_table",
  meeting_desk: "meeting_table",
  sofa_chair: "armchair",
  lounge_chair: "armchair",
  copier: "office_equipment",
  shredder: "office_equipment",
  potted_plant: "plant",
  plant_pot: "plant",
  bathroom_toilet: "toilet",
  bathtub: "shower",
  wash_basin: "sink",
  washbasin: "sink"
};

export function canonicalizeObjectType(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : "";
  if (OBJECT_TYPES[normalized]) {
    return normalized;
  }
  if (OBJECT_ALIASES[normalized]) {
    return OBJECT_ALIASES[normalized];
  }
  return "desk";
}

export function getObjectDefinition(type) {
  return OBJECT_TYPES[canonicalizeObjectType(type)];
}

export function isDeskType(type) {
  const canonical = canonicalizeObjectType(type);
  return canonical === "desk" || canonical === "l_shaped_desk";
}

export const OBJECT_PALETTE = [
  "desk",
  "l_shaped_desk",
  "meeting_table",
  "armchair",
  "table",
  "plant",
  "office_equipment",
  "toilet",
  "sink",
  "shower"
];
