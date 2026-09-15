import { z } from "zod";

/**
 * Lightweight Zod to JSON Schema converter for OpenAI Structured Outputs (type: "json_schema").
 * Converts Zod schemas into strict OpenAI-compatible JSON Schema objects.
 */
export function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const def = (schema as any)?._def;
  const typeName = def?.typeName ?? (schema as any)?.constructor?.name;

  switch (typeName) {
    case "ZodString": {
      const result: Record<string, unknown> = { type: "string" };
      if (def.checks) {
        for (const check of def.checks) {
          if (check.kind === "min") result.minLength = check.value;
          if (check.kind === "max") result.maxLength = check.value;
        }
      }
      return result;
    }

    case "ZodNumber": {
      return { type: "number" };
    }

    case "ZodBoolean": {
      return { type: "boolean" };
    }

    case "ZodEnum": {
      const vals = def.values ?? def.entries;
      const enumArray = Array.isArray(vals) ? vals : Object.values(vals ?? {});
      return { type: "string", enum: enumArray };
    }

    case "ZodLiteral": {
      const valType = typeof def.value;
      return { type: valType, enum: [def.value] };
    }

    case "ZodArray": {
      const itemSchema = def.element ?? def.type;
      return {
        type: "array",
        items: itemSchema ? zodToJsonSchema(itemSchema) : { type: "string" },
      };
    }

    case "ZodObject": {
      const rawShape = typeof def.shape === "function" ? def.shape() : (def.shape || (schema as any).shape || {});
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, propSchema] of Object.entries<z.ZodType>(rawShape)) {
        properties[key] = zodToJsonSchema(propSchema);

        const isOptional =
          typeof (propSchema as any).isOptional === "function"
            ? (propSchema as any).isOptional()
            : (propSchema as any)._def?.typeName === "ZodOptional" || (propSchema as any)._def?.typeName === "ZodDefault";

        if (!isOptional) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      };
    }

    case "ZodOptional":
    case "ZodNullable":
    case "ZodDefault": {
      return zodToJsonSchema(def.innerType);
    }

    case "ZodEffects": {
      return zodToJsonSchema(def.schema);
    }

    case "ZodUnion": {
      const options = (def.options as z.ZodType[]).map(zodToJsonSchema);
      return { anyOf: options };
    }

    case "ZodRecord": {
      return {
        type: "object",
        additionalProperties: zodToJsonSchema(def.valueType),
      };
    }

    default: {
      return { type: "object", additionalProperties: true };
    }
  }
}
