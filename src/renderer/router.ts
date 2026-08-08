import { createRouter, createWebHashHistory } from "vue-router";
import WorkspaceView from "./views/WorkspaceView.vue";
import AboutView from "./views/AboutView.vue";
import CollectionView from "./views/CollectionView.vue";
import PrivacyView from "./views/PrivacyView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "workspace", component: WorkspaceView },
    { path: "/collection", name: "collection", component: CollectionView },
    { path: "/about", name: "about", component: AboutView },
    { path: "/privacy", name: "privacy", component: PrivacyView },
    { path: "/:pathMatch(.*)*", redirect: "/" }
  ],
  scrollBehavior: () => ({ top: 0 })
});
