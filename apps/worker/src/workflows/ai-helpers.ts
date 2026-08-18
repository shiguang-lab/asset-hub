import {
  type AiService,
  agenticComplete,
  buildMcpToolkit,
  type CapabilityContext,
  type ChatMessage,
  type ModelQuality,
} from "@shiguang/ai-core";

/**
 * 统一 AI 补全入口：配置了 MCP server 时走工具调用循环（真正执行工具），
 * 否则回退普通补全。返回终答文本与已执行工具列表。
 */
export async function completeWithCapabilities(
  ai: AiService,
  input: {
    messages: ChatMessage[];
    quality?: ModelQuality;
    capabilityContext?: CapabilityContext | null;
  },
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
  const toolkit =
    input.capabilityContext?.mcpServers && input.capabilityContext.mcpServers.length > 0
      ? await buildMcpToolkit(input.capabilityContext.mcpServers).catch(() => null)
      : null;

  if (toolkit && toolkit.tools.length > 0) {
    const result = await agenticComplete({
      complete: (request) => ai.complete(request),
      messages: input.messages,
      tools: toolkit.tools,
      execute: toolkit.execute,
      quality: input.quality,
    });
    return { text: result.text, toolCalls: result.toolCalls };
  }

  const res = await ai.complete({ messages: input.messages, quality: input.quality });
  return { text: res.text, toolCalls: [] };
}
