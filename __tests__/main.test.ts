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
const TEST_ACCESS_TOKEN = randomUUID().toString();
const TEST_SECRETS = [`\t${randomUUID().toString()} > TEST_VALUE`];
const DEFAULT_BASE_URL = "";
const DEFAULT_IDENTITY_URL = "https://identity.bitwarden.com";
const DEFAULT_API_URL = "https://api.bitwarden.com";

// Mock the GitHub Actions core library
let errorMock: jest.SpyInstance;
let getInputMock: jest.SpyInstance;
let getMultilineInputMock: jest.SpyInstance;
let setFailedMock: jest.SpyInstance;
let setSecretMock: jest.SpyInstance;
let exportVariableMock: jest.SpyInstance;
let setOutputMock: jest.SpyInstance;
let setDebugMock: jest.SpyInstance;

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

    errorMock = jest.spyOn(core, "error").mockImplementation();
    getInputMock = jest.spyOn(core, "getInput").mockImplementation();
    getMultilineInputMock = jest.spyOn(core, "getMultilineInput").mockImplementation();
    setFailedMock = jest.spyOn(core, "setFailed").mockImplementation();
    setSecretMock = jest.spyOn(core, "setSecret").mockImplementation();
    exportVariableMock = jest.spyOn(core, "exportVariable").mockImplementation();
    setOutputMock = jest.spyOn(core, "setOutput").mockImplementation();
    setDebugMock = jest.spyOn(core, "isDebug").mockReturnValue(false);
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
        { accessToken: TEST_ACCESS_TOKEN, secrets: TEST_SECRETS, baseUrl: INVALID_URL } as Inputs,
        "input provided for base_url not in expected format",
      ],
      [
        "identity_url",
        {
          accessToken: TEST_ACCESS_TOKEN,
          secrets: TEST_SECRETS,
          identityUrl: INVALID_URL,
        } as Inputs,
        "input provided for identity_url not in expected format",
      ],
      [
        "api_url",
        {
          accessToken: TEST_ACCESS_TOKEN,
          secrets: TEST_SECRETS,
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: INVALID_URL,
        } as Inputs,
        "input provided for api_url not in expected format",
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
    }
  });

  describe("default inputs", () => {
    it.each([
      [
        "no optional inputs",
        {
          baseUrl: DEFAULT_BASE_URL,
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: DEFAULT_API_URL,
        } as OptionalInputs,
        {
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: DEFAULT_API_URL,
        } as ClientSettings,
        false,
      ],
      [
        "base_url provided",
        {
          baseUrl: "https://bitwarden.example.com",
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: DEFAULT_API_URL,
        } as OptionalInputs,
        {
          identityUrl: "https://bitwarden.example.com/identity",
          apiUrl: "https://bitwarden.example.com/api",
        } as ClientSettings,
        false,
      ],
      [
        "identity_url provided",
        {
          baseUrl: DEFAULT_BASE_URL,
          identityUrl: "https://identity.bitwarden.example.com",
          apiUrl: DEFAULT_API_URL,
        } as OptionalInputs,
        {
          identityUrl: "https://identity.bitwarden.example.com",
          apiUrl: DEFAULT_API_URL,
        } as ClientSettings,
        false,
      ],
      [
        "api_url provided",
        {
          baseUrl: DEFAULT_BASE_URL,
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: "https://api.bitwarden.example.com",
        } as OptionalInputs,
        {
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: "https://api.bitwarden.example.com",
        } as ClientSettings,
        false,
      ],
      [
        "api_url and identity_url provided",
        {
          baseUrl: DEFAULT_BASE_URL,
          identityUrl: "https://identity.bitwarden.example.com",
          apiUrl: "https://api.bitwarden.example.com",
        } as OptionalInputs,
        {
          identityUrl: "https://identity.bitwarden.example.com",
          apiUrl: "https://api.bitwarden.example.com",
        } as ClientSettings,
        false,
      ],
      [
        "debug logging enabled",
        {
          baseUrl: DEFAULT_BASE_URL,
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: DEFAULT_API_URL,
        } as OptionalInputs,
        {
          identityUrl: DEFAULT_IDENTITY_URL,
          apiUrl: DEFAULT_API_URL,
        } as ClientSettings,
        true,
      ],
    ])(
      "%s",
      async (
        _,
        optionalInputs: OptionalInputs,
        expectedClientSettings: ClientSettings,
        isDebugEnabled: boolean,
      ) => {
        mockInputs({
          accessToken: TEST_ACCESS_TOKEN,
          secrets: [] as string[],
          ...optionalInputs,
        } as Inputs);
        mockSecretsGetByIdResponse({
          success: true,
          data: {
            data: [],
          },
        });
        setDebugMock.mockReturnValue(isDebugEnabled);

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
          isDebugEnabled ? LogLevel.Debug : LogLevel.Info,
        ]);
      },
    );
  });

  describe("sets secrets", () => {
    it("no secrets", async () => {
      mockInputs({
        accessToken: TEST_ACCESS_TOKEN,
        secrets: [] as string[],
        identityUrl: DEFAULT_IDENTITY_URL,
        apiUrl: DEFAULT_API_URL,
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
        accessToken: TEST_ACCESS_TOKEN,
        secrets: [
          `${secretsResponse[0].id} > TEST_ENV_VAR_1`,
          `${secretsResponse[1].id} > TEST_ENV_VAR_2`,
        ],
        identityUrl: DEFAULT_IDENTITY_URL,
        apiUrl: DEFAULT_API_URL,
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
};

type Inputs = {
  accessToken?: string;
  secrets?: string[];
} & OptionalInputs;

function mockInputs(inputs: Inputs) {
  const { accessToken, secrets, baseUrl, identityUrl, apiUrl } = inputs;

  getInputMock.mockImplementation(
    (name: string, options?: { required?: boolean }): string | undefined => {
      const value = {
        access_token: accessToken,
        base_url: baseUrl,
        identity_url: identityUrl,
        api_url: apiUrl,
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
