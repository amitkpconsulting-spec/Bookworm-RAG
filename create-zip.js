import AdmZip from "adm-zip";
import fs from "fs";
import path from "path";

async function main() {
  try {
    console.log("Generating knowledge-io-docker.zip...");
    const zip = new AdmZip();

    const filesToInclude = [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "index.html",
      "server.ts",
      ".env.example",
      "Dockerfile",
      "docker-compose.yml",
      "README-DOCKER.md",
      "setup.bat",
      "start.bat"
    ];

    // Add individual files
    for (const file of filesToInclude) {
      if (fs.existsSync(file)) {
        zip.addLocalFile(file);
        console.log(`Added file: ${file}`);
      }
    }

    // Add src directory recursively
    if (fs.existsSync("src")) {
      zip.addLocalFolder("src", "src");
      console.log("Added directory: src");
    }

    // Save zip file
    const destPath = path.join(process.cwd(), "knowledge-io-docker.zip");
    zip.writeZip(destPath);
    console.log(`Zip archive successfully created at: ${destPath}`);
  } catch (err) {
    console.error("Failed to generate zip file:", err);
    process.exit(1);
  }
}

main();
