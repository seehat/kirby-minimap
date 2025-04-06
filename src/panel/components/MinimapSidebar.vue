<script setup>
import { computed, ref, useContent, usePanel, watch } from "kirbyuse";
import { useBlocks } from "../composables/blocks";
import {
  useEventListener,
  useIntersectionObserver,
} from "../composables/listeners";
import { useModelId } from "../composables/model";

const OPEN_STATE_STORAGE_KEY = "kirby$minimap";
const panel = usePanel();
const { currentContent, contentChanges } = useContent();
const { getModelId } = useModelId();
const { getBlockIcon, extractBlockText, scrollToBlock } = useBlocks();

const minimap = ref();
const toggleButton = ref();
const isOpen = ref(
  localStorage.getItem(OPEN_STATE_STORAGE_KEY) === "true" || false,
);

const fields = ref({});
const activeFieldNames = ref([]);
const activeBlockIds = ref([]);
// Track previously observed block IDs to manage cleanup
const observedBlockIds = new Set();

const resolvedFields = computed(() =>
  Object.fromEntries(
    Object.entries(fields.value)
      .filter(([_, field]) => field.type !== "hidden")
      .map(([key, field]) => {
        const content = contentChanges.value[key] ?? currentContent.value[key];
        const blocks =
          field.type === "blocks" && Array.isArray(content)
            ? content.map((block) => ({
                ...block,
                isActive: activeBlockIds.value.includes(block.id),
              }))
            : [];

        return [
          key,
          {
            ...field,
            blocks,
            isActive: activeFieldNames.value.includes(field.name),
          },
        ];
      }),
  ),
);

watch(isOpen, (newValue) => {
  localStorage.setItem(OPEN_STATE_STORAGE_KEY, newValue);
  updateMinimapWidth(newValue);
});

// Watch for changes in content to update observers for blocks
watch(
  [currentContent, contentChanges],
  () => {
    if (Object.keys(fields.value).length === 0) return;
    updateBlockObservers();
  },
  { deep: true },
);

useEventListener(minimap, "click", (event) => {
  // Prevent the click event from bubbling up to the menu
  // See: https://github.com/getkirby/kirby/blob/938fe98951cace6c77aab744779bf4e0799ad705/panel/src/panel/menu.js#L124
  event.stopPropagation();

  if (toggleButton.value?.$el.contains(event.target)) {
    toggle();
  }
});

const observer = useIntersectionObserver({
  rootMargin: "0px",
  threshold: 0,
});

(async () => {
  // Set the initial width of the minimap based on the open state
  updateMinimapWidth(isOpen.value);

  // Get height from top of the page to the bottom of the header
  const header = document.querySelector(".k-header");
  const bottomEdge = header
    ? header.getBoundingClientRect().top +
      Number.parseFloat(getComputedStyle(header).paddingTop)
    : 0;
  setCssProperty("--minimap-top-offset", `${bottomEdge}px`);

  // Fetch model ID for the current Panel view
  const modelId = await getModelId();

  // Fetch all resolved fields for the current model
  fields.value = await panel.api.get(
    "__minimap__/model-fields",
    { id: modelId ?? "site" },
    undefined,
    // Silent
    true,
  );

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log("Current content:", currentContent.value);
    // eslint-disable-next-line no-console
    console.log("Model fields:", fields.value);
  }

  // Observe field elements
  for (const fieldName of Object.keys(fields.value)) {
    const fieldElement = document.querySelector(`.k-field-name-${fieldName}`);
    if (!fieldElement) continue;

    observer.observe(fieldElement, (isIntersecting) => {
      if (isIntersecting) {
        activeFieldNames.value.push(fieldName);
      } else {
        activeFieldNames.value = activeFieldNames.value.filter(
          (name) => name !== fieldName,
        );
      }
    });
  }

  // Initial setup of block observers
  updateBlockObservers();
})();

function updateBlockObservers() {
  if (!observer) return;

  // Track new block IDs that need to be observed
  const currentBlockIds = new Set();

  // Add observers for all blocks in all block fields
  for (const field of Object.values(fields.value)) {
    if (field.type !== "blocks") continue;

    const content =
      contentChanges.value[field.name] ?? currentContent.value[field.name];
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      currentBlockIds.add(block.id);

      // Skip if already observing this block
      if (observedBlockIds.has(block.id)) continue;

      const blockElement = document.querySelector(`[data-id="${block.id}"]`);
      if (!blockElement) continue;

      observer.observe(blockElement, (isIntersecting) => {
        if (isIntersecting) {
          activeBlockIds.value.push(block.id);
        } else {
          activeBlockIds.value = activeBlockIds.value.filter(
            (id) => id !== block.id,
          );
        }
      });

      // Add to tracked blocks
      observedBlockIds.add(block.id);
    }
  }

  // Unobserve and remove blocks that no longer exist
  const deletedBlockIds = [...observedBlockIds].filter(
    (id) => !currentBlockIds.has(id),
  );

  for (const id of deletedBlockIds) {
    // Remove from active blocks if it was active
    activeBlockIds.value = activeBlockIds.value.filter(
      (activeId) => activeId !== id,
    );

    // Remove from observed blocks
    observedBlockIds.delete(id);

    // Try to unobserve the element (even though it might be gone from DOM)
    const element = document.querySelector(`[data-id="${id}"]`);
    if (element) {
      observer.unobserve(element);
    }
  }
}

function toggle() {
  isOpen.value = !isOpen.value;
}

