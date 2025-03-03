import { isUniqueEnvNames, isValidEnvName, isValidGuid } from "./validators";

export class SecretInput {
  constructor(
    public id: string,
    public outputEnvName: string,
  ) {}
}

export class SecretInputParsed {
  constructor(public id: string) {}
}

class ParsingError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export function parseSecretInput(secrets: string[]): SecretInput[] {
  const results = secrets.map((secret) => {
    try {
      if (secret.indexOf(">") === -1) {
        throw new ParsingError(`Expected format: <secretGuid> > <environmentVariableName>`);
      }
      let [id, envName] = secret.split(">", 2);
      id = id.trim();
      envName = envName.trim();

      if (!isValidGuid(id)) {
        throw new ParsingError(`Id is not a valid GUID`);
      }

      if (!isValidEnvName(envName)) {
        throw new ParsingError(`Environment variable name is not valid`);
      }

      return new SecretInput(id, envName);
    } catch (e: unknown) {
      const message = `Error occurred when attempting to parse ${secret}`;
      if (e instanceof ParsingError) {
        throw TypeError(`${message}. ${e.message}`);
      }
      throw TypeError(message);
    }
  });
  if (!isUniqueEnvNames(results)) {
    throw TypeError("Environmental variable names provided are not unique, names must be unique");
  }
  return results;
}

export function parseSecretParsedInput(secrets: string[]): SecretInputParsed[] {
  return secrets.map((id) => {
    try {
      if (!isValidGuid(id)) {
        throw new ParsingError(`Id is not a valid GUID`);
      }
      return new SecretInputParsed(id);
    } catch (e: unknown) {
      const message = `Error occurred when attempting to parse ${id}`;
      if (e instanceof ParsingError) {
        throw TypeError(`${message}. ${e.message}`);
      }
      throw TypeError(message);
    }
  });
}
