import * as core from "@actions/core";
import { BitwardenClient, ClientSettings, DeviceType, LogLevel } from "@bitwarden/sdk-napi";
import { SecretInput, SecretInputParsed, parseSecretInput, parseSecretParsedInput } from "./parser";
import { isValidUrl } from "./validators";
import * as yaml from "js-yaml";

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    core.info("Validating bitwarden/sm-action inputs...");
    const inputs = readInputs();

    if (inputs.parseYaml || inputs.parseJson) {
      await multiParse(inputs);
    } else {
      await normalParse(inputs);
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

type Inputs = {
  accessToken: string;
  secrets: string[];
  identityUrl: string;
  apiUrl: string;
  parseYaml: boolean;
  parseJson: boolean;
  transformKeys: boolean;
};

function readInputs(): Inputs {
  const accessToken: string = core.getInput("access_token", {
    required: true,
  });
  const secrets: string[] = core.getMultilineInput("secrets", {
    required: true,
  });
  const cloudRegion: string = core.getInput("cloud_region");
  const baseUrl: string = core.getInput("base_url");
  let identityUrl: string = core.getInput("identity_url");
  let apiUrl: string = core.getInput("api_url");

  const parseYamlInput = core.getInput("parse_yaml");
  const parseJsonInput = core.getInput("parse_json");
  const transformKeysInput = core.getInput("transform_keys");

  const parseYaml = parseYamlInput === "" ? false : core.getBooleanInput("parse_yaml");
  const parseJson = parseJsonInput === "" ? false : core.getBooleanInput("parse_json");
  const transformKeys = transformKeysInput === "" ? true : core.getBooleanInput("transform_keys");

  if (parseYaml && parseJson) {
    throw new TypeError("parse_yaml and parse_json cannot both be set to true");
  }

  let customUrls = false;
  //Check if only identityUrl is set and not apiUrl: if so throw an error, otherwise mark this as the user is using customUrls
  if (identityUrl || apiUrl) {
    //If either are set, make sure both are.
    if (!identityUrl || !apiUrl) {
      throw TypeError("if using custom Urls, both identity_url and api_url need to be set.");
    }
    customUrls = true;
  }
  const selfHosted = baseUrl || customUrls;
  if (selfHosted) {
    if (baseUrl && customUrls) {
      core.warning(
        "both base_url and api_url/identity_url are set, " +
          "but only one of the two options should be set. In this case, base_url is used.",
      );
    }
    if (baseUrl) {
      if (!isValidUrl(baseUrl)) {
        throw TypeError("input provided for base_url not in expected format");
      }
      identityUrl = baseUrl + "/identity";
      apiUrl = baseUrl + "/api";
    }
  } else {
    //Bw hosted, allows users to set cloudRegion, by default this value is "us"
    let cloudBaseUrl: string;
    switch (cloudRegion) {
      case "us":
        cloudBaseUrl = "bitwarden.com";
        break;
      case "eu":
        cloudBaseUrl = "bitwarden.eu";
        break;
      default:
        throw new TypeError("input provided for cloud_region is not in the expected format");
    }

    identityUrl = `https://identity.${cloudBaseUrl}`;
    apiUrl = `https://api.${cloudBaseUrl}`;
  }

  if (!isValidUrl(identityUrl)) {
    throw TypeError("input provided for identity_url not in expected format");
  }
  if (!isValidUrl(apiUrl)) {
    throw TypeError("input provided for api_url not in expected format");
  }

  return {
    accessToken,
    secrets,
    identityUrl,
    apiUrl,
    parseYaml,
    parseJson,
    transformKeys,
  };
}

async function getBitwardenClient(inputs: Inputs): Promise<BitwardenClient> {
  const settings: ClientSettings = {
    apiUrl: inputs.apiUrl,
    identityUrl: inputs.identityUrl,
    userAgent: "bitwarden/sm-action",
    deviceType: DeviceType.SDK,
  };

  const client = new BitwardenClient(settings, LogLevel.Info);
  const result = await client.loginWithAccessToken(inputs.accessToken);
  if (!result.success) {
    throw Error(`Authentication with Bitwarden failed.\nError: ${result.errorMessage}`);
  }

  return client;
}

async function normalParse(inputs: Inputs) {
  core.info("Parsing secrets input");
  const secretInputs = parseSecretInput(inputs.secrets);

  core.info("Authenticating to Bitwarden");
  const client = await getBitwardenClient(inputs);

  core.info("Setting Secrets");
  const secretIds = secretInputs.map((secretInput: SecretInput) => secretInput.id);
  const secretResponse = await client.secrets().getByIds(secretIds);
  if (secretResponse.success && secretResponse.data) {
    const secrets = secretResponse.data.data;
    secrets.forEach((secret) => {
      const secretInput = secretInputs.find((secretInput) => secretInput.id === secret.id);
      if (secretInput) {
        core.setSecret(secret.value);
        core.exportVariable(secretInput.outputEnvName, secret.value);
        core.setOutput(secretInput.outputEnvName, secret.value);
      }
    });
  } else {
    throw Error(
      `The secrets provided could not be found. Please check the machine account has access to the secret UUIDs provided.\nError: ${secretResponse.errorMessage}`,
    );
  }

  core.info("Completed setting secrets as environment variables.");
}

async function multiParse(inputs: Inputs) {
  core.info("Parsing secrets input");
  const secretInputs = parseSecretParsedInput(inputs.secrets);

  core.info("Authenticating to Bitwarden");
  const client = await getBitwardenClient(inputs);

  core.info("Setting Secrets");
  const secretIds = secretInputs.map((secretInput: SecretInputParsed) => secretInput.id);
  const secretResponse = await client.secrets().getByIds(secretIds);
  if (secretResponse.success && secretResponse.data) {
    const secrets = secretResponse.data.data;
    secrets.forEach((secret) => {
      const secretInput = secretInputs.find((secretInput) => secretInput.id === secret.id);
      if (!secretInput) {
        return;
      }

      if (inputs.parseJson || inputs.parseYaml) {
        let parsedObj: Record<string, unknown>;
        try {
          if (inputs.parseJson) {
            parsedObj = parseJsonWithDuplicatesCheck(secret.value);
          } else {
            parsedObj = yaml.load(secret.value) as Record<string, unknown>;
          }
        } catch (error: any) {
          throw new Error(`Failed to parse secret '${secretInput}': ${error.message}`);
        }

        Object.entries(parsedObj).forEach(([key, value]) => {
          if (typeof value === "object" && value !== null) {
            throw new Error(
              `Secret contains nested structures. Only flat key-value pairs are allowed: '${key}'`,
            );
          }

          if (inputs.transformKeys) {
            key = key.toUpperCase();
          }

          const valueStr = typeof value === "string" ? value : JSON.stringify(value);
          core.setSecret(valueStr);
          core.exportVariable(key, valueStr);
          core.setOutput(key, valueStr);
        });
      }
    });
  } else {
    throw Error(
      `The secrets provided could not be found. Please check the machine account has access to the secret UUIDs provided.\nError: ${secretResponse.errorMessage}`,
    );
  }

  core.info("Completed setting secrets as environment variables.");
}

// the json library automatically overwrites the last key with the value it saw.
// this function checks for duplicates and throws an error if it finds any.
function parseJsonWithDuplicatesCheck(jsonString: string): Record<string, unknown> {
  const seenKeys = new Set<string>();

  jsonString.replace(/"([^"]+)":/g, (_, key) => {
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate key detected: '${key}'. Secrets must have unique keys.`);
    }
    seenKeys.add(key);
    return key;
  });

  return JSON.parse(jsonString);
}
