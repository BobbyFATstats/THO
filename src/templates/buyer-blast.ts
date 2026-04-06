import { getCustomValues } from "@/lib/ghl";

const TEMPLATE_IDS = {
  en: "bA7zsDQqgm4zhuv6ts5g",
  es: "73ObSJKCwvgSPxNIRNA7",
} as const;

type TemplateData = {
  contact: { first_name: string };
  opportunity: Record<string, string>;
};

let cachedTemplates: { en: string; es: string } | null = null;

/**
 * Fetches both SMS templates from GHL Custom Values.
 * Caches for the lifetime of the process (one Trigger.dev task run).
 */
export async function fetchTemplates(): Promise<{ en: string; es: string }> {
  if (cachedTemplates) return cachedTemplates;

  const customValues = await getCustomValues();

  const enValue = customValues.find((v) => v.id === TEMPLATE_IDS.en);
  const esValue = customValues.find((v) => v.id === TEMPLATE_IDS.es);

  if (!enValue?.value) throw new Error("English buyer blast template not found in GHL Custom Values");
  if (!esValue?.value) throw new Error("Spanish buyer blast template not found in GHL Custom Values");

  cachedTemplates = {
    en: enValue.value.replace(/\\n/g, "\n"),
    es: esValue.value.replace(/\\n/g, "\n"),
  };
  return cachedTemplates;
}

/**
 * Interpolates a template with deal and contact data.
 * Replaces {{contact.first_name}}, {{opportunity.city}}, etc.
 */
export function interpolateTemplate(
  template: string,
  data: TemplateData
): string {
  return template.replace(/\{\{(\w+)\.(\w+)\}\}/g, (match, namespace, field) => {
    if (namespace === "contact") {
      const value = data.contact[field as keyof typeof data.contact];
      return value ?? match;
    }
    if (namespace === "opportunity") {
      const value = data.opportunity[field];
      return value ?? match;
    }
    return match;
  });
}

/**
 * Builds the final SMS message for a buyer.
 */
export async function buildMessage(
  language: "en" | "es",
  contactFirstName: string,
  dealData: Record<string, string>
): Promise<string> {
  const templates = await fetchTemplates();
  const template = language === "es" ? templates.es : templates.en;

  return interpolateTemplate(template, {
    contact: { first_name: contactFirstName || "there" },
    opportunity: dealData,
  });
}
