import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AUTHORING_GUIDE, TOOLS, type ReportApi } from "@reporting/ai-tools";

export interface McpOptions {
  api: ReportApi;
  /** Hide tools that write (save_template, publish_template). Recommended for untrusted agents. */
  readOnly?: boolean;
  version?: string;
}

/**
 * Builds the MCP server. It is a thin shell: every capability is an @reporting/ai-tools tool talking to the REST API,
 * so the AI (whatever model the *client* runs - BYOK) can only read, patch report JSON, analyze and render.
 */
export function createMcpServer(options: McpOptions): Server {
  const tools = TOOLS.filter((t) => !options.readOnly || t.readOnly);
  const server = new Server({ name: "open-reports", version: options.version ?? "0.2.0" }, { capabilities: { tools: {}, resources: {}, prompts: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema as any, annotations: { readOnlyHint: t.readOnly, destructiveHint: false, idempotentHint: t.readOnly } })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = tools.find((t) => t.name === req.params.name);
    if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool "${req.params.name}".` }] };
    const result = await tool.handler((req.params.arguments ?? {}) as any, options.api);
    const content: { type: "text"; text: string }[] = [{ type: "text", text: result.text }];
    if (result.data !== undefined) {
      const json = JSON.stringify(result.data);
      // keep tool results model-sized; large payloads (schemas, PDFs) are truncated with a clear marker
      content.push({ type: "text", text: json.length > 60_000 ? json.slice(0, 60_000) + `\n…truncated (${json.length} chars)` : json });
    }
    return { isError: result.isError, content };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: "report://schema", name: "Report definition JSON Schema", mimeType: "application/json" },
      { uri: "report://capabilities", name: "Server capabilities", mimeType: "application/json" },
      { uri: "report://guide", name: "Authoring guide", mimeType: "text/markdown" },
    ],
  }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [{ uriTemplate: "report://examples/{name}", name: "Example report", mimeType: "application/json" }, { uriTemplate: "report://templates/{id}", name: "Stored template", mimeType: "application/json" }],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const uri = req.params.uri;
    const text = (t: string, mimeType = "application/json") => ({ contents: [{ uri, mimeType, text: t }] });
    if (uri === "report://guide") return text(AUTHORING_GUIDE, "text/markdown");
    if (uri === "report://schema") return text(JSON.stringify(await options.api.json("GET", "/api/v1/schema")));
    if (uri === "report://capabilities") return text(JSON.stringify(await options.api.json("GET", "/api/v1/capabilities")));
    const ex = /^report:\/\/examples\/(.+)$/.exec(uri);
    if (ex) return text(JSON.stringify(await options.api.json("GET", `/api/v1/examples/${ex[1]}`)));
    const tp = /^report:\/\/templates\/(.+)$/.exec(uri);
    if (tp) {
      const id = encodeURIComponent(tp[1]!);
      const meta = await options.api.json("GET", `/api/v1/templates/${id}`);
      return text(JSON.stringify((await options.api.json("GET", `/api/v1/templates/${id}/versions/${meta.currentVersion}`)).definition));
    }
    throw new Error(`Unknown resource ${uri}`);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      { name: "author_report", description: "Guidance for building or editing a report safely with the reporting tools.", arguments: [{ name: "goal", description: "What the user wants (e.g. 'a 100-page lab report with repeating headers')", required: false }] },
    ],
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    if (req.params.name !== "author_report") throw new Error(`Unknown prompt ${req.params.name}`);
    const goal = req.params.arguments?.goal;
    return { messages: [{ role: "user", content: { type: "text", text: `${AUTHORING_GUIDE}${goal ? `\n\nGoal: ${goal}` : ""}` } }] };
  });

  return server;
}
