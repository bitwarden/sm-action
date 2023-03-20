import * as core from "@actions/core";
import { BitwardenClient, ClientSettings, DeviceType, LogLevel } from "@bitwarden/sdk-napi";
import { parseSecretInput } from "./parser";
import { isValidUrl } from "./validators";

async function run(): Promise<void> {
  try {
    const accessToken: string = core.getInput("access_token");
    const secrets: string[] = core.getMultilineInput("secrets", {
      required: true,
    });
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
      throw Error("Authentication to Bitwarden failed");
    }

    core.info("Setting Secrets");
    for (const secretInput of secretInputs) {
      const secretResponse = await client.secrets().get(secretInput.id);

      if (secretResponse.data) {
        core.setSecret(secretResponse.data.value);
        core.exportVariable(secretInput.outputEnvName, secretResponse.data.value);
        core.setOutput(secretInput.outputEnvName, secretResponse.data.value);
      } else {
        let errorMessage = `The secret ${secretInput.id} could not be found `;
        if (secretResponse.errorMessage) {
          errorMessage = errorMessage + "error message was: " + secretResponse.errorMessage;
        }
        throw Error(errorMessage);
      }
    }
    core.info("Completed setting secrets as environment variables.");
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

run();
