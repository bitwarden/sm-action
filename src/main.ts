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
    const accessToken: string = core.getInput("access_token");
    const secrets: string[] = core.getMultilineInput("secrets", {
      required: true,
    });
    const cloudRegion = core.getInput("cloud_region");
    const baseUrl: string = core.getInput("base_url");
    let identityUrl: string = core.getInput("identity_url");
    let apiUrl: string = core.getInput("api_url");

    core.info("Validating bitwarden/sm-action inputs...");
    if (baseUrl) {
      if (!isValidUrl(baseUrl)) {
        throw TypeError("input provided for base_url not in expected format");
      }
      identityUrl = baseUrl + "/identity";
      apiUrl = baseUrl + "/api";
    } 
    else if (cloudRegion) {
      let cloudBaseUrl
      if (cloudRegion === "us") {
        cloudBaseUrl = "bitwarden.com";
      }
      else if (cloudRegion === "eu") {
        cloudBaseUrl = "bitwarden.eu";
      }
      else { 
        throw TypeError("input provided for cloud_region not in expected format");
      }
      identityUrl = "https://identity." + cloudBaseUrl;
      apiUrl = "https://api." + cloudBaseUrl;
    }
    if (!isValidUrl(identityUrl)) {
      throw TypeError("input provided for identity_url not in expected format");
    }
    if (!isValidUrl(apiUrl)) {
      throw TypeError("input provided for api_url not in expected format");
    }

    core.info("Parsing secrets input");
    const secretInputs = parseSecretInput(secrets);

    core.info("Authenticating to Bitwarden");
    const settings: ClientSettings = {
      apiUrl: apiUrl,
      identityUrl: identityUrl,
      userAgent: "bitwarden/sm-action",
      deviceType: DeviceType.SDK,
    };
    const client = new BitwardenClient(settings, LogLevel.Info);
    const result = await client.loginWithAccessToken(accessToken);
    if (!result.success) {
      throw Error("Authentication with Bitwarden failed");
    }

    core.info("Setting Secrets");
    const secretIds = secretInputs.map((secretInput: SecretInput) => secretInput.id);
    const secretResponse = await client.secrets().getByIds(secretIds);
    if (secretResponse.data) {
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
      let errorMessage =
        "The secrets provided could not be found. Please check the service account has access to the secret UUIDs provided.";
      if (secretResponse.errorMessage) {
        errorMessage = errorMessage + `\n\n` + secretResponse.errorMessage;
      }
      throw Error(errorMessage);
    }

    core.info("Completed setting secrets as environment variables.");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}
