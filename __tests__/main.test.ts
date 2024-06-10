import * as core from "@actions/core";
import * as main from "../src/main";

// Mock the action's main function
const runMock = jest.spyOn(main, "run");

// Mock the GitHub Actions core library
let errorMock: jest.SpyInstance;
let getInputMock: jest.SpyInstance;
let getMultilineInput: jest.SpyInstance;
let setFailedMock: jest.SpyInstance;

describe("action", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    errorMock = jest.spyOn(core, "error").mockImplementation();
    getInputMock = jest.spyOn(core, "getInput").mockImplementation();
    getMultilineInput = jest.spyOn(core, "getMultilineInput").mockImplementation();
    setFailedMock = jest.spyOn(core, "setFailed").mockImplementation();
  });

  it("sets a failed status", async () => {
    getMultilineInput.mockImplementation((name: string): string[] => {
      switch (name) {
        default:
          return [];
      }
    });

    getInputMock.mockImplementation((name: string): string => {
      switch (name) {
        default:
          return "";
      }
    });

    await main.run();
    expect(runMock).toHaveReturned();

    // Verify that all of the core library functions were called correctly
    expect(setFailedMock).toHaveBeenNthCalledWith(
      1,
      "input provided for cloud_region not in expected format",
    );
    expect(errorMock).not.toHaveBeenCalled();
  });
});
