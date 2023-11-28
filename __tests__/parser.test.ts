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

test("parseSecretInput: test parser bad env name", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa-af4101309076 > ",
      "bdbb16ac-0b9b-472e-99fa-af4101309076 > TEST_NAME2",
    ];
    parseSecretInput(secrets);
  };
  expect(t).toThrow(TypeError);
  expect(t).toThrow(
    "Error occurred when attempting to parse bdbb16bc-0b9b-472e-99fa-af4101309076 > ",
  );
});

test("parseSecretInput: test parser bad input", () => {
  const t = () => {
    const secrets: string[] = [
      "bdbb16bc-0b9b-472e-99fa-af4101309076",
      "bdbb16ac-0b9b-472e-99fa-af4101309076 > TEST_NAME2",
    ];
    parseSecretInput(secrets);
  };
  expect(t).toThrow(TypeError);
  expect(t).toThrow("Error occurred when attempting to parse bdbb16bc-0b9b-472e-99fa-af4101309076");
});
