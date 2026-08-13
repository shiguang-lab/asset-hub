import { defaultModelPolicy } from "@shiguang/ai-core";
import { installShutdownHandlers } from "@shiguang/config";

console.info("agent-runtime ready", { defaultModelPolicy });
installShutdownHandlers("agent-runtime");
