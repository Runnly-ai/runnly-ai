import fs from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const root = process.cwd();
  const sourceDir = path.join(root, 'modules', 'db', 'schema');
  const targetDir = path.join(root, 'dist', 'modules', 'db', 'schema');

  await fs.mkdir(targetDir, { recursive: true });
  const files = await fs.readdir(sourceDir, { withFileTypes: true });

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith('.sql')) {
      continue;
    }
    const sourcePath = path.join(sourceDir, file.name);
    const targetPath = path.join(targetDir, file.name);
    await fs.copyFile(sourcePath, targetPath);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
