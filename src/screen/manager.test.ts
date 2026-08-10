import { describe, expect, it } from "vitest";
import { parseScreenContext } from "./manager";

describe("screen context parsing", () => {
  it("extracts bounded, structured context and known topics", () => {
    const context = parseScreenContext("Working in a React app with TypeScript, Prisma and PostgreSQL.");
    expect(context.application).toBe("User-approved screen capture");
    expect(context.detectedTopics).toEqual(expect.arrayContaining(["React", "TypeScript", "Prisma"]));
    expect(context.visibleText).toContain("PostgreSQL");
  });

  it("limits visible text to the configured context budget", () => {
    expect(parseScreenContext("x".repeat(3_100)).visibleText).toHaveLength(3_000);
  });
});
