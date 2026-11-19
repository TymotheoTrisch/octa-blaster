import { createApp } from 'vue';
import '../popup/style.css';
import './sidebar.css';
import App from '../popup/App.vue';
import { applyAppearanceToRoot, readCachedAppearance } from '@/services/appearance/themeTokens';

applyAppearanceToRoot(document.documentElement, readCachedAppearance());

createApp(App).mount('#app');
