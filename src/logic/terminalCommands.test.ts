import { describe, expect, it } from "vitest";
import {
  displayUrl,
  editDistance,
  historyStep,
  lookupCommand,
  MAX_ECHO_LENGTH,
  MAX_INPUT_LENGTH,
  parseCommand,
  suggestCommand,
  TERMINAL_ALIASES,
  TERMINAL_COMMANDS,
} from "./terminalCommands";

describe("TERMINAL_COMMANDS", () => {
  it("has every command the spec lists, plus clear, with no repeats", () => {
    for (const name of [
      "help",
      "contact",
      "email",
      "github",
      "linkedin",
      "whoami",
      "exit",
      "clear",
    ])
      expect(TERMINAL_COMMANDS).toContain(name);
    expect(new Set(TERMINAL_COMMANDS).size).toBe(TERMINAL_COMMANDS.length);
  });

  it("has no alias that shadows a command name", () => {
    for (const alias of Object.keys(TERMINAL_ALIASES))
      expect(TERMINAL_COMMANDS).not.toContain(alias);
  });
});

describe("parseCommand", () => {
  it.each(TERMINAL_COMMANDS)("reads %s on its own", (command) => {
    expect(parseCommand(command)).toEqual({
      kind: "command",
      command,
      topic: null,
    });
  });

  it("ignores case and surrounding or repeated spaces", () => {
    expect(parseCommand("  EmAiL  ")).toEqual({
      kind: "command",
      command: "email",
      topic: null,
    });
    expect(parseCommand("help    github")).toEqual({
      kind: "command",
      command: "help",
      topic: "github",
    });
  });

  it("treats tabs, newlines and other control characters as spaces", () => {
    expect(parseCommand("\twhoami\r\n")).toEqual({
      kind: "command",
      command: "whoami",
      topic: null,
    });
    expect(parseCommand("help\u0000email")).toEqual({
      kind: "command",
      command: "help",
      topic: "email",
    });
  });

  it("drops a pasted prompt sign", () => {
    for (const line of ["$ help", "$help", "> contact", "# exit"])
      expect(parseCommand(line).kind).toBe("command");
  });

  it("reads empty, blank and prompt-only lines as empty", () => {
    for (const line of ["", "   ", "\n\t", "$", "$   "])
      expect(parseCommand(line)).toEqual({ kind: "empty" });
  });

  it("maps aliases to their command", () => {
    expect(parseCommand("?")).toMatchObject({ command: "help" });
    expect(parseCommand("QUIT")).toMatchObject({ command: "exit" });
    expect(parseCommand("mail")).toMatchObject({ command: "email" });
    expect(parseCommand("help gh")).toMatchObject({
      command: "help",
      topic: "github",
    });
  });

  it("rejects arguments on commands that take none", () => {
    expect(parseCommand("email me")).toEqual({
      kind: "badArgs",
      command: "email",
    });
    expect(parseCommand("exit now please")).toEqual({
      kind: "badArgs",
      command: "exit",
    });
  });

  it("lets help take one command at most", () => {
    expect(parseCommand("help email github")).toEqual({
      kind: "badArgs",
      command: "help",
    });
  });

  it("reports help about an unknown command as unknown", () => {
    expect(parseCommand("help emial")).toEqual({
      kind: "unknown",
      name: "emial",
      suggestion: "email",
    });
  });

  it("reports unknown commands in lower case, with a suggestion when one is close", () => {
    expect(parseCommand("HLEP")).toEqual({
      kind: "unknown",
      name: "hlep",
      suggestion: "help",
    });
    expect(parseCommand("ls")).toEqual({
      kind: "unknown",
      name: "ls",
      suggestion: null,
    });
  });

  it("cuts a long unknown name for echoing", () => {
    const parsed = parseCommand("x".repeat(60));
    if (parsed.kind !== "unknown") throw new Error("expected unknown");
    expect(parsed.name).toHaveLength(MAX_ECHO_LENGTH);
    expect(parsed.name.endsWith("…")).toBe(true);
  });

  it("reads only the first MAX_INPUT_LENGTH characters", () => {
    const padded = `help${" ".repeat(MAX_INPUT_LENGTH)}email`;
    expect(parseCommand(padded)).toEqual({
      kind: "command",
      command: "help",
      topic: null,
    });
  });

  it("does not treat inherited object keys as aliases", () => {
    for (const name of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ])
      expect(parseCommand(name).kind).toBe("unknown");
  });
});

describe("lookupCommand", () => {
  it("finds commands and aliases in any case, nothing else", () => {
    expect(lookupCommand("LinkedIn")).toBe("linkedin");
    expect(lookupCommand("Logout")).toBe("exit");
    expect(lookupCommand("")).toBeUndefined();
    expect(lookupCommand("sudo")).toBeUndefined();
  });
});

describe("editDistance", () => {
  it("counts inserts, deletes and swaps", () => {
    expect(editDistance("", "")).toBe(0);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "")).toBe(3);
    expect(editDistance("exit", "exit")).toBe(0);
    expect(editDistance("ext", "exit")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });

  it("is symmetric", () => {
    expect(editDistance("github", "gihtub")).toBe(
      editDistance("gihtub", "github"),
    );
  });
});

describe("suggestCommand", () => {
  it("suggests the nearest command within two edits", () => {
    expect(suggestCommand("ext")).toBe("exit");
    expect(suggestCommand("gihtub")).toBe("github");
    expect(suggestCommand("linkdin")).toBe("linkedin");
    expect(suggestCommand("WHOAMI")).toBe("whoami");
  });

  it("suggests nothing for far-off or very short names", () => {
    expect(suggestCommand("x")).toBeNull();
    expect(suggestCommand("")).toBeNull();
    expect(suggestCommand("rm -rf")).toBeNull();
  });
});

describe("historyStep", () => {
  it("moves back and forward and stops at both ends", () => {
    expect(historyStep(3, 3, -1)).toBe(2);
    expect(historyStep(0, 3, -1)).toBe(0);
    expect(historyStep(2, 3, 1)).toBe(3);
    expect(historyStep(3, 3, 1)).toBe(3);
  });

  it("stays on the fresh line with no history", () => {
    expect(historyStep(0, 0, -1)).toBe(0);
    expect(historyStep(0, 0, 1)).toBe(0);
  });
});

describe("displayUrl", () => {
  it("drops the scheme and a trailing slash", () => {
    expect(displayUrl("https://github.com/example/")).toBe(
      "github.com/example",
    );
    expect(displayUrl("HTTPS://example.com/a?b=1")).toBe("example.com/a?b=1");
  });
});
