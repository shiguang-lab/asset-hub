import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "./zod-to-json-schema.js";
import { buildResponseFormat } from "./index.js";

describe("zodToJsonSchema", () => {
  it("converts complex Zod schemas to strict JSON schema", () => {
    const schema = z.object({
      title: z.string(),
      count: z.number(),
      tags: z.array(z.string()),
      status: z.enum(["draft", "published"]),
      metadata: z.object({
        author: z.string().optional(),
      }).optional(),
    });

    const jsonSchema = zodToJsonSchema(schema);

    expect(jsonSchema).toEqual({
      type: "object",
      properties: {
        title: { type: "string" },
        count: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["draft", "published"] },
        metadata: {
          type: "object",
          properties: {
            author: { type: "string" },
          },
          additionalProperties: false,
        },
      },
      required: ["title", "count", "tags", "status"],
      additionalProperties: false,
    });
  });
});

describe("buildResponseFormat", () => {
  it("constructs type: json_schema with strict: true when structuredOutput is provided", () => {
    const schema = z.object({ ok: z.boolean() });
    const res = buildResponseFormat({
      messages: [],
      structuredOutput: schema,
    });

    expect(res).toEqual({
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "structured_output",
          strict: true,
          schema: {
            type: "object",
            properties: {
              ok: { type: "boolean" },
            },
            required: ["ok"],
            additionalProperties: false,
          },
        },
      },
    });
  });

  it("constructs type: json_object when responseFormat is json_object", () => {
    const res = buildResponseFormat({
      messages: [],
      responseFormat: "json_object",
    });

    expect(res).toEqual({
      response_format: {
        type: "json_object",
      },
    });
  });
});
