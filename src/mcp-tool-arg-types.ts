export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}

export type ArgResult<T> =
  | { ok: true; value?: T }
  | { ok: false; error: ToolResult };
