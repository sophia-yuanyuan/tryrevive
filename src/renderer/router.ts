import { createRouter, createWebHashHistory } from "vue-router";
import WorkspaceView from "./views/WorkspaceView.vue";
import AboutView from "./views/AboutView.vue";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", name: "workspace", component: WorkspaceView },
    { path: "/about", name: "about", component: AboutView },
    { path: "/:pathMatch(.*)*", redirect: "/" }
  ],
  scrollBehavior: () => ({ top: 0 })
});
