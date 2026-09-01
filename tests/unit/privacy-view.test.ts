import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyView from "@/renderer/views/PrivacyView.vue";

const mocks = vi.hoisted(() => ({
  cloudStatus: vi.fn(),
  openExternal: vi.fn()
}));

vi.mock("@/renderer/platform/web", () => ({
  platform: {
    kind: "desktop",
    cloudStatus: mocks.cloudStatus,
    exportCloudData: vi.fn(),
    deleteCloudSourceContent: vi.fn(),
    deleteCloudAccount: vi.fn(),
    openExternal: mocks.openExternal
  }
}));

describe("privacy center OpenAI disclosure", () => {
  beforeEach(() => {
    mocks.cloudStatus.mockReset().mockResolvedValue({
      available: false,
      authenticated: false,
      balance: null,
      message: "云端处理当前关闭"
    });
    mocks.openExternal.mockReset().mockResolvedValue(undefined);
  });

  it("explains the stable anonymous identifier before cloud use", async () => {
    const wrapper = mount(PrivacyView, {
      global: {
        stubs: {
          RouterLink: { template: "<a><slot /></a>" }
        }
      }
    });
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("随机云账号 ID、固定用途前缀和 SHA-256");
    expect(text).toContain("OpenAI 可以据此关联同一匿名账号的多次分析请求");
    expect(text).toContain("原始账号 ID、会话令牌、姓名、邮箱、项目名、文件名和材料内容");
    expect(text).toContain("默认最长保留 30 天");
    expect(text).toContain("如果法律要求");
    expect(text).toContain("保护服务与第三方免受伤害");

    await wrapper.get("button.text-button").trigger("click");
    expect(mocks.openExternal).toHaveBeenCalledWith(
      "https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint"
    );
  });
});
