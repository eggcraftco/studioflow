// What a workspace takes in for repair, service or making depends entirely on
// the trade. A jeweller records Metal and Hallmark; a phone shop records IMEI
// and whether the passcode was handed over.
//
// This catalogue is mirrored verbatim in functions/index.js, EGGcraft (Swift)
// and StudioModels.kt. The field ids are what intake values are stored under,
// so they must never drift between platforms — only the titles are the
// workspace's to rename.

export type RepairIntakePresetField = { id: string; title: string };

export type RepairIntakePreset = {
  id: string;
  label: string;
  fields: RepairIntakePresetField[];
};

export const REPAIR_INTAKE_PRESETS: RepairIntakePreset[] = [
  {
    id: "general",
    label: "General Intake",
    fields: [
      { id: "itemType", title: "Item Type" },
      { id: "brandMaker", title: "Brand / Maker" },
      { id: "model", title: "Model" },
      { id: "serialReference", title: "Serial / Reference" },
      { id: "colour", title: "Colour" },
      { id: "accessories", title: "Accessories Included" }
    ]
  },
  {
    id: "jewellery",
    label: "Jewellery & Goldsmith",
    fields: [
      { id: "itemType", title: "Item Type" },
      { id: "metal", title: "Metal" },
      { id: "hallmark", title: "Hallmark" },
      { id: "itemSize", title: "Size" },
      { id: "stones", title: "Stones" },
      { id: "weight", title: "Weight" },
      { id: "serialReference", title: "Serial / Reference" }
    ]
  },
  {
    id: "watch",
    label: "Watch & Clock",
    fields: [
      { id: "itemType", title: "Item Type" },
      { id: "brandMaker", title: "Brand" },
      { id: "model", title: "Model" },
      { id: "serialReference", title: "Serial / Reference" },
      { id: "caseSize", title: "Case Size" },
      { id: "strap", title: "Bracelet / Strap" },
      { id: "movement", title: "Movement" }
    ]
  },
  {
    id: "electronics",
    label: "Electronics & Devices",
    fields: [
      { id: "itemType", title: "Device Type" },
      { id: "brandMaker", title: "Brand" },
      { id: "model", title: "Model" },
      { id: "serialReference", title: "Serial / IMEI" },
      { id: "passcode", title: "Passcode Provided" },
      { id: "accessories", title: "Accessories Included" },
      { id: "warranty", title: "Warranty Status" }
    ]
  },
  {
    id: "tailoring",
    label: "Tailoring & Alterations",
    fields: [
      { id: "itemType", title: "Garment Type" },
      { id: "fabric", title: "Fabric" },
      { id: "itemSize", title: "Size" },
      { id: "colour", title: "Colour" },
      { id: "measurements", title: "Measurements" },
      { id: "trim", title: "Trim / Buttons" }
    ]
  },
  {
    id: "shoeLeather",
    label: "Shoe & Leather",
    fields: [
      { id: "itemType", title: "Item Type" },
      { id: "brandMaker", title: "Brand" },
      { id: "material", title: "Material" },
      { id: "itemSize", title: "Size" },
      { id: "colour", title: "Colour" },
      { id: "sole", title: "Sole Type" }
    ]
  },
  {
    id: "furniture",
    label: "Furniture & Upholstery",
    fields: [
      { id: "itemType", title: "Item Type" },
      { id: "material", title: "Material" },
      { id: "dimensions", title: "Dimensions" },
      { id: "finish", title: "Finish" },
      { id: "fabric", title: "Fabric" },
      { id: "age", title: "Age / Period" }
    ]
  },
  {
    id: "bicycle",
    label: "Bicycle & E-Bike",
    fields: [
      { id: "itemType", title: "Bike Type" },
      { id: "brandMaker", title: "Brand" },
      { id: "model", title: "Model" },
      { id: "frameNumber", title: "Frame Number" },
      { id: "wheelSize", title: "Wheel Size" },
      { id: "battery", title: "Battery / Motor" }
    ]
  },
  {
    id: "automotive",
    label: "Automotive",
    fields: [
      { id: "itemType", title: "Vehicle Type" },
      { id: "brandMaker", title: "Make" },
      { id: "model", title: "Model" },
      { id: "registration", title: "Registration" },
      { id: "vin", title: "VIN" },
      { id: "mileage", title: "Mileage" }
    ]
  },
  {
    id: "instrument",
    label: "Musical Instruments",
    fields: [
      { id: "itemType", title: "Instrument" },
      { id: "brandMaker", title: "Brand" },
      { id: "model", title: "Model" },
      { id: "serialReference", title: "Serial / Reference" },
      { id: "finish", title: "Finish" },
      { id: "accessories", title: "Case / Accessories" }
    ]
  }
];

