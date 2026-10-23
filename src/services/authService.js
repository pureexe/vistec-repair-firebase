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
    'auth/invalid-credential': 'Invalid e-mail or password',
    'auth/wrong-password': 'Invalid e-mail or password',
    'auth/user-not-found': 'Invalid e-mail or password',
    'auth/email-already-in-use': 'E-mail already registered — please sign in',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/popup-closed-by-user': null
  }
  if (e?.code in map) return map[e.code]
  return e?.message || String(e)
}
