// src/services/dbService.ts
import { Storage } from '@ionic/storage';
import { Network } from '@capacitor/network';
import { ref, set, update, remove } from 'firebase/database';
import { rtdb } from './firebase';
import { Product, SaleTransaction } from '../types';

let storage: Storage | null = null;

export const initStorage = async () => {
  if (!storage) {
    const s = new Storage();
    storage = await s.create();
  }
  return storage;
};

// --- PRODUCT / INVENTORY METHODS ---

export const getLocalProducts = async (): Promise<Product[]> => {
  const store = await initStorage();
  const products = (await store.get('products')) || [];
  return products;
};

export const saveProductLocalAndSync = async (product: Product): Promise<void> => {
  const store = await initStorage();
  let products = await getLocalProducts();
  const existingIdx = products.findIndex((p) => p.id === product.id);

  if (existingIdx >= 0) {
    products[existingIdx] = product;
  } else {
    products.push(product);
  }

  await store.set('products', products);

  // Sync to Firebase if online
  const status = await Network.getStatus();
  if (status.connected) {
    try {
      await set(ref(rtdb, `inventory/${product.id}`), product);
    } catch (err) {
      console.warn('Firebase RTDB sync postponed (queued offline):', err);
    }
  }
};

export const quickUpdateStockLocalAndSync = async (productId: string, addedPieces: number): Promise<void> => {
  const store = await initStorage();
  let products = await getLocalProducts();
  const target = products.find((p) => p.id === productId);
  if (target) {
    target.stockQty = Math.max(0, target.stockQty + addedPieces);
    target.updatedAt = Date.now();
    await store.set('products', products);

    const status = await Network.getStatus();
    if (status.connected) {
      try {
        await update(ref(rtdb, `inventory/${productId}`), {
          stockQty: target.stockQty,
          updatedAt: target.updatedAt,
        });
      } catch (err) {
        console.warn('Firebase RTDB stock update queued:', err);
      }
    }
  }
};

export const deleteProductLocalAndSync = async (productId: string): Promise<void> => {
  const store = await initStorage();
  let products = await getLocalProducts();
  products = products.filter((p) => p.id !== productId);
  await store.set('products', products);

  const status = await Network.getStatus();
  if (status.connected) {
    try {
      await remove(ref(rtdb, `inventory/${productId}`));
    } catch (err) {
      console.warn('Firebase RTDB delete queued:', err);
    }
  }
};

// --- TRANSACTION & CHECKOUT METHODS ---

export const processSale = async (
  cart: SaleTransaction['items'],
  totalAmount: number,
  cashReceived: number,
  changeGiven: number,
  paymentMethod: 'CASH' | 'GCASH' = 'CASH',
  referenceNumber?: string
): Promise<SaleTransaction> => {
  const store = await initStorage();
  const products = await getLocalProducts();

  // Deduct inventory stock
  cart.forEach((item) => {
    const product = products.find((p) => p.id === item.product.id);
    if (product) {
      const deduction = item.isTingi ? item.quantity : item.quantity * (product.piecesPerPack || 1);
      product.stockQty = Math.max(0, product.stockQty - deduction);
      product.updatedAt = Date.now();
    }
  });
  await store.set('products', products);

  const transaction: SaleTransaction = {
    id: `TX-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    timestamp: Date.now(),
    items: cart,
    totalAmount,
    cashReceived,
    changeGiven,
    paymentMethod,
    referenceNumber,
    syncedToFirebase: false,
  };

  // Save transaction locally
  const existingTx: SaleTransaction[] = (await store.get('transactions')) || [];
  existingTx.unshift(transaction);
  await store.set('transactions', existingTx);

  // Push to Firebase RTDB in background
  const net = await Network.getStatus();
  if (net.connected) {
    syncTransactionToCloud(transaction);
  }

  return transaction;
};

export const syncTransactionToCloud = async (tx: SaleTransaction) => {
  try {
    await set(ref(rtdb, `sales/${tx.id}`), { ...tx, syncedToFirebase: true });
    
    // Update local flag
    const store = await initStorage();
    const existingTx: SaleTransaction[] = (await store.get('transactions')) || [];
    const idx = existingTx.findIndex(t => t.id === tx.id);
    if (idx >= 0) {
      existingTx[idx].syncedToFirebase = true;
      await store.set('transactions', existingTx);
    }
  } catch (err) {
    console.error('Failed to sync transaction to RTDB:', err);
  }
};

// Full background sync trigger (invoked upon network reconnect)
export const syncAllPendingData = async () => {
  const store = await initStorage();
  const existingTx: SaleTransaction[] = (await store.get('transactions')) || [];
  const pending = existingTx.filter(tx => !tx.syncedToFirebase);

  for (const tx of pending) {
    await syncTransactionToCloud(tx);
  }
};

// Register listener for network status changes
Network.addListener('networkStatusChange', (status) => {
  if (status.connected) {
    syncAllPendingData();
  }
});