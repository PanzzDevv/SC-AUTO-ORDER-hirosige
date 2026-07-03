require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

// ─── GOOGLE AUTH INIT ─────────────────────────────────────────────────────────
// Prioritas 1: File JSON Service Account (GOOGLE_SERVICE_ACCOUNT_PATH atau auto-detect)
// Prioritas 2: Environment variable GOOGLE_SERVICE_ACCOUNT_KEY (isi JSON dalam 1 baris)
function getAuthClient() {
  let credentials;

  // Coba baca dari path file
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.env.GOOGLE_SERVICE_ACCOUNT_PATH)
    : path.join(__dirname, '../googleServiceAccount.json');

  if (fs.existsSync(keyPath)) {
    credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    console.log('✅ Google Drive: menggunakan file', path.basename(keyPath));
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    console.log('✅ Google Drive: menggunakan env GOOGLE_SERVICE_ACCOUNT_KEY');
  } else {
    throw new Error(
      'Google Service Account tidak ditemukan. ' +
      'Letakkan file googleServiceAccount.json di root project, atau isi env GOOGLE_SERVICE_ACCOUNT_KEY.'
    );
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

let _drive = null;
function getDrive() {
  if (!_drive) {
    const auth = getAuthClient();
    _drive = google.drive({ version: 'v3', auth });
  }
  return _drive;
}

// ─── UPLOAD FILE KE GOOGLE DRIVE ─────────────────────────────────────────────
/**
 * Upload sebuah file ke Google Drive folder yang dikonfigurasi.
 * @param {string} filePath - Path absolut ke file yang akan diupload
 * @param {string} fileName - Nama file yang akan tampil di Drive
 * @param {string} [mimeType='application/zip'] - MIME type file
 * @returns {Promise<string>} Google Drive File ID
 */
async function uploadFileToDrive(filePath, fileName, mimeType = 'application/octet-stream') {
  const drive = getDrive();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error('GOOGLE_DRIVE_FOLDER_ID belum diset di .env');
  }

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType,
    body: fs.createReadStream(filePath),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, name, size',
  });

  console.log(`✅ Drive Upload: ${fileName} → ID: ${response.data.id} (${response.data.size} bytes)`);
  return response.data.id;
}

// ─── DOWNLOAD FILE DARI GOOGLE DRIVE ─────────────────────────────────────────
/**
 * Download file dari Google Drive ke local temp path.
 * @param {string} fileId - Google Drive File ID
 * @param {string} destPath - Path lokal tujuan simpan file
 * @returns {Promise<void>}
 */
async function downloadFileFromDrive(fileId, destPath) {
  const drive = getDrive();

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    response.data
      .on('error', reject)
      .pipe(dest)
      .on('finish', resolve)
      .on('error', reject);
  });
}

// ─── HAPUS FILE DARI GOOGLE DRIVE ────────────────────────────────────────────
/**
 * Hapus file dari Google Drive by File ID.
 * @param {string} fileId - Google Drive File ID
 * @returns {Promise<void>}
 */
async function deleteFileFromDrive(fileId) {
  const drive = getDrive();
  await drive.files.delete({ fileId });
  console.log(`🗑️ Drive Delete: File ID ${fileId} dihapus.`);
}

// ─── GET FILE INFO ────────────────────────────────────────────────────────────
/**
 * Ambil informasi file dari Drive (name, size, dll)
 * @param {string} fileId
 */
async function getFileInfo(fileId) {
  const drive = getDrive();
  const response = await drive.files.get({
    fileId,
    fields: 'id, name, size, mimeType',
  });
  return response.data;
}

module.exports = {
  uploadFileToDrive,
  downloadFileFromDrive,
  deleteFileFromDrive,
  getFileInfo,
};
