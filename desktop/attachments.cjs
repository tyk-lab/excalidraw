const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ATTACHMENT_PROTOCOL = "attachment:";

function attachmentsDirectory(documentPath) {
  return path.join(path.dirname(documentPath), "attachments");
}

function resolveAttachment(documentPath, relativePath) {
  if (
    typeof relativePath !== "string" ||
    !relativePath ||
    relativePath.includes("\\") ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error("附件路径无效");
  }
  const root = attachmentsDirectory(documentPath);
  const filename = path.resolve(path.dirname(documentPath), relativePath);
  const relative = path.relative(root, filename);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("附件必须位于图纸的附件目录中");
  }
  return filename;
}

async function importAttachments(documentPath, sourcePaths) {
  if (!documentPath) {
    throw new Error("UNSAVED_DOCUMENT");
  }
  const root = attachmentsDirectory(documentPath);
  await fs.mkdir(root, { recursive: true });
  const folderName = path.basename(root);
  const imported = [];
  for (const sourcePath of sourcePaths) {
    const extension = path.extname(sourcePath).slice(0, 16);
    const storedName = `${randomUUID()}${extension}`;
    await fs.copyFile(sourcePath, path.join(root, storedName));
    imported.push({
      name: path.basename(sourcePath),
      relativePath: `${folderName}/${storedName}`,
    });
  }
  return imported;
}

function referencedAttachmentPaths(scene) {
  const paths = new Set();
  for (const element of scene.elements || []) {
    if (element.link?.startsWith(ATTACHMENT_PROTOCOL)) {
      try {
        paths.add(
          decodeURIComponent(element.link.slice(ATTACHMENT_PROTOCOL.length)),
        );
      } catch {
        // Invalid references remain untouched and will report an error on open.
      }
    }
  }
  return paths;
}

async function copyAttachmentsForSaveAs(
  scene,
  oldDocumentPath,
  newDocumentPath,
) {
  if (
    !oldDocumentPath ||
    path.resolve(oldDocumentPath) === path.resolve(newDocumentPath)
  ) {
    return;
  }
  for (const relativePath of referencedAttachmentPaths(scene)) {
    const source = resolveAttachment(oldDocumentPath, relativePath);
    const destination = resolveAttachment(newDocumentPath, relativePath);
    if (path.resolve(source) === path.resolve(destination)) {
      continue;
    }
    await fs.mkdir(path.dirname(destination), { recursive: true });
    try {
      await fs.copyFile(source, destination);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

module.exports = {
  ATTACHMENT_PROTOCOL,
  copyAttachmentsForSaveAs,
  importAttachments,
  resolveAttachment,
};
