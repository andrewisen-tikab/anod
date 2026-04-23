import fs from "fs";
import path from "path";
import { rolldown } from "rolldown";

const outputDir = "./dist";

async function build() {
  console.log("1. Bundling with Rolldown...");

  const bundle = await rolldown({
    input: {
      index: "./src/anod.ts",
    },
    external: ["anod-core", "anod-list"],
  });

  const { output } = await bundle.generate({
    dir: outputDir,
    format: "esm",
    entryFileNames: "[name].js",
  });

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const chunk of output) {
    if (chunk.type === "chunk") {
      fs.writeFileSync(path.resolve(outputDir, chunk.fileName), chunk.code);
    }
  }

  console.log("Success! Output written to dist/");
}

build().catch(console.error);
