import { parseSecretInput } from "../src/parser";
import { expect, test } from "@jest/globals";

test("parseSecretInput: test parser spaces", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa-af4101309076 > TEST_NAME",
      "bdbb16ac-0b9b-472e-99fa-af4101309076 > TEST_NAME2",
    ];
    parseSecretInput(secrets);
  };
  expect(t).not.toThrow(TypeError);
});

test("parseSecretInput: test parser no spaces", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa-af4101309076>TEST_NAME",
      "bdbb16ac-0b9b-472e-99fa-af4101309076>TEST_NAME2",
    ];
    parseSecretInput(secrets);
  };
  expect(t).not.toThrow(TypeError);
});

test("parseSecretInput: test parser bad input", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa-af4101309076",
      "bdbb16bc-0b9b-472e-99fa-af4101309076 : TEST_NAME",
      "bdbb16ac-0b9b-472e-99fa-af4101309076 > TEST_NAME2",
    ];
    parseSecretInput(secrets);
  };
  expect(t).toThrow(
    new TypeError(
      "Error occurred when attempting to parse bdbb16bc-0b9b-472e-99fa-af4101309076. Expected format: <secretGuid> > <environmentVariableName>",
    ),
  );
});

test("parseSecretInput: test parser bad Guid", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa > TEST_NAME",
      "bdbb16ac-0b9b-472e-99fa-af4101309076 > TEST_NAME2",
    ];
    parseSecretInput(secrets);
  };
  expect(t).toThrow(
    new TypeError(
      "Error occurred when attempting to parse bdbb16bc-0b9b-472e-99fa > TEST_NAME. Id is not a valid GUID",
    ),
  );
});

test("parseSecretInput: test parser bad env name", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa-af4101309076 > ",
      "bdbb16ac-0b9b-472e-99fa-af4101309076 > TEST_NAME2",
    ];
    parseSecretInput(secrets);
  };
  expect(t).toThrow(
    new TypeError(
      "Error occurred when attempting to parse bdbb16bc-0b9b-472e-99fa-af4101309076 > . Environment variable name is not valid",
    ),
  );
});

test("parseSecretInput: test parser duplicate environment variabled", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa-af4101309076 > TEST_NAME",
      "bdbb16ac-0b9b-472e-99fa-af4101309076 > TEST_NAME",
    ];
    parseSecretInput(secrets);
  };
  expect(t).toThrow(
    new TypeError("Environmental variable names provided are not unique, names must be unique"),
  );
});
