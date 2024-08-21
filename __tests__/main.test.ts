import * as core from "@actions/core";
import * as main from "../src/main";
import {
  ClientSettings,
  DatumClass,
  DeviceType,
  LogLevel,
  ResponseForAPIKeyLoginResponse,
  ResponseForSecretsResponse,
} from "@bitwarden/sdk-napi";
import { randomUUID } from "crypto";

const INVALID_URL = "INVALID_URL";
const INVALID_CLOUD_REGION = "INVALID_CLOUD_REGION";
const TEST_ACCESS_TOKEN = randomUUID().toString();
const TEST_SECRETS = [`\t${randomUUID().toString()} > TEST_VALUE`];
const DEFAULT_BASE_URL = "";
const DEFAULT_IDENTITY_URL = "";
const DEFAULT_API_URL = "";
const DEFAULT_CLOUD_REGION = "us";

const OPTIONAL_TEST_INPUTS = {
  baseUrl: DEFAULT_BASE_URL,
  identityUrl: DEFAULT_IDENTITY_URL,
  apiUrl: DEFAULT_API_URL,
  cloudRegion: DEFAULT_CLOUD_REGION,
} as OptionalInputs;

const TEST_INPUTS = {
  accessToken: TEST_ACCESS_TOKEN,
  secrets: TEST_SECRETS,
  ...OPTIONAL_TEST_INPUTS,
} as Inputs;

const EXPECTED_DEFAULT_IDENTITY_URL = "https://identity.bitwarden.com";
const EXPECTED_DEFAULT_API_URL = "https://api.bitwarden.com";

// Mock the GitHub Actions core library
let warningMock: jest.SpyInstance;
let errorMock: jest.SpyInstance;
let getInputMock: jest.SpyInstance;
let getMultilineInputMock: jest.SpyInstance;
let setFailedMock: jest.SpyInstance;
let setSecretMock: jest.SpyInstance;
let exportVariableMock: jest.SpyInstance;
let setOutputMock: jest.SpyInstance;

// Mock the Bitwarden SDK
const secretsClientMock = jest.fn();
const loginWithAccessToken = jest.fn();
const bitwardenClientMock = jest.fn().mockImplementation(() => {
  return {
    loginWithAccessToken: loginWithAccessToken,
    secrets: secretsClientMock,
  };
});
jest.mock("@bitwarden/sdk-napi", () => ({
  BitwardenClient: jest.fn().mockImplementation((...args: any) => bitwardenClientMock(args)),
  DeviceType: jest.requireActual("@bitwarden/sdk-napi").DeviceType,
  ClientSettings: jest.requireActual("@bitwarden/sdk-napi").ClientSettings,
  LogLevel: jest.requireActual("@bitwarden/sdk-napi").LogLevel,
}));

