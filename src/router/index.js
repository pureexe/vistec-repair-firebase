import { createRouter, createWebHistory } from 'vue-router'
import { authState, authReady } from '../stores/auth.js'

const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  { path: '/finish-signin', name: 'finish-signin', component: () => import('../views/FinishSignInView.vue') },
  { path: '/request', name: 'request', component: () => import('../views/RequestView.vue'), meta: { auth: true } },
  { path: '/t/:code?', name: 'track', component: () => import('../views/TrackView.vue') },
  { path: '/my', name: 'my', component: () => import('../views/MyJobsView.vue'), meta: { auth: true } },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { auth: true } },
  { path: '/jobs', name: 'jobs', component: () => import('../views/JobsView.vue'), meta: { roles: ['contractor', 'technician', 'admin'] } },
  { path: '/jobs/:id', name: 'job', component: () => import('../views/JobDetailView.vue'), meta: { roles: ['contractor', 'technician', 'admin'] } },
  { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { roles: ['technician', 'admin'] } },
  { path: '/admin/master', name: 'master', component: () => import('../views/admin/MasterDataView.vue'), meta: { roles: ['admin'] } },
  { path: '/admin/users', name: 'users', component: () => import('../views/admin/UsersView.vue'), meta: { roles: ['admin'] } },
  { path: '/admin/qr', name: 'qr', component: () => import('../views/admin/QrView.vue'), meta: { roles: ['admin', 'technician'] } },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

export const router = createRouter({ history: createWebHistory(), routes, scrollBehavior: () => ({ top: 0 }) })

router.beforeEach(async (to) => {
  if (!to.meta.auth && !to.meta.roles) return true
  await authReady
  if (!authState.user) return { name: 'login', query: { next: to.fullPath } }
  if (to.meta.roles) {
    const r = authState.profile?.role || 'user'
    if (!to.meta.roles.includes(r)) return { name: 'home', query: { denied: '1' } }
  }
  return true
})
