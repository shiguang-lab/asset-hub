import { installShutdownHandlers } from "@shiguang/config";

console.info("task-worker ready");
installShutdownHandlers("task-worker");
