import { createRouter, createWebHashHistory } from "vue-router";
import LandingView from "./views/LandingView.vue";
import WorkspaceView from "./views/WorkspaceView.vue";
import AboutView from "./views/AboutView.vue";
import CollectionView from "./views/CollectionView.vue";
import HelpView from "./views/HelpView.vue";
import NotFoundView from "./views/NotFoundView.vue";
import PrivacyView from "./views/PrivacyView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "landing", component: LandingView },
    { path: "/start", alias: "/projects", name: "workspace", component: WorkspaceView },
    { path: "/collection", name: "collection", component: CollectionView },
    { path: "/help", name: "help", component: HelpView },
    { path: "/about", name: "about", component: AboutView },
    { path: "/privacy", name: "privacy", component: PrivacyView },
    { path: "/:pathMatch(.*)*", name: "not-found", component: NotFoundView }
  ],
  scrollBehavior: () => ({ top: 0 })
});
