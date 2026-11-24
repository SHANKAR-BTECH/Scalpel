import raw from "@/data/demo.json";
import { DemoData } from "./demo-schema";

/** Parsed once at build time. A broken or stale file stops the build with a clear error. */
export const demo: DemoData = DemoData.parse(raw);
