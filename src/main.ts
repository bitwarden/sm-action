import * as core from "@actions/core";
import { BitwardenClient, ClientSettings, DeviceType, LogLevel } from "@bitwarden/sdk-napi";
import { SecretInput, parseSecretInput } from "./parser";
import { isValidUrl } from "./validators";

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    core.info("Validating bitwarden/sm-action inputs...");
    const inputs = readInputs();

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
};

function readInputs(): Inputs {
  const accessToken: string = core.getInput("access_token", {
    required: true,
  });
  const secrets: string[] = core.getMultilineInput("secrets", {
    required: true,
  });
  const baseUrl: string = core.getInput("base_url");
  let identityUrl: string = core.getInput("identity_url");
  let apiUrl: string = core.getInput("api_url");

  if (baseUrl) {
    if (!isValidUrl(baseUrl)) {
      throw TypeError("input provided for base_url not in expected format");
    }
    identityUrl = baseUrl + "/identity";
    apiUrl = baseUrl + "/api";
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
  };
}

async function getBitwardenClient(inputs: Inputs): Promise<BitwardenClient> {
  const settings: ClientSettings = {
    apiUrl: inputs.apiUrl,
    identityUrl: inputs.identityUrl,
    userAgent: "bitwarden/sm-action",
    deviceType: DeviceType.SDK,
  };

  const logLevel = core.isDebug() ? LogLevel.Debug : LogLevel.Info;

  const client = new BitwardenClient(settings, logLevel);
  const result = await client.loginWithAccessToken(inputs.accessToken);
  if (!result.success) {
    throw Error(`Authentication with Bitwarden failed.\nError: ${result.errorMessage}`);
  }

  return client;
}
