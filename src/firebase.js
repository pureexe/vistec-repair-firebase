import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getStorage } from 'firebase/storage'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'missing-api-key', // placeholder keeps the UI rendering until .env is filled
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'vistec-repair.firebaseapp.com',
  databaseURL: env.VITE_FIREBASE_DATABASE_URL || 'https://vistec-repair-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'vistec-repair',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'vistec-repair.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
}

export const isConfigured = !!env.VITE_FIREBASE_API_KEY
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getDatabase(app)
export const storage = getStorage(app)
export const IMAGE_STORE = env.VITE_IMAGE_STORE === 'rtdb' ? 'rtdb' : 'storage'
export const MS_TENANT = env.VITE_MS_TENANT || ''
