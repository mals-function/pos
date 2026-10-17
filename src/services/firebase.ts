// src/services/firebase.ts
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, onValue, push } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCKS6NiT1g5o2qU-VKbfMW0rkieR8mG0P8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "pos-5m.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://pos-5m-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "pos-5m",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "pos-5m.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "586810753042",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:586810753042:web:92675a896d15250b9b98cb"
};

export const app = initializeApp(firebaseConfig);
export const rtdb = getDatabase(app);
