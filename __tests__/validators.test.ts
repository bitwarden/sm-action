import { isValidGuid, isUniqueEnvNames, isValidUrl } from "../src/validators";
import { SecretInput } from "../src/parser";
import { expect, test } from "@jest/globals";

test("isValidUrl: invalid url", () => {
  const testUrl = "bad url";
  expect(isValidUrl(testUrl)).toBe(false);
});

test("isValidUrl: only allow https url", () => {
  const testUrl = "http://identity.bitwarden.com";
  expect(isValidUrl(testUrl)).toBe(false);
});

test("isValidUrl: valid url", () => {
  const testUrl = "https://identity.bitwarden.com";
  expect(isValidUrl(testUrl)).toBe(true);
});

test("isValidGuid: invalid Guid", () => {
  const testGuid = "test";
  expect(isValidGuid(testGuid)).toBe(false);
});

test("isValidGuid: invalid Guid empty", () => {
  const testGuid = "";
  expect(isValidGuid(testGuid)).toBe(false);
});

test("isValidGuid: valid Guid", () => {
  const testGuid = "bdbb16bc-0b9b-472e-99fa-af4101309076";
  expect(isValidGuid(testGuid)).toBe(true);
});

test("isUniqueEnvNames: test non unique", () => {
  const testList: SecretInput[] = [
    new SecretInput("bdbb16bc-0b9b-472e-99fa-af4101309076", "TEST_NAME"),
    new SecretInput("bdbb16bc-0b9b-472e-99fa-af4101309076", "TEST_NAME"),
  ];
  expect(isUniqueEnvNames(testList)).toBe(false);
});

test("isUniqueEnvNames: test unique", () => {
  const testList: SecretInput[] = [
    new SecretInput("bdbb16bc-0b9b-472e-99fa-af4101309076", "TEST_NAME"),
    new SecretInput("bdbb16bc-0b9b-472e-99fa-af4101309076", "TEST_NAME_2"),
  ];
  expect(isUniqueEnvNames(testList)).toBe(true);
});
