import { resolve } from "path";
import { HolocronPrd } from "./src/index.ts";
import { mkdir, writeFile, readFile, rm } from "fs/promises";

const mockClient = {
  app: {
    log: async (opts: any) => {
      console.log(`[LOG] ${opts.body.level}: ${opts.body.message}`);
    }
  }
};
const mock$ = {};

async function runTest() {
  console.log("Setting up test environment...");
  const testMemoryDir = resolve(__dirname, "../test-memory");
  process.env.HOLOCRON_MEMORY_DIR = testMemoryDir;

  console.log(`Using mock HOLOCRON_MEMORY_DIR: ${testMemoryDir}`);

  try {
    const pluginInstance = await HolocronPrd({ $: mock$ as any, client: mockClient as any, project: {} as any, directory: "", worktree: "", serverUrl: new URL("http://localhost") });
    
    console.log("\n--- Testing experimental.chat.system.transform hook ---");
    const output = { system: [] };
    if (pluginInstance["experimental.chat.system.transform"]) {
      await (pluginInstance["experimental.chat.system.transform"] as Function)({}, output);
      console.log("System Transform Output:", output.system[0]);
    } else {
      console.error("Hook experimental.chat.system.transform not found!");
    }

    console.log("\n--- Testing tool.execute.after hook ---");
    
    const slug = "test-slug-123";
    const workDir = resolve(testMemoryDir, "WORK", slug);
    await mkdir(workDir, { recursive: true });
    
    const prdPath = resolve(workDir, "PRD.md");
    const prdContent = `---
task: Test Task
slug: ${slug}
effort: standard
phase: execute
progress: 1/1
mode: interactive
---
## Test Content
`;
    await writeFile(prdPath, prdContent, 'utf-8');

    if (pluginInstance["tool.execute.after"]) {
      await (pluginInstance["tool.execute.after"] as Function)(
        { tool: "edit", args: { filePath: prdPath }, sessionID: "s1", callID: "c1" },
        { title: "", output: "", metadata: {} }
      );
    } else {
      console.error("Hook tool.execute.after not found!");
    }

    // Verify work.json exists and has content
    const workJsonPath = resolve(testMemoryDir, "STATE", "work.json");
    const workJson = await readFile(workJsonPath, 'utf8');
    console.log(`\nContents of work.json:\n${workJson}`);

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
     console.log("\nCleaning up test environment...");
     await rm(testMemoryDir, { recursive: true, force: true });
     console.log("Cleanup complete.");
  }
}

runTest();
