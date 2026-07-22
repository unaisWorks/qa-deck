// Hand-maintained — lets a value typed once (e.g. Project Name on card A2)
// sync across any OTHER card whose declared variable token is recognized as
// the same underlying concept. Only fires for declared variables[], never
// raw undeclared {{TOKEN}}s, so the blast radius is entirely author-
// controlled: a card author who doesn't want a field globally synced simply
// doesn't name its token one of these patterns.
export type GlobalVariableKey =
  | "projectName" | "environment" | "baseUrl" | "defaultBrowser" | "device"
  | "operatingSystem" | "releaseVersion" | "company" | "apiVersion" | "role";

export const GLOBAL_VARIABLE_LABELS: Record<GlobalVariableKey, string> = {
  projectName: "Project Name",
  environment: "Environment",
  baseUrl: "Base URL",
  defaultBrowser: "Default Browser",
  device: "Device",
  operatingSystem: "Operating System",
  releaseVersion: "Release Version",
  company: "Company",
  apiVersion: "API Version",
  role: "Role",
};

export const GLOBAL_VARIABLE_ORDER: readonly GlobalVariableKey[] = [
  "projectName", "company", "environment", "baseUrl", "apiVersion",
  "defaultBrowser", "device", "operatingSystem", "releaseVersion", "role",
];

// Token-name patterns matched case-insensitively, spaces/hyphens normalized
// to underscores — "Project Name" and "PROJECT_NAME" both match.
const GLOBAL_VARIABLE_ALIASES: Record<GlobalVariableKey, string[]> = {
  projectName: ["PROJECT_NAME", "PROJECT"],
  environment: ["ENVIRONMENT", "ENV", "TEST_ENVIRONMENT", "TARGET_ENVIRONMENT"],
  baseUrl: ["BASE_URL", "API_HOST", "HOST", "TARGET_URL", "API_BASE_URL"],
  defaultBrowser: ["BROWSER", "DEFAULT_BROWSER", "TARGET_BROWSER"],
  device: ["DEVICE", "TARGET_DEVICE"],
  operatingSystem: ["OS", "OPERATING_SYSTEM", "PLATFORM_OS"],
  releaseVersion: ["RELEASE", "RELEASE_VERSION", "VERSION"],
  company: ["COMPANY", "COMPANY_NAME", "ORGANIZATION"],
  apiVersion: ["API_VERSION"],
  role: ["ROLE", "USER_ROLE"],
};

function normalizeToken(token: string): string {
  return token.trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function matchGlobalKey(token: string): GlobalVariableKey | null {
  const normalized = normalizeToken(token);
  for (const key of GLOBAL_VARIABLE_ORDER) {
    if (GLOBAL_VARIABLE_ALIASES[key].includes(normalized)) return key;
  }
  return null;
}
