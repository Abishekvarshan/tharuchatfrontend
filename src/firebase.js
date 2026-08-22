import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCjQq-LQKqUhjaaWGIJDJKg5M7GCqv6kXA',
  authDomain: 'chatapp-51616.firebaseapp.com',
  projectId: 'chatapp-51616',
  storageBucket: 'chatapp-51616.firebasestorage.app',
  messagingSenderId: '1058500642383',
  appId: '1:1058500642383:web:7c9ad074429356b29f8c3a',
  measurementId: 'G-8XCPQ93HY5',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
