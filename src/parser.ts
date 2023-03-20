import { isUniqueEnvNames, isValidEnvName, isValidGuid } from "./validators";

export class SecretInput {
  constructor(public id: string, public outputEnvName: string) {}
}

export function parseSecretInput(secrets: string[]): SecretInput[] {
  const results = secrets.map((secret) => {
    try {
      let [id, envName] = secret.split(">", 2);
      id = id.trim();
      envName = envName.trim();
      if (isValidGuid(id) && isValidEnvName(envName)) {
        return new SecretInput(id, envName);
      } else {
        throw TypeError();
      }
    } catch {
      throw TypeError(`Error occurred when attempting to parse ${secret}`);
    }
  });
  if (!isUniqueEnvNames(results)) {
    throw TypeError("Environmental variable names provided are not unique, names must be unique");
  }
  return results;
}