function updateMinimapWidth(isOpen = false) {
  setCssProperty(
    "--minimap-width",
    isOpen ? "var(--minimap-width-open)" : "var(--minimap-width-closed)",
  );
}

function setCssProperty(property, value) {
  document.documentElement.style.setProperty(property, value);
}

function scrollToField(fieldName) {
  const fieldElement = document.querySelector(`.k-field-name-${fieldName}`);
  if (!fieldElement) return;

  fieldElement.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  // Close the mobile menu
  // See: https://github.com/getkirby/kirby/blob/938fe98951cace6c77aab744779bf4e0799ad705/panel/src/panel/menu.js#L25
  if (window.matchMedia?.("(max-width: 60rem)").matches) {
    panel.menu.close();
  }
}
</script>

<template>
  <nav ref="minimap" class="k-panel-minimap">
    <div class="k-panel-minimap-body">
      <menu>
        <template v-for="field in Object.values(resolvedFields)">
          <div :key="field.name">
            <div
              class="k-panel-minimap-menu-item"
              :class="[
                isOpen
                  ? 'km-py-[var(--spacing-2)]'
                  : 'km-py-[var(--spacing-3)]',
              ]"
              :data-active="String(field.isActive)"
              @click="scrollToField(field.name)"
            >
              <template v-if="isOpen">
                <span class="k-label-text km-font-[var(--font-semi)]">
                  {{ field.label }}
                </span>
                <span
                  v-if="field.required"
                  :title="panel.t('field.required')"
                  class="km-font-[var(--font-semi)] km-text-[var(--theme-color-600)] km-ms-[var(--spacing-1)]"
                  data-theme="negative"
                  v-text="'✶'"
                />
              </template>
              <div v-else class="km-h-px km-flex-1 km-bg-[var(--color-text)]" />
            </div>
            <template v-if="field.type === 'blocks' && field.blocks.length">
              <div
                v-for="(block, blockIndex) in field.blocks"
                :key="`${blockIndex}-${block.id}`"
                class="k-panel-minimap-menu-item km-flex km-py-[var(--spacing-1)] km-items-center km-gap-[var(--spacing-2)]"
                :data-active="String(block.isActive)"
                @click="scrollToBlock(block.id)"
              >
                <k-icon :type="getBlockIcon(block.type)" />
                <span class="k-label-text">
                  {{ extractBlockText(block) }}
                </span>
              </div>
            </template>
          </div>
        </template>
      </menu>
    </div>

    <k-button
      ref="toggleButton"
      :icon="isOpen ? 'angle-right' : 'angle-left'"
      :title="isOpen ? panel.t('collapse') : panel.t('expand')"
      size="xs"
      class="k-panel-minimap-toggle"
    />
  </nav>
</template>

<style>
.k-panel-minimap {
  position: fixed;
  inset-inline-end: 0;
  inset-block: 0;
  z-index: var(--z-navigation);
  display: var(--menu-display);
  width: var(--minimap-width);
  background-color: var(--color-background);
  box-shadow: var(--menu-shadow);
}

.k-panel-minimap-body {
  padding-block: var(--menu-padding);
  overscroll-behavior: contain;
  overflow-x: hidden;
  overflow-y: auto;
  height: 100%;
}

.k-panel-minimap-toggle {
  --button-align: flex-start;
  --button-height: 100%;
  --button-width: var(--menu-toggle-width);
  position: absolute;
  inset-block: 0;
  inset-inline-end: 100%;
  align-items: flex-start;
  border-radius: 0;
  overflow: visible;
  opacity: 0;
  transition: opacity 0.2s;
}

.k-panel-minimap-toggle:focus {
  outline: 0;
}

.k-panel-minimap-toggle .k-button-icon {
  display: grid;
  place-items: center;
  height: var(--menu-toggle-height);
  width: var(--menu-toggle-width);
  margin-top: var(--menu-padding);
  border-block: 1px solid var(--menu-color-border);
  border-inline-start: 1px solid var(--menu-color-border);
  background: var(--color-background);
  border-start-start-radius: var(--button-rounded);
  border-end-start-radius: var(--button-rounded);
}

.k-panel-minimap-toggle:focus-visible .k-button-icon {
  outline: var(--outline);
  border-radius: var(--button-rounded);
}

.k-panel-minimap-menu-item {
  cursor: pointer;
  border-inline-start-width: 2px;
  border-inline-start-style: solid;
  border-inline-start-color: transparent;
  padding-inline: var(--menu-padding);
}

.k-panel-minimap-menu-item:hover {
  background-color: var(--menu-color-back);
}

.k-panel-minimap-menu-item[data-active="true"] {
  border-inline-start-color: var(--color-focus);
}

.k-panel-minimap-highlight {
  animation: highlight-pulse 2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes highlight-pulse {
  0%,
  100% {
    box-shadow: none;
  }
  50% {
    box-shadow: inset 0 0 0 2px var(--color-focus, currentColor);
  }
}

@media (min-width: 60rem) {
  .k-panel-minimap {
    border-left: 1px solid var(--menu-color-border);
  }

  .k-panel-minimap-body {
    padding-top: calc(var(--minimap-top-offset) + var(--spacing-1));
  }

  .k-panel-minimap-toggle:focus-visible,
  .k-panel-minimap:hover .k-panel-minimap-toggle {
    opacity: 1;
  }

  .k-panel-minimap-toggle:focus-visible .k-button-icon {
    outline: var(--outline);
    border-radius: var(--button-rounded);
  }

  .k-panel-minimap-menu-item {
    border-inline-start-width: 1px;
  }
}
</style>