describe("action", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    warningMock = jest.spyOn(core, "warning").mockImplementation();
    errorMock = jest.spyOn(core, "error").mockImplementation();
    getInputMock = jest.spyOn(core, "getInput").mockImplementation();
    getMultilineInputMock = jest.spyOn(core, "getMultilineInput").mockImplementation();
    setFailedMock = jest.spyOn(core, "setFailed").mockImplementation();
    setSecretMock = jest.spyOn(core, "setSecret").mockImplementation();
    exportVariableMock = jest.spyOn(core, "exportVariable").mockImplementation();
    setOutputMock = jest.spyOn(core, "setOutput").mockImplementation();
  });

  describe("sets a failed status", () => {
    it.each([
      ["access_token", {} as Inputs, "Input required and not supplied: access_token"],
      [
        "secrets",
        { accessToken: TEST_ACCESS_TOKEN } as Inputs,
        "Input required and not supplied: secrets",
      ],
      [
        "base_url",
        {
          ...TEST_INPUTS,
          baseUrl: INVALID_URL,
        } as Inputs,
        "input provided for base_url not in expected format",
      ],
      [
        "identity_url with missing api_url",
        {
          ...TEST_INPUTS,
          identityUrl: INVALID_URL,
        } as Inputs,
        "if using custom Urls, both identity_url and api_url need to be set.",
      ],
      [
        "api_url with missing identity_url",
        {
          ...TEST_INPUTS,
          apiUrl: INVALID_URL,
        } as Inputs,
        "if using custom Urls, both identity_url and api_url need to be set.",
      ],
      [
        "api_url",
        {
          ...TEST_INPUTS,
          identityUrl: "https://identity.example.com",
          apiUrl: INVALID_URL,
        } as Inputs,
        "input provided for api_url not in expected format",
      ],
      [
        "identity_url",
        {
          ...TEST_INPUTS,
          identityUrl: INVALID_URL,
          apiUrl: "https://api.example.com",
        } as Inputs,
        "input provided for identity_url not in expected format",
      ],
      [
        "cloud_region",
        {
          ...TEST_INPUTS,
          cloudRegion: INVALID_CLOUD_REGION,
        } as Inputs,
        "input provided for cloud_region is not in the expected format",
      ],
    ])("readActionInputs: invalid input %s", async (_, inputs: Inputs, errorMessage) => {
      mockInputs(inputs);

      await main.run();

      expectFailed(errorMessage);
    });

    it("input invalid secrets syntax", async () => {
      mockInputs({
        accessToken: TEST_ACCESS_TOKEN,
        secrets: ["UUID : ENV_VAR_NAME"],
        identityUrl: DEFAULT_IDENTITY_URL,
        apiUrl: DEFAULT_API_URL,
        cloudRegion: DEFAULT_CLOUD_REGION,
      } as Inputs);

      await main.run();

      expectFailed(
        "Error occurred when attempting to parse UUID : ENV_VAR_NAME. Expected format: <secretGuid> > <environmentVariableName>",
      );
    });

    it("loginWithAccessToken: authentication failed", async () => {
      mockInputs({
        accessToken: TEST_ACCESS_TOKEN,
        secrets: TEST_SECRETS,
        identityUrl: DEFAULT_IDENTITY_URL,
        apiUrl: DEFAULT_API_URL,
        cloudRegion: DEFAULT_CLOUD_REGION,
      } as Inputs);
      loginWithAccessToken.mockReturnValue(
        Promise.resolve(<ResponseForAPIKeyLoginResponse>{
          success: false,
          errorMessage: "Test error message",
        }),
      );

      await main.run();

      expectFailed("Authentication with Bitwarden failed.\nError: Test error message");
    });

    it("secrets.getByIds: secrets not found", async () => {
      mockInputs({
        accessToken: TEST_ACCESS_TOKEN,
        secrets: TEST_SECRETS,
        identityUrl: DEFAULT_IDENTITY_URL,
        apiUrl: DEFAULT_API_URL,
        cloudRegion: DEFAULT_CLOUD_REGION,
      } as Inputs);
      mockSecretsGetByIdResponse({
        success: false,
        errorMessage: "Test error message",
      });

      await main.run();

      expectFailed(
        "The secrets provided could not be found. Please check the machine account has access to the secret UUIDs provided.\nError: Test error message",
      );
    });

    function expectFailed(errorMessage: string) {
      expect(setFailedMock).toHaveBeenNthCalledWith(1, errorMessage);
      expect(setFailedMock).toHaveBeenCalledTimes(1);
      expect(errorMock).not.toHaveBeenCalled();
      expect(setSecretMock).not.toHaveBeenCalled();
      expect(exportVariableMock).not.toHaveBeenCalled();
      expect(setOutputMock).not.toHaveBeenCalled();
      expect(warningMock).not.toHaveBeenCalled();
    }
  });

  describe("optional inputs", () => {
    it.each([
      [
        "no optional inputs",
        {
          ...OPTIONAL_TEST_INPUTS,
        } as OptionalInputs,
        {
          identityUrl: EXPECTED_DEFAULT_IDENTITY_URL,
          apiUrl: EXPECTED_DEFAULT_API_URL,
        } as ClientSettings,
      ],
      [
        "base_url provided",
        {
          ...OPTIONAL_TEST_INPUTS,
          baseUrl: "https://bitwarden.example.com",
        } as OptionalInputs,
        {
          identityUrl: "https://bitwarden.example.com/identity",
          apiUrl: "https://bitwarden.example.com/api",
        } as ClientSettings,
      ],
      [
        "api_url and identity_url provided",
        {
          ...OPTIONAL_TEST_INPUTS,
          identityUrl: "https://identity.bitwarden.example.com",
          apiUrl: "https://api.bitwarden.example.com",
        } as OptionalInputs,
        {
          identityUrl: "https://identity.bitwarden.example.com",
          apiUrl: "https://api.bitwarden.example.com",
        } as ClientSettings,
      ],
      [
        "cloud_region provided",
        {
          ...OPTIONAL_TEST_INPUTS,
          cloudRegion: "eu",
        } as OptionalInputs,
        {
          identityUrl: "https://identity.bitwarden.eu",
          apiUrl: "https://api.bitwarden.eu",
        } as ClientSettings,
      ],
    ])("%s", async (_, optionalInputs: OptionalInputs, expectedClientSettings: ClientSettings) => {
      mockInputs({
        ...TEST_INPUTS,
        secrets: [] as string[],
        ...optionalInputs,
      } as Inputs);
      mockSecretsGetByIdResponse({
        success: true,
        data: {
          data: [],
        },
      });

      await main.run();

      expect(setFailedMock).not.toHaveBeenCalled();
      expect(errorMock).not.toHaveBeenCalled();
      expect(setSecretMock).not.toHaveBeenCalled();
      expect(bitwardenClientMock).toHaveBeenCalledTimes(1);
      expect(bitwardenClientMock).toHaveBeenCalledWith([
        {
          deviceType: DeviceType.SDK,
          userAgent: "bitwarden/sm-action",
          ...expectedClientSettings,
        } as ClientSettings,
        LogLevel.Info,
      ]);
      expect(warningMock).not.toHaveBeenCalled();
    });

    it("all self-hosted url inputs provided at once", async () => {
      mockInputs({
        ...TEST_INPUTS,
        secrets: [] as string[],
        baseUrl: "https://bitwarden.example.com",
        identityUrl: "https://identity.bitwarden.example.com",
        apiUrl: "https://api.bitwarden.example.com",
      } as Inputs);
      mockSecretsGetByIdResponse({
        success: true,
        data: {
          data: [],
        },
      });

      await main.run();

      expect(setFailedMock).not.toHaveBeenCalled();
      expect(errorMock).not.toHaveBeenCalled();
      expect(setSecretMock).not.toHaveBeenCalled();
      expect(bitwardenClientMock).toHaveBeenCalledTimes(1);
      expect(bitwardenClientMock).toHaveBeenCalledWith([
        {
          deviceType: DeviceType.SDK,
          userAgent: "bitwarden/sm-action",
          identityUrl: "https://bitwarden.example.com/identity",
          apiUrl: "https://bitwarden.example.com/api",
        } as ClientSettings,
        LogLevel.Info,
      ]);
      expect(warningMock).toHaveBeenCalledTimes(1);
      expect(warningMock).toHaveBeenCalledWith(
        "both base_url and api_url/identity_url are set, but only one of the two options should be set. In this case, base_url is used.",
      );
    });
  });

  describe("sets secrets", () => {
    it("no secrets", async () => {
      mockInputs({
        ...TEST_INPUTS,
        secrets: [] as string[],
      } as Inputs);
      mockSecretsGetByIdResponse({
        success: true,
        data: {
          data: [],
        },
      });

      await main.run();

      expect(setFailedMock).not.toHaveBeenCalled();
      expect(errorMock).not.toHaveBeenCalled();
      expect(setSecretMock).not.toHaveBeenCalled();
      expect(exportVariableMock).not.toHaveBeenCalled();
      expect(setOutputMock).not.toHaveBeenCalled();
    });

    it("env variables exported", async () => {
      const secretsResponse = [
        {
          id: randomUUID().toString(),
          key: "TEST KEY 1",
          value: "TEST VALUE 1",
        } as DatumClass,
        {
          id: randomUUID().toString(),
          key: "TEST KEY 2",
          value: "TEST VALUE 2",
        } as DatumClass,
      ];

      mockInputs({
        ...TEST_INPUTS,
        secrets: [
          `${secretsResponse[0].id} > TEST_ENV_VAR_1`,
          `${secretsResponse[1].id} > TEST_ENV_VAR_2`,
        ],
      } as Inputs);
      mockSecretsGetByIdResponse({
        success: true,
        data: {
          data: secretsResponse,
        },
      });

      await main.run();

      expect(setFailedMock).not.toHaveBeenCalled();
      expect(errorMock).not.toHaveBeenCalled();
      expect(setSecretMock).toHaveBeenNthCalledWith(1, secretsResponse[0].value);
      expect(setSecretMock).toHaveBeenNthCalledWith(2, secretsResponse[1].value);
      expect(setSecretMock).toHaveBeenCalledTimes(2);
      expect(exportVariableMock).toHaveBeenNthCalledWith(
        1,
        "TEST_ENV_VAR_1",
        secretsResponse[0].value,
      );
      expect(exportVariableMock).toHaveBeenNthCalledWith(
        2,
        "TEST_ENV_VAR_2",
        secretsResponse[1].value,
      );
      expect(exportVariableMock).toHaveBeenCalledTimes(2);
      expect(setOutputMock).toHaveBeenNthCalledWith(1, "TEST_ENV_VAR_1", secretsResponse[0].value);
      expect(setOutputMock).toHaveBeenNthCalledWith(2, "TEST_ENV_VAR_2", secretsResponse[1].value);
      expect(setOutputMock).toHaveBeenCalledTimes(2);
    });
  });
});

