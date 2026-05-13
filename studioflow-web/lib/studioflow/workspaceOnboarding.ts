import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

export const WORKSPACE_ONBOARDING_BUSINESS_TYPES = [
  "Custom Art Studio",
  "Freelancer / Designer",
  "Repair Service",
  "Handmade Products",
  "Photography Studio",
  "Tailor / Alteration Studio",
  "Jewellery Studio",
  "Agency / Creative Studio",
  "Food / Bakery / Catering",
  "Beauty / Clinic / Wellness",
  "Consultancy / Professional Service",
  "General Small Business",
  "Other / Prompt Based"
];

type WorkspaceOnboardingPreset = {
  businessType: string;
  customFields: string[];
  customSteps: string[];
  customToggles: string[];
  inventoryLabels: string[];
  activeStatuses: string[];
  summaryStep1: string;
  summaryStep2: string;
  baseCostLabel: string;
  expenseItems: string[];
  remainingItems: string[];
  showMaterials: boolean;
  showShipping: boolean;
  showPriority: boolean;
  showCustomerNotes: boolean;
};

function containsTerm(text: string, ...terms: string[]) {
  return terms.some(term => text.includes(term.toLowerCase()));
}

function headingItems(titles: string[]) {
  return titles
    .map(title => title.trim())
    .filter(Boolean)
    .map((title, index) => ({
      id: `onboarding-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || index}-${index}`,
      title
    }));
}

function titleItemsJSON(titles: string[]) {
  return JSON.stringify(headingItems(titles));
}

function stringListJSON(values: string[]) {
  return JSON.stringify(values.map(value => value.trim()).filter(Boolean));
}

export function workspaceOnboardingPromptSeed(type: string) {
  switch (type) {
    case "Custom Art Studio":
      return "We create custom artwork commissions. We need customer details, design theme, reference images, approval stages, deposit, production stages, final review and shipping.";
    case "Photography Studio":
      return "We manage photo shoots. We need client details, shoot type, location, date, package, booking deposit, selection, editing, delivery and follow-up notes.";
    case "Repair Service":
      return "We repair customer items. We need model, serial number, issue reported, diagnostics, quote approval, parts order, repair, testing and collection or shipping.";
    case "Handmade Products":
      return "We make custom products. We need product type, size, colour, material, customer approval, production, packaging, shipping and balance payment.";
    default:
      return "Describe this business here, including customer information needed, workflow stages, approval steps, materials, shipping, appointments, deposits and delivery.";
  }
}

