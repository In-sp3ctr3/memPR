import type { ParsedArgs } from "./cli-args.js";
import {
  sanitizeJsonForBoundary,
  sanitizeRenderedTextForBoundary
} from "./safety.js";

export function printJsonOrText(parsed: ParsedArgs, value: unknown, text: string): void {
  if (parsed.flags.json) {
    console.log(JSON.stringify(sanitizeJsonForBoundary(value), null, 2));
    return;
  }

  console.log(sanitizeRenderedTextForBoundary(text));
}
