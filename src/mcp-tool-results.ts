import type { ToolResult } from "./mcp-tool-arg-types.js";
import type { MemoryProposalBlockedError } from "./errors.js";
import {
  sanitizeErrorMessage,
  sanitizeJsonForBoundary
} from "./safety.js";

export function toolSuccess(
  structuredContent: Record<string, unknown>,
  _summary: string
): ToolResult {
  const safeStructuredContent = sanitizeToolValue(structuredContent) as Record<string, unknown>;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(safeStructuredContent, null, 2)
    }],
    structuredContent: safeStructuredContent
  };
}

export function toolError(code: string, message: string): ToolResult {
  const structuredContent = {
    error: {
      code,
      message: sanitizeErrorMessage(message)
    }
  };

  return {
    content: [{
      type: "text",
      text: JSON.stringify(structuredContent, null, 2)
    }],
    structuredContent,
    isError: true
  };
}

export function blockedProposalToolError(error: MemoryProposalBlockedError): ToolResult {
  const structuredContent = sanitizeToolValue({
    error: {
      code: error.code,
      message: sanitizeErrorMessage(error)
    },
    audit: error.audit
  }) as Record<string, unknown>;

  return {
    content: [{
      type: "text",
      text: JSON.stringify(structuredContent, null, 2)
    }],
    structuredContent,
    isError: true
  };
}

export function safeErrorMessage(error: unknown): string {
  return sanitizeErrorMessage(error);
}

function sanitizeToolValue(value: unknown): unknown {
  return sanitizeJsonForBoundary(value);
}
