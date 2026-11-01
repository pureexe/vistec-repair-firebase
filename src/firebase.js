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

/** Read a boolean switch from .env. Unset/blank = default, so existing setups keep working. */
const flag = (raw, def = true) => {
  if (raw == null || String(raw).trim() === '') return def
  return !/^(false|0|no|off|disabled|hide)$/i.test(String(raw).trim())
}

/**
 * Which sign-in methods the login screen offers. Turn one off when the matching provider is
 * not enabled in Firebase Console → Authentication → Sign-in method; otherwise the button is
 * shown and fails with auth/operation-not-allowed (or auth/configuration-not-found).
 * NB: read each var as a static `env.VITE_…` property rather than `env[name]`, so Vite can see
 * which vars are used and inline them into the build.
 */
export const AUTH_METHODS = {
  microsoft: flag(env.VITE_AUTH_MICROSOFT),
  google: flag(env.VITE_AUTH_GOOGLE),
  password: flag(env.VITE_AUTH_PASSWORD),
  emailLink: flag(env.VITE_AUTH_EMAIL_LINK)
}
export const hasAnyAuthMethod = Object.values(AUTH_METHODS).some(Boolean)
