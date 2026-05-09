const OBJECT_TYPES = {
  desk: {
    label: "Desk",
    shape_kind: "rect",
    width_percent: 10,
    height_percent: 6
  },
  l_shaped_desk: {
    label: "L Desk",
    shape_kind: "polygon",
    width_percent: 12,
    height_percent: 8,
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
    seat_count: 6
  },
  armchair: {
    label: "Armchair",
    shape_kind: "rect",
    width_percent: 7,
    height_percent: 7
  },
  table: {
    label: "Table",
    shape_kind: "rect",
    width_percent: 10,
    height_percent: 7
  },
  filing_cabinet: {
    label: "File Cabinet",
    shape_kind: "rect",
    width_percent: 8,
    height_percent: 5
  },
  whiteboard: {
    label: "Whiteboard",
    shape_kind: "rect",
    width_percent: 14,
    height_percent: 4
  },
  plant: {
    label: "Plant",
    shape_kind: "ellipse",
    width_percent: 4,
    height_percent: 4
  },
  trashcan: {
    label: "Trashcan",
    shape_kind: "ellipse",
    width_percent: 4,
    height_percent: 4
  },
  office_equipment: {
    label: "Equipment",
    shape_kind: "rect",
    width_percent: 6,
    height_percent: 4
  },
  toilet: {
    label: "Toilet",
    shape_kind: "ellipse",
    width_percent: 5,
    height_percent: 7
  },
  sink: {
    label: "Sink",
    shape_kind: "rect",
    width_percent: 6,
    height_percent: 4
  },
  shower: {
    label: "Shower",
    shape_kind: "rect",
    width_percent: 8,
    height_percent: 8
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
  chair: "armchair",
  office_chair: "armchair",
  task_chair: "armchair",
  seat: "armchair",
  seating: "armchair",
  filing_cabinet: "filing_cabinet",
  filingcabinet: "filing_cabinet",
  cabinet: "filing_cabinet",
  drawer_unit: "filing_cabinet",
  dry_erase_board: "whiteboard",
  marker_board: "whiteboard",
  board: "whiteboard",
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
