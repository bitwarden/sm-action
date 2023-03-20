import { SecretInput } from "./parser";

const ENV_NAME_REGEX = /^[a-zA-Z_]+[a-zA-Z0-9_]*$/;

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isValidUrl(url: string): boolean {
  try {
    const tempUrl = new URL(url);
    if (tempUrl.protocol === "https:") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function isValidEnvName(name: string): boolean {
  return ENV_NAME_REGEX.test(name);
}

export function isValidGuid(value: string): boolean {
  return GUID_REGEX.test(value);
}

export function isUniqueEnvNames(secretInputs: SecretInput[]): boolean {
  const envNames = [...new Set(secretInputs.map((s) => s.outputEnvName))];
  return envNames.length === secretInputs.length;
}
