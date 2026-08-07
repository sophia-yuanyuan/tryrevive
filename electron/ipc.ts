export const IPC_CHANNELS = {
  loadState: "state:load",
  saveState: "state:save",
  exportState: "state:export",
  importState: "state:import",
  openExternal: "shell:open-external",
  cloudStatus: "cloud:status",
  redeemCloudCode: "cloud:redeem-code",
  quoteCloudContext: "cloud:quote-context",
  analyzeCloudContext: "cloud:analyze-context"
} as const;
