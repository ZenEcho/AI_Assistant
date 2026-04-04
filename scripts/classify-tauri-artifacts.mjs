import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, "package.json");
const releaseDir = path.join(rootDir, "src-tauri", "target", "release");
const bundleDir = path.join(releaseDir, "bundle");

const platformNameMap = {
  win32: "windows",
  darwin: "macos",
  linux: "linux",
};

const archNameMap = {
  x64: "x64",
  arm64: "arm64",
};

const portableExtensionsByPlatform = {
  win32: [".exe"],
  darwin: [],
  linux: [],
};

const symbolExtensionsByPlatform = {
  win32: [".pdb"],
  darwin: [],
  linux: [],
};

function normalizeRelativePath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

function getPlatformName() {
  return platformNameMap[process.platform] ?? process.platform;
}

function getArchName() {
  return archNameMap[process.arch] ?? process.arch;
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readProjectVersion() {
  const raw = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(raw);
  return typeof packageJson.version === "string" && packageJson.version.trim().length > 0
    ? packageJson.version.trim()
    : "0.0.0";
}

async function listFilesRecursively(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function listDirectFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(directory, entry.name));
}

async function ensureCleanDirectory(directory) {
  const artifactsRoot = path.join(rootDir, "artifacts");
  const resolvedArtifactsRoot = path.resolve(artifactsRoot);
  const resolvedDirectory = path.resolve(directory);

  if (!resolvedDirectory.startsWith(resolvedArtifactsRoot)) {
    throw new Error(`Refusing to clear a path outside artifacts/: ${resolvedDirectory}`);
  }

  await rm(resolvedDirectory, {
    force: true,
    recursive: true,
  });
  await mkdir(resolvedDirectory, {
    recursive: true,
  });
}

async function copyArtifact(sourcePath, targetPath, category, collectedArtifacts) {
  await mkdir(path.dirname(targetPath), {
    recursive: true,
  });
  await cp(sourcePath, targetPath);

  const fileStat = await stat(sourcePath);

  collectedArtifacts.push({
    category,
    source: normalizeRelativePath(sourcePath),
    output: normalizeRelativePath(targetPath),
    size: fileStat.size,
  });
}

async function main() {
  if (!(await pathExists(releaseDir))) {
    throw new Error("未找到 src-tauri/target/release，请先执行 pnpm tauri build。");
  }

  const version = await readProjectVersion();
  const platformName = getPlatformName();
  const archName = getArchName();
  const outputDir = path.join(
    rootDir,
    "artifacts",
    "tauri",
    `v${version}`,
    `${platformName}-${archName}`,
  );

  await ensureCleanDirectory(outputDir);

  const collectedArtifacts = [];
  const portableExtensions = portableExtensionsByPlatform[process.platform] ?? [];
  const symbolExtensions = symbolExtensionsByPlatform[process.platform] ?? [];

  if (await pathExists(bundleDir)) {
    const bundleFiles = await listFilesRecursively(bundleDir);

    for (const sourcePath of bundleFiles) {
      const relativeFromBundle = path.relative(bundleDir, sourcePath);
      const targetPath = path.join(outputDir, "installers", relativeFromBundle);

      await copyArtifact(sourcePath, targetPath, "installer", collectedArtifacts);
    }
  }

  const releaseFiles = await listDirectFiles(releaseDir);

  for (const sourcePath of releaseFiles) {
    const extension = path.extname(sourcePath).toLowerCase();
    const fileName = path.basename(sourcePath);

    if (portableExtensions.includes(extension)) {
      const targetPath = path.join(outputDir, "portable", fileName);
      await copyArtifact(sourcePath, targetPath, "portable", collectedArtifacts);
      continue;
    }

    if (symbolExtensions.includes(extension)) {
      const targetPath = path.join(outputDir, "symbols", fileName);
      await copyArtifact(sourcePath, targetPath, "symbol", collectedArtifacts);
    }
  }

  const summary = {
    version,
    platform: platformName,
    arch: archName,
    generatedAt: new Date().toISOString(),
    sourceReleaseDir: normalizeRelativePath(releaseDir),
    outputDir: normalizeRelativePath(outputDir),
    categories: {
      installers: "适合直接分发给用户的安装包",
      portable: "可直接运行的便携版程序",
      symbols: "调试符号，通常仅开发排障时保留",
    },
    artifacts: collectedArtifacts,
  };

  const summaryPath = path.join(outputDir, "summary.json");
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Artifacts organized into ${normalizeRelativePath(outputDir)}`);

  for (const artifact of collectedArtifacts) {
    console.log(`[${artifact.category}] ${artifact.output}`);
  }

  console.log(`[summary] ${normalizeRelativePath(summaryPath)}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
