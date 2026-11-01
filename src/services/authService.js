import {
  OAuthProvider, GoogleAuthProvider, signInWithPopup, signInWithRedirect, linkWithPopup, unlink,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, updateProfile, signOut,
  EmailAuthProvider, linkWithCredential
} from 'firebase/auth'
import { auth, MS_TENANT } from '../firebase.js'

export function microsoftProvider() {
  const p = new OAuthProvider('microsoft.com')
  p.setCustomParameters({ prompt: 'select_account', ...(MS_TENANT ? { tenant: MS_TENANT } : {}) })
  p.addScope('email'); p.addScope('profile')
  return p
}
export function googleProvider() {
  const p = new GoogleAuthProvider()
  p.setCustomParameters({ prompt: 'select_account' })
  return p
}
export const providerFor = (id) => (id === 'microsoft.com' ? microsoftProvider() : googleProvider())

/** Popup first; fall back to redirect when popups are blocked (some in-app mobile browsers). */
export async function signInWith(id) {
  const p = providerFor(id)
  try {
    return await signInWithPopup(auth, p)
  } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      return signInWithRedirect(auth, p)
    }
    throw e
  }
}

export async function registerEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName) await updateProfile(cred.user, { displayName })
  await sendEmailVerification(cred.user, { url: location.origin + '/' })
  return cred
}
export const loginEmail = (email, password) => signInWithEmailAndPassword(auth, email, password)
export const resetPassword = (email) => sendPasswordResetEmail(auth, email)

export async function sendLoginLink(email) {
  await sendSignInLinkToEmail(auth, email, { url: location.origin + '/finish-signin', handleCodeInApp: true })
  try { localStorage.setItem('emailForSignIn', email) } catch {}
}
export const isLoginLink = (url) => isSignInWithEmailLink(auth, url)
export async function completeLoginLink(email, url) {
  const cred = await signInWithEmailLink(auth, email, url)
  try { localStorage.removeItem('emailForSignIn') } catch {}
  return cred
}

export const linkProvider = (id) => linkWithPopup(auth.currentUser, providerFor(id))
export const linkPassword = (password) =>
  linkWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, password))
export const unlinkProvider = (id) => unlink(auth.currentUser, id)
export const logout = () => signOut(auth)

/** Turn Firebase auth errors into a friendly message key / text */
export function authErrorMessage(e, t) {
  if (e?.code === 'auth/account-exists-with-different-credential' || e?.code === 'auth/credential-already-in-use') {
    return t('auth.accountExists', { methods: e.customData?.email || '' })
  }
  const map = {
    'auth/invalid-credential': 'auth.badCredential',
    'auth/wrong-password': 'auth.badCredential',
    'auth/user-not-found': 'auth.badCredential',
    'auth/email-already-in-use': 'auth.emailInUse',
    'auth/weak-password': 'auth.weakPassword',
    // Project-side setup problems. These mean the Firebase console is not configured for
    // this project — not that the user typed something wrong — so say what to fix.
    'auth/configuration-not-found': 'auth.notConfigured',
    'auth/operation-not-allowed': 'auth.providerDisabled',
    'auth/invalid-api-key': 'auth.apiKeyInvalid',
    'auth/api-key-not-valid-please-pass-a-valid-api-key': 'auth.apiKeyInvalid',
    'auth/unauthorized-domain': 'auth.unauthorizedDomain',
    'auth/popup-closed-by-user': null
  }
  if (e?.code in map) { const key = map[e.code]; return key ? t(key) : null }
  return e?.message || String(e)
}
