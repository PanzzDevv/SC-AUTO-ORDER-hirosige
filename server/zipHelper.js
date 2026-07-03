const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');

/**
 * Download files from Google Drive (or fallback local) and ZIP them.
 * @param {Array} accounts - array of account objects with driveFileId (new) or storagePath (legacy)
 * @param {string} orderId - order ID for naming the ZIP
 * @returns {string} local path to the generated ZIP
 */
async function createZipFromAccounts(accounts, orderId) {
  const tempDir = path.join(os.tmpdir(), `panzzstore_${orderId}`);
  const zipPath = path.join(os.tmpdir(), `order_${orderId}.zip`);

  // Create temp directory
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // Lazy-load Google Drive helper (avoid crash if env not configured for legacy-only orders)
  let downloadFileFromDrive;
  try {
    downloadFileFromDrive = require('./googleDrive').downloadFileFromDrive;
  } catch (_) {
    downloadFileFromDrive = null;
  }

  const downloadPromises = accounts.map(async (acc) => {
    const fileName = acc.fileName || path.basename(acc.driveFileId || acc.storagePath || 'account');
    const folderName = fileName.endsWith('.zip') ? fileName.slice(0, -4) : fileName;

    // Create a sub-folder for this account
    const accountDir = path.join(tempDir, folderName);
    if (!fs.existsSync(accountDir)) fs.mkdirSync(accountDir, { recursive: true });

    const destPath = path.join(accountDir, fileName);

    try {
      if (acc.driveFileId && downloadFileFromDrive) {
        // ─── BARU: Download dari Google Drive ────────────────────────────────
        console.log(`📥 Drive download: ${fileName} (ID: ${acc.driveFileId})`);
        await downloadFileFromDrive(acc.driveFileId, destPath);
      } else if (acc.storagePath) {
        // ─── LEGACY: Baca dari local storage ─────────────────────────────────
        const sourcePath = path.join(__dirname, '../storage/', acc.storagePath);
        if (!fs.existsSync(sourcePath)) {
          throw new Error('Local file not found: ' + sourcePath);
        }
        console.log(`📂 Local fallback: ${acc.storagePath}`);
        fs.copyFileSync(sourcePath, destPath);
      } else {
        throw new Error(`Akun ${acc.id}: tidak ada driveFileId maupun storagePath`);
      }

      // Extract zip contents jika file-nya .zip
      if (fileName.endsWith('.zip') && fs.existsSync(destPath)) {
        const zip = new AdmZip(destPath);
        zip.extractAllTo(accountDir, true);
        fs.unlinkSync(destPath);
      }
    } catch (err) {
      console.error(`Failed to process account ${acc.id || acc.fileName}:`, err.message);
    }
  });

  await Promise.all(downloadPromises);

  // Create ZIP archive
  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    // Level 1: tercepat (level 9 sangat lambat untuk file besar)
    const archive = archiver('zip', { zlib: { level: 1 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(tempDir, false);
    archive.finalize();
  });

  // Bersihkan temp dir
  fs.rmSync(tempDir, { recursive: true, force: true });

  return zipPath;
}

/**
 * Clean up a ZIP file after sending
 */
function cleanupZip(zipPath) {
  try {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}

module.exports = { createZipFromAccounts, cleanupZip };