function mockSecretsGetByIdResponse(response: ResponseForSecretsResponse) {
  loginWithAccessToken.mockReturnValue(
    Promise.resolve(<ResponseForAPIKeyLoginResponse>{
      success: true,
    }),
  );
  secretsClientMock.mockImplementation(() => {
    return {
      getByIds: jest.fn().mockReturnValue(response),
    };
  });
}

type OptionalInputs = {
  baseUrl?: string;
  identityUrl?: string;
  apiUrl?: string;
  cloudRegion?: string;
};

type Inputs = {
  accessToken?: string;
  secrets?: string[];
} & OptionalInputs;

function mockInputs(inputs: Inputs) {
  const { accessToken, secrets, baseUrl, identityUrl, apiUrl, cloudRegion } = inputs;

  getInputMock.mockImplementation(
    (name: string, options?: { required?: boolean }): string | undefined => {
      const value = {
        access_token: accessToken,
        base_url: baseUrl,
        identity_url: identityUrl,
        api_url: apiUrl,
        cloud_region: cloudRegion,
      }[name];

      // Error from core.getInput is thrown if the input is required and not supplied
      if (options?.required && !value) {
        throw new Error(`Input required and not supplied: ${name}`);
      }

      return value;
    },
  );

  getMultilineInputMock.mockImplementation(
    (name: string, options?: { required?: boolean }): string[] | undefined => {
      const value = {
        secrets: secrets,
      }[name];

      // Error from core.getMultilineInput is thrown if the input is required and not supplied
      if (options?.required && !value) {
        throw new Error(`Input required and not supplied: ${name}`);
      }

      return value;
    },
  );
}
