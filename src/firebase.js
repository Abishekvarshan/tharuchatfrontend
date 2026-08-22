import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCjQq-LQKqUhjaaWGIJDJKg5M7GCqv6kXA',
  authDomain: 'chatapp-51616.firebaseapp.com',
  projectId: 'chatapp-51616',
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || 'https://chatapp-51616-default-rtdb.asia-southeast1.firebasedatabase.app',
  storageBucket: 'chatapp-51616.firebasestorage.app',
  messagingSenderId: '1058500642383',
  appId: '1:1058500642383:web:7c9ad074429356b29f8c3a',
  measurementId: 'G-8XCPQ93HY5',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
