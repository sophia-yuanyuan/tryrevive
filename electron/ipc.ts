export const IPC_CHANNELS = {
  loadState: "state:load",
  saveState: "state:save",
  exportState: "state:export",
  importState: "state:import",
  openExternal: "shell:open-external"
} as const;
