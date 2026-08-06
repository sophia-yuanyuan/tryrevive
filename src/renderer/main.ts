import { createApp } from "vue";
import { createPinia } from "pinia";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import { router } from "./router";
import "./styles.css";

const i18n = createI18n({
  legacy: false,
  locale: "zh-CN",
  fallbackLocale: "zh-CN",
  messages: {
    "zh-CN": {
      brand: "TryRevive",
      promise: "从真实进度继续"
    }
  }
});

createApp(App).use(createPinia()).use(router).use(i18n).mount("#app");
