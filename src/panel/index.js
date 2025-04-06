import MinimapSidebar from "./components/MinimapSidebar.vue";
import "./index.css";

window.panel.plugin("johannschopplich/minimap", {
  use: [
    function minimapInjectionMixin(Vue) {
      Vue.mixin({
        mounted() {
          if (this.$options.name !== "k-panel-inside") return;

          const MinimapSidebarConstructor = Vue.extend(MinimapSidebar);
          const minimap = new MinimapSidebarConstructor({ parent: this });
          minimap.$mount();

          this.$el.appendChild(minimap.$el);
        },
      });
    },
  ],
});
