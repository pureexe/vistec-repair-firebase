import { createApp } from 'vue'
import '@mdi/font/css/materialdesignicons.css'
import './styles/main.scss'
import App from './App.vue'
import { router } from './router/index.js'
import { i18n } from './i18n/index.js'
import { startMaster } from './stores/master.js'
import './stores/auth.js'

startMaster()
document.documentElement.lang = i18n.global.locale.value
createApp(App).use(i18n).use(router).mount('#app')
