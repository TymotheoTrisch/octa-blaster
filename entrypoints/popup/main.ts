import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import { applyAppearanceToRoot, readCachedAppearance } from '@/services/appearance/themeTokens';

applyAppearanceToRoot(document.documentElement, readCachedAppearance());

createApp(App).mount('#app');
