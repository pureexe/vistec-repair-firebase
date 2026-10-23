import { reactive } from 'vue'
export const toasts = reactive([])
let n = 0
export function toast(message, type = 'is-success', ms = 3500) {
  const id = ++n
  toasts.push({ id, message, type })
  setTimeout(() => { const i = toasts.findIndex((t) => t.id === id); if (i >= 0) toasts.splice(i, 1) }, ms)
}
export const toastError = (e) => toast(e?.message || String(e), 'is-danger', 6000)
