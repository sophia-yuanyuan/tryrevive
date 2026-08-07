const PACKAGED_RENDERER_PROTOCOL = "app:";
const PACKAGED_RENDERER_HOST = "renderer";

export function isTrustedRendererUrl(senderUrl: string, developmentUrl?: string): boolean {
  try {
    const sender = new URL(senderUrl);
    if (sender.username || sender.password) return false;

    if (developmentUrl) {
      const development = new URL(developmentUrl);
      return sender.origin === development.origin;
    }

    return (
      sender.protocol === PACKAGED_RENDERER_PROTOCOL &&
      sender.hostname === PACKAGED_RENDERER_HOST &&
      !sender.port
    );
  } catch {
    return false;
  }
}