function onboardingPresetFor(rawText: string): WorkspaceOnboardingPreset {
  const text = rawText.toLowerCase();
  if (containsTerm(text, "photo", "photography", "video", "shoot", "wedding", "retouch", "editing", "gallery", "fotograf", "cekim")) {
    return {
      businessType: "Photography Studio",
      customFields: ["Shoot Type", "Location", "Shoot Date", "Package"],
      customSteps: ["Enquiry", "Booking", "Pre-shoot", "Shooting", "Selection", "Editing", "Delivery"],
      customToggles: ["Deposit Paid?", "Booking Confirmed?", "Shoot Completed?", "Selection Sent?", "Editing Completed?", "Gallery Delivered?"],
      inventoryLabels: ["Location Confirmed", "Equipment Ready", "Assistant Booked", "Gallery Ready"],
      activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Review", "Done", "Cancelled"],
      summaryStep1: "Booking",
      summaryStep2: "Editing",
      baseCostLabel: "Shoot Cost (Base)",
      expenseItems: ["Assistant Cost", "Studio / Location", "Editing Cost", "Travel Cost"],
      remainingItems: ["Shoot Balance", "Extra Edits"],
      showMaterials: true,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "repair", "fix", "diagnostic", "warranty", "device", "service", "tamir", "onarim", "ariza")) {
    return {
      businessType: "Repair Service",
      customFields: ["Item / Device Model", "Serial Number", "Issue Reported", "Warranty Status"],
      customSteps: ["Check-in", "Diagnostics", "Quote Approval", "Parts Order", "Repair", "Testing", "Ready for Pickup"],
      customToggles: ["Item Received?", "Customer Approved Cost?", "Parts Arrived?", "Repair Completed?", "Quality Tested?", "Warranty Note Added?"],
      inventoryLabels: ["Parts Ordered", "Parts Received", "Tools Ready", "Quality Tested"],
      activeStatuses: ["New", "Not Yet", "Waiting Parts", "In Progress", "Testing", "Done", "Cancelled"],
      summaryStep1: "Diagnostics",
      summaryStep2: "Repair",
      baseCostLabel: "Service Cost (Base)",
      expenseItems: ["Parts Cost", "Technician Cost", "Testing Cost"],
      remainingItems: ["Repair Balance", "Parts Reimbursement"],
      showMaterials: true,
      showShipping: true,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "tailor", "alteration", "sewing", "garment", "fabric", "dress", "fitting", "terzi", "tadilat", "dikis")) {
    return {
      businessType: "Tailor / Alteration Studio",
      customFields: ["Garment Type", "Measurements", "Fabric", "Fitting Date"],
      customSteps: ["Consultation", "Measurements", "Pinning", "Cutting", "Sewing", "Fitting", "Final Press"],
      customToggles: ["Measurements Taken?", "Fabric Received?", "Fitting Approved?", "Final Pressed?", "Ready for Collection?"],
      inventoryLabels: ["Fabric Received", "Trim Ready", "Fitting Booked", "Final Pressed"],
      activeStatuses: ["New", "Not Yet", "In Progress", "Fitting", "Ready", "Done", "Cancelled"],
      summaryStep1: "Measurements",
      summaryStep2: "Sewing",
      baseCostLabel: "Labour Cost (Base)",
      expenseItems: ["Fabric Cost", "Trim / Accessories", "Outwork Cost"],
      remainingItems: ["Final Fitting Balance"],
      showMaterials: true,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "jewellery", "jewelry", "ring", "necklace", "stone", "diamond", "gold", "silver", "mucevher", "taki")) {
    return {
      businessType: "Jewellery Studio",
      customFields: ["Metal Type", "Size", "Stone / Setting", "Design Reference"],
      customSteps: ["Consultation", "Design", "CAD / Mockup", "Casting", "Stone Setting", "Polishing", "Final Check"],
      customToggles: ["Deposit Paid?", "Design Approved?", "Metal Sourced?", "Stones Arrived?", "Hallmarked?", "Box Ready?"],
      inventoryLabels: ["Metal Sourced", "Stones Ready", "Hallmark Done", "Box Ready"],
      activeStatuses: ["New", "Not Yet", "Design", "In Progress", "Final Review", "Done", "Cancelled"],
      summaryStep1: "Design",
      summaryStep2: "Stone Setting",
      baseCostLabel: "Workshop Cost (Base)",
      expenseItems: ["Metal Cost", "Stone Cost", "Casting Cost", "Hallmark Cost"],
      remainingItems: ["Final Jewellery Balance"],
      showMaterials: true,
      showShipping: true,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "food", "bakery", "cake", "catering", "restaurant", "allergy", "yemek", "firin", "pasta")) {
    return {
      businessType: "Food / Bakery / Catering",
      customFields: ["Event Type", "Guest Count", "Dietary Notes", "Delivery Time"],
      customSteps: ["Enquiry", "Quote", "Deposit", "Menu Approval", "Preparation", "Packaging", "Delivery"],
      customToggles: ["Deposit Paid?", "Menu Approved?", "Ingredients Ordered?", "Prep Completed?", "Packed?", "Delivered?"],
      inventoryLabels: ["Ingredients Ready", "Packaging Ready", "Kitchen Slot", "Delivery Ready"],
      activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Ready", "Done", "Cancelled"],
      summaryStep1: "Menu Approval",
      summaryStep2: "Preparation",
      baseCostLabel: "Order Cost (Base)",
      expenseItems: ["Ingredient Cost", "Kitchen / Prep Cost", "Packaging Cost", "Delivery Prep"],
      remainingItems: ["Event Balance"],
      showMaterials: true,
      showShipping: true,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "beauty", "clinic", "wellness", "salon", "treatment", "therapy", "appointment", "guzellik", "klinik")) {
    return {
      businessType: "Beauty / Clinic / Wellness",
      customFields: ["Treatment Type", "Appointment Date", "Client Notes", "Follow-up"],
      customSteps: ["Enquiry", "Consultation", "Booking", "Preparation", "Appointment", "Aftercare", "Follow-up"],
      customToggles: ["Consultation Done?", "Deposit Paid?", "Consent Form?", "Appointment Completed?", "Aftercare Sent?", "Follow-up Booked?"],
      inventoryLabels: ["Room Ready", "Equipment Ready", "Products Ready", "Aftercare Ready"],
      activeStatuses: ["New", "Not Yet", "Booked", "In Progress", "Follow-up", "Done", "Cancelled"],
      summaryStep1: "Booking",
      summaryStep2: "Appointment",
      baseCostLabel: "Treatment Cost (Base)",
      expenseItems: ["Product Cost", "Room / Equipment", "Practitioner Cost"],
      remainingItems: ["Treatment Balance", "Follow-up Payment"],
      showMaterials: true,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  if (containsTerm(text, "designer", "freelancer", "agency", "creative", "consult", "branding", "website", "marketing", "tasarim", "ajans")) {
    return {
      businessType: "Agency / Creative Studio",
      customFields: ["Project Type", "Brief", "Deadline", "Revision Limit"],
      customSteps: ["Enquiry", "Brief", "Quote", "Deposit", "Draft", "Revision", "Delivery"],
      customToggles: ["Brief Received?", "Deposit Paid?", "Draft Sent?", "Revision Approved?", "Final Files Sent?"],
      inventoryLabels: ["Brief Ready", "Assets Received", "Draft Sent", "Final Delivered"],
      activeStatuses: ["New", "Not Yet", "In Progress", "Review", "Done", "Cancelled"],
      summaryStep1: "Draft",
      summaryStep2: "Revision",
      baseCostLabel: "Project Cost (Base)",
      expenseItems: ["Freelancer Cost", "Software / Tools", "Asset Purchase"],
      remainingItems: ["Project Balance", "Extra Revision Fee"],
      showMaterials: false,
      showShipping: false,
      showPriority: true,
      showCustomerNotes: true
    };
  }
  return {
    businessType: "General Small Business",
    customFields: ["Design Theme", "Size / Model", "Special Request"],
    customSteps: ["Enquiry", "Concept", "Mockup", "Client Approval", "Production", "Final Review", "Delivery"],
    customToggles: ["Deposit Paid?", "Reference Received?", "Mockup Approved?", "Production Completed?", "Final Photos Sent?", "Ready to Ship?"],
    inventoryLabels: ["Materials Ready", "Item Received", "Packaging Ready", "Final Checked"],
    activeStatuses: ["New", "Not Yet", "In Progress", "Review", "Done", "Cancelled"],
    summaryStep1: "Concept",
    summaryStep2: "Production",
    baseCostLabel: "Cost (Base)",
    expenseItems: ["Material Cost", "Supplier Cost", "Packaging Cost"],
    remainingItems: ["Remaining Balance"],
    showMaterials: true,
    showShipping: true,
    showPriority: true,
    showCustomerNotes: true
  };
}

function onboardingPayload(
  businessType: string,
  prompt: string,
  smart: boolean,
  action: "smart" | "standard",
  userId: string
) {
  const storedPrompt = prompt.trim() || workspaceOnboardingPromptSeed(businessType);
  const preset = onboardingPresetFor(smart ? `${businessType}\n${storedPrompt}` : businessType);
  const labels = preset.inventoryLabels.length ? preset.inventoryLabels : ["Material Check 1"];
  const paddedLabels = [...labels, "Item", "Item", "Item", "Item"];

  return {
    businessType,
    businessDescriptionPrompt: storedPrompt,
    activeStatusesJSON: stringListJSON(preset.activeStatuses),
    customFieldsJSON: titleItemsJSON(preset.customFields),
    customTogglesJSON: titleItemsJSON(preset.customToggles),
    customStepsJSON: titleItemsJSON(preset.customSteps),
    financialExpenseItemsJSON: titleItemsJSON(preset.expenseItems),
    financialRemainingItemsJSON: titleItemsJSON(preset.remainingItems),
    financialShowBaseCost: true,
    financialBaseCostLabel: preset.baseCostLabel,
    summaryStep1: preset.summaryStep1,
    summaryStep2: preset.summaryStep2,
    orderListStep1: preset.summaryStep1,
    orderListStep2: preset.summaryStep2,
    invLabel1: paddedLabels[0],
    invLabel2: paddedLabels[1],
    invLabel3: paddedLabels[2],
    invLabel4: paddedLabels[3],
    materialsDefaultChecksJSON: titleItemsJSON(labels),
    showCardCustomerNotes: preset.showCustomerNotes,
    showCardPreview: true,
    showCardSummary: true,
    showCardCustomer: true,
    showCardDelivery: true,
    showCardCommunication: true,
    showCardNotes: true,
    showCardFinancial: true,
    showCardStatus: true,
    showCardMaterials: preset.showMaterials,
    showCardShipping: preset.showShipping,
    showCardPriority: preset.showPriority,
    businessTemplateAppliedAt: serverTimestamp(),
    businessOnboardingCompletedAt: serverTimestamp(),
    businessOnboardingCompletedAction: action,
    businessOnboardingCompletedBy: userId
  };
}

export async function saveWorkspaceOnboardingTemplate(
  companyId: string,
  userId: string,
  businessType: string,
  prompt: string,
  smart: boolean
) {
  await withWebSyncStatus(
    () => setDoc(
      doc(db, "companySettings", companyId),
      onboardingPayload(businessType, prompt, smart, smart ? "smart" : "standard", userId),
      { merge: true }
    ),
    "Saving workspace setup to cloud."
  );
}

export async function saveWorkspaceOnboardingSkip(companyId: string, userId: string) {
  await withWebSyncStatus(
    () => setDoc(doc(db, "companySettings", companyId), {
      businessOnboardingCompletedAt: serverTimestamp(),
      businessOnboardingCompletedAction: "skip",
      businessOnboardingCompletedBy: userId
    }, { merge: true }),
    "Saving workspace setup choice."
  );
}
