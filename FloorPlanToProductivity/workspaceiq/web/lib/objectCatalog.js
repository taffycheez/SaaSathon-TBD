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
  chair: {
    label: "Chair",
    shape_kind: "rect",
    width_percent: 6,
    height_percent: 6,
    tone: "#d8e6f4",
    stroke: "#31526f"
  },
  armchair: {
    label: "Lounge Chair",
    shape_kind: "rect",
    width_percent: 8,
    height_percent: 7,
    tone: "#c7e3d5",
    stroke: "#2b6b53"
  },
  couch: {
    label: "Couch",
    shape_kind: "rect",
    width_percent: 14,
    height_percent: 7,
    tone: "#d7e6cf",
    stroke: "#47684f"
  },
  table: {
    label: "Table",
    shape_kind: "rect",
    width_percent: 10,
    height_percent: 7,
    tone: "#dce6cf",
    stroke: "#5f7152"
  },
  filing_cabinet: {
    label: "File Cabinet",
    shape_kind: "rect",
    width_percent: 8,
    height_percent: 5,
    tone: "#d7dde6",
    stroke: "#516173"
  },
  whiteboard: {
    label: "Whiteboard",
    shape_kind: "rect",
    width_percent: 16,
    height_percent: 5,
    tone: "#f7fbff",
    stroke: "#607587"
  },
  plant: {
    label: "Plant",
    shape_kind: "ellipse",
    width_percent: 5,
    height_percent: 6,
    tone: "#d9f0cf",
    stroke: "#48703d"
  },
  trashcan: {
    label: "Trashcan",
    shape_kind: "ellipse",
    width_percent: 4,
    height_percent: 4,
    tone: "#e3e6ea",
    stroke: "#5b6673"
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
  fridge: {
    label: "Fridge",
    shape_kind: "rect",
    width_percent: 7,
    height_percent: 10,
    tone: "#eef4fb",
    stroke: "#607587"
  },
  kitchenette: {
    label: "Kitchenette",
    shape_kind: "rect",
    width_percent: 14,
    height_percent: 5,
    tone: "#efe5d7",
    stroke: "#8a6f53"
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
  chair: "chair",
  office_chair: "chair",
  task_chair: "chair",
  desk_chair: "chair",
  rolling_chair: "chair",
  visitor_chair: "chair",
  seat: "chair",
  seating: "chair",
  sofa: "couch",
  couch: "couch",
  sofa_chair: "couch",
  lounge_chair: "armchair",
  soft_chair: "armchair",
  filing_cabinet: "filing_cabinet",
  filingcabinet: "filing_cabinet",
  cabinet: "filing_cabinet",
  drawer_unit: "filing_cabinet",
  dry_erase_board: "whiteboard",
  marker_board: "whiteboard",
  board: "whiteboard",
  wall_board: "whiteboard",
  copier: "office_equipment",
  shredder: "office_equipment",
  potted_plant: "plant",
  plant_pot: "plant",
  planter: "plant",
  indoor_plant: "plant",
  pot_plant: "plant",
  tree: "plant",
  trash_can: "trashcan",
  wastebasket: "trashcan",
  recycle_bin: "trashcan",
  bin: "trashcan",
  bathroom_toilet: "toilet",
  bathtub: "shower",
  wash_basin: "sink",
  washbasin: "sink",
  refrigerator: "fridge",
  fridge_freezer: "fridge",
  kitchen: "kitchenette",
  kitchen_counter: "kitchenette",
  kitchenette_counter: "kitchenette",
  counter: "kitchenette",
  benchtop: "kitchenette"
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
  "chair",
  "armchair",
  "couch",
  "meeting_table",
  "table",
  "filing_cabinet",
  "whiteboard",
  "plant",
  "trashcan",
  "fridge",
  "kitchenette",
  "sink"
];
