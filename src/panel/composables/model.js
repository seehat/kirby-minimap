import { usePanel } from "kirbyuse";

const modelIdCache = new Map();
let isListenersRegistered = false;

export function useModelId() {
  const panel = usePanel();
  const defaultLanguage = panel.languages.find((language) => language.default);

  // Ensure event listener is only set once
  if (!isListenersRegistered) {
    panel.events.on("model.update", invalidateCacheForCurrentView);
    panel.events.on("page.changeSlug", invalidateCacheForCurrentView);
    panel.events.on("page.changeTitle", invalidateCacheForCurrentView);
    isListenersRegistered = true;
  }

  function invalidateCacheForCurrentView() {
    modelIdCache.delete(panel.view.path);
  }

  async function getModelId() {
    const { path: id } = panel.view;

    if (modelIdCache.has(id)) {
      return modelIdCache.get(id);
    }

    const response = await panel.api.get(
      id,
      {
        select: ["id"],
        language: defaultLanguage?.code,
      },
      undefined,
      // Silent
      true,
    );

    modelIdCache.set(id, response.id);
    return response.id;
  }

  return {
    getModelId,
  };
}