// businessType is free text the workspace can edit after onboarding, so the
// exact onboarding labels are matched first and the rest falls back to a keyword
// sweep that also covers the Turkish words a user is likely to type.
const PRESET_BY_BUSINESS_TYPE: Record<string, string> = {
  "jewellery studio": "jewellery",
  "tailor / alteration studio": "tailoring",
  "repair service": "general"
};

const PRESET_KEYWORDS: { presetId: string; terms: string[] }[] = [
  { presetId: "jewellery", terms: ["jewel", "goldsmith", "silversmith", "kuyum", "mucevher", "mücevher", "altin", "altın"] },
  { presetId: "watch", terms: ["watch", "clock", "horolog", "saat"] },
  { presetId: "electronics", terms: ["electronic", "phone", "mobile", "computer", "laptop", "device", "elektronik", "telefon", "bilgisayar"] },
  { presetId: "tailoring", terms: ["tailor", "alteration", "garment", "seamstress", "terzi", "dikis", "dikiş"] },
  { presetId: "shoeLeather", terms: ["shoe", "cobbler", "leather", "ayakkabi", "ayakkabı", "deri", "saraciye"] },
  { presetId: "furniture", terms: ["furniture", "upholster", "carpent", "joinery", "mobilya", "doseme", "döşeme", "marangoz"] },
  { presetId: "bicycle", terms: ["bicycle", "bike", "cycle", "bisiklet"] },
  { presetId: "automotive", terms: ["automotive", "vehicle", "garage", "motor", "car ", "oto", "araba", "arac", "araç"] },
  { presetId: "instrument", terms: ["instrument", "guitar", "piano", "luthier", "muzik", "müzik", "enstruman", "enstrüman"] }
];

export function repairIntakePresetById(presetId: string): RepairIntakePreset | null {
  const wanted = (presetId || "").trim();
  return REPAIR_INTAKE_PRESETS.find(preset => preset.id === wanted) ?? null;
}

export function repairIntakePresetIdForBusinessType(businessType: string | null | undefined) {
  const raw = (businessType || "").trim().toLowerCase();
  if (!raw) return "general";
  const exact = PRESET_BY_BUSINESS_TYPE[raw];
  if (exact) return exact;
  const keyword = PRESET_KEYWORDS.find(entry => entry.terms.some(term => raw.includes(term)));
  return keyword ? keyword.presetId : "general";
}

export function repairIntakeFieldsForBusinessType(businessType: string | null | undefined) {
  const preset = repairIntakePresetById(repairIntakePresetIdForBusinessType(businessType));
  return (preset ?? REPAIR_INTAKE_PRESETS[0]).fields.map(field => ({ ...field }));
}

// Which preset a stored row set came from, by exact id sequence. Used only to
// show the picker's current selection; a renamed title still counts as that
// preset, because ids are what identify a row.
export function matchingRepairIntakePresetId(fields: { id: string }[]) {
  const signature = fields.map(field => field.id).join("|");
  const match = REPAIR_INTAKE_PRESETS.find(
    preset => preset.fields.map(field => field.id).join("|") === signature
  );
  return match ? match.id : "";
}
