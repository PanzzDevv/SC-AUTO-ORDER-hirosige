require('dotenv').config();
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// ─── FIREBASE INIT ────────────────────────────────────────────────────────────
// Prioritas 1: Gunakan serviceAccountKey.json jika ada di root project
// Prioritas 2: Gunakan environment variables dari .env
let serviceAccount;

const jsonKeyPath = path.join(__dirname, '../serviceAccountKey.json');
if (fs.existsSync(jsonKeyPath)) {
  serviceAccount = require(jsonKeyPath);
  console.log('✅ Firebase: menggunakan serviceAccountKey.json');
} else {
  serviceAccount = {
    type: 'service_account',
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
  };
  console.log('✅ Firebase: menggunakan environment variables');
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// ─── USERS ────────────────────────────────────────────────────────────────────
async function getUser(telegramId) {
  const doc = await db.collection('users').doc(String(telegramId)).get();
  return doc.exists ? doc.data() : null;
}

async function createUser(telegramId, username, firstName) {
  const userData = {
    telegramId: String(telegramId),
    username: username || '',
    firstName: firstName || '',
    saldo: 0,
    totalOrders: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection('users').doc(String(telegramId)).set(userData);
  return userData;
}

async function getUserOrCreate(telegramId, username, firstName) {
  let user = await getUser(telegramId);
  if (!user) user = await createUser(telegramId, username, firstName);
  return user;
}

async function updateUserSaldo(telegramId, amount) {
  await db.collection('users').doc(String(telegramId)).update({
    saldo: admin.firestore.FieldValue.increment(amount),
  });
}

// ─── ACCOUNTS (STOCK) ─────────────────────────────────────────────────────────
async function getAvailableAccounts(type, garansi, qty) {
  const snapshot = await db.collection('accounts')
    .where('type', '==', type)
    .where('garansi', '==', garansi)
    .where('status', '==', 'available')
    .limit(qty)
    .get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getStockCount(type, garansi) {
  const snapshot = await db.collection('accounts')
    .where('type', '==', type)
    .where('garansi', '==', garansi)
    .where('status', '==', 'available')
    .get();
  return snapshot.size;
}

async function getStockItems(type, garansi) {
  const snapshot = await db.collection('accounts')
    .where('type', '==', type)
    .where('garansi', '==', garansi)
    .where('status', '==', 'available')
    .get();
  
  const items = [];
  snapshot.forEach(doc => {
    items.push({ id: doc.id, ...doc.data() });
  });
  return items;
}

async function getAllStock() {
  const categories = [
    { type: 'muda', garansi: true,  label: 'Akun Muda + Garansi' },
    { type: 'muda', garansi: false, label: 'Akun Muda + No Garansi' },
    { type: 'tua',  garansi: true,  label: 'Akun Tua + Garansi' },
    { type: 'tua',  garansi: false, label: 'Akun Tua + No Garansi' },
  ];
  const result = [];
  for (const cat of categories) {
    const items = await getStockItems(cat.type, cat.garansi);
    result.push({ 
      ...cat, 
      count: items.length, 
      items: items.map(i => ({ 
        id: i.id, 
        fileName: i.fileName || 'Unknown File', 
        createdAt: i.createdAt ? (typeof i.createdAt.toDate === 'function' ? i.createdAt.toDate().toISOString() : i.createdAt) : null 
      })) 
    });
  }
  return result;
}

async function deleteStockCategory(type, garansi) {
  const fs = require('fs');
  const path = require('path');
  const { deleteFileFromDrive } = require('./googleDrive');

  const snapshot = await db.collection('accounts')
    .where('type', '==', type)
    .where('garansi', '==', garansi)
    .where('status', '==', 'available')
    .get();

  const batch = db.batch();
  const deletePromises = [];

  snapshot.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'deleted',
      deletedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const data = doc.data();

    // Hapus dari Google Drive jika ada driveFileId
    if (data.driveFileId) {
      deletePromises.push(
        deleteFileFromDrive(data.driveFileId).catch(err =>
          console.error('Error deleting Drive file:', data.driveFileId, err.message)
        )
      );
    }

    // Fallback: hapus dari local jika masih ada storagePath lama
    if (data.storagePath) {
      try {
        const fullPath = path.join(__dirname, '..', data.storagePath);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      } catch (err) {
        console.error('Error deleting local file:', data.storagePath, err.message);
      }
    }
  });

  if (!snapshot.empty) {
    await batch.commit();
  }
  await Promise.allSettled(deletePromises);
}

async function markAccountsSold(accountIds) {
  const batch = db.batch();
  accountIds.forEach(id => {
    batch.update(db.collection('accounts').doc(id), {
      status: 'sold',
      soldAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
}

/**
 * Tambah akun baru ke Firestore.
 * @param {string} type - 'muda' atau 'tua'
 * @param {boolean} garansi
 * @param {string} driveFileId - Google Drive File ID
 * @param {string} fileName - nama file asli
 * @param {string} [storagePath] - (legacy) path lokal lama, opsional
 */
async function addAccount(type, garansi, driveFileId, fileName, storagePath = null) {
  return await db.collection('accounts').add({
    type,
    garansi,
    status: 'available',
    driveFileId,
    fileName,
    ...(storagePath ? { storagePath } : {}),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
async function createOrder(userId, username, type, garansi, qty, totalPrice, paymentUrl, pakasirOrderId) {
  const orderData = {
    userId: String(userId),
    username: username || '',
    type,
    garansi,
    qty,
    totalPrice,
    paymentUrl,
    pakasirOrderId,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('orders').add(orderData);
  return { id: ref.id, ...orderData };
}

async function getOrder(orderId) {
  const doc = await db.collection('orders').doc(orderId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getOrderByPakasirId(pakasirOrderId) {
  const snapshot = await db.collection('orders')
    .where('pakasirOrderId', '==', pakasirOrderId)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function updateOrderStatus(orderId, status, extra = {}) {
  await db.collection('orders').doc(orderId).update({
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
}

async function getAllOrders(limitN = 50) {
  const snapshot = await db.collection('orders')
    .orderBy('createdAt', 'desc')
    .limit(limitN)
    .get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getOrderStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todaySnapshot = await db.collection('orders')
    .where('status', '==', 'done')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(today))
    .get();
  const totalSnapshot = await db.collection('orders')
    .where('status', '==', 'done')
    .get();
  let todayRevenue = 0;
  todaySnapshot.docs.forEach(d => { todayRevenue += d.data().totalPrice || 0; });
  let totalRevenue = 0;
  totalSnapshot.docs.forEach(d => { totalRevenue += d.data().totalPrice || 0; });
  return {
    todayOrders: todaySnapshot.size,
    todayRevenue,
    totalOrders: totalSnapshot.size,
    totalRevenue,
  };
}

// ─── PRICES ───────────────────────────────────────────────────────────────────
async function getPrices() {
  const doc = await db.collection('settings').doc('prices').get();
  if (doc.exists) return doc.data();
  // Default prices
  return {
    muda_garansi: 50000,
    muda_no_garansi: 30000,
    tua_garansi: 80000,
    tua_no_garansi: 60000,
  };
}

async function updatePrices(prices) {
  await db.collection('settings').doc('prices').set(prices, { merge: true });
}

function getPriceKey(type, garansi) {
  return `${type}_${garansi ? 'garansi' : 'no_garansi'}`;
}

module.exports = {
  db, admin,
  getUser, createUser, getUserOrCreate, updateUserSaldo,
  getAvailableAccounts, getStockCount, getStockItems, getAllStock, markAccountsSold, addAccount, deleteStockCategory,
  createOrder, getOrder, getOrderByPakasirId, updateOrderStatus, getAllOrders, getOrderStats,
  getPrices, updatePrices, getPriceKey,
};
