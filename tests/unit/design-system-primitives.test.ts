import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { TrButton, TrChip, TrField } from "@/renderer/design-system/primitives";

describe("design-system primitives", () => {
  it("keeps the button native, typed, and unavailable while loading", () => {
    const wrapper = mount(TrButton, {
      props: { loading: true, type: "submit" },
      slots: { default: "保存进度" }
    });

    const button = wrapper.get("button");
    expect(button.attributes("type")).toBe("submit");
    expect(button.attributes("disabled")).toBeDefined();
    expect(button.attributes("aria-busy")).toBe("true");
    expect(button.text()).toContain("保存进度");
  });

  it("connects field label, help, invalid state, and model updates", async () => {
    const wrapper = mount(TrField, {
      props: { label: "项目名称", help: "只写你自己能认出的名字" }
    });

    const input = wrapper.get("input");
    const label = wrapper.get("label");
    expect(label.attributes("for")).toBe(input.attributes("id"));
    expect(input.attributes("aria-describedby")).toBe(wrapper.get(".tr-field-help").attributes("id"));

    await input.setValue("毕业作品");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["毕业作品"]);

    await wrapper.setProps({ error: "请填写项目名称" });
    expect(input.attributes("aria-invalid")).toBe("true");
    expect(wrapper.get('[role="alert"]').text()).toBe("请填写项目名称");
  });

  it("exposes chip selection as a pressed state and a native event", async () => {
    const wrapper = mount(TrChip, {
      props: { selected: true },
      slots: { default: "继续" }
    });

    expect(wrapper.get("button").attributes("aria-pressed")).toBe("true");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("select")).toHaveLength(1);
  });
});
