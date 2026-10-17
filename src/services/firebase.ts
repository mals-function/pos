// src/services/firebase.ts
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, onValue, push } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyCKS6NiT1g5o2qU-VKbfMW0rkieR8mG0P8",
  authDomain: "pos-5m.firebaseapp.com",
  databaseURL: "https://pos-5m-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "pos-5m",
  storageBucket: "pos-5m.firebasestorage.app",
  messagingSenderId: "586810753042",
  appId: "1:586810753042:web:92675a896d15250b9b98cb"
};

export const app = initializeApp(firebaseConfig);
export const rtdb = getDatabase(app);
