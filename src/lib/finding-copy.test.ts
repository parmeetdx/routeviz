import { describe, it, expect } from "vitest";
import {
  humanizeFindingType,
  compactFindingTypeLabel,
  compactFindingHeadline,
  compactFindingNextCheck,
} from "./finding-copy";

const knownTypes = [
  "certificate_expired",
  "unmatched_target",
  "docker_socket_write_mount",
  "management_surface",
  "off_host_target",
  "shared_forward_target",
  "ambiguous_target",
  "port_bypass",
  "image_latest",
  "image_stale",
  "no_backup",
  "intent_drift",
];

describe("humanizeFindingType", () => {
  it("replaces underscores with spaces", () => {
    expect(humanizeFindingType("no_auth_layer")).toBe("no auth layer");
  });

  it("handles single word", () => {
    expect(humanizeFindingType("error")).toBe("error");
  });

  it("handles multiple underscores", () => {
    expect(humanizeFindingType("a_b_c_d")).toBe("a b c d");
  });
});

describe("compactFindingTypeLabel", () => {
  it("returns specific short label for known types", () => {
    expect(compactFindingTypeLabel("certificate_expired")).toBe("cert expired");
    expect(compactFindingTypeLabel("unmatched_target")).toBe("no live target");
    expect(compactFindingTypeLabel("docker_socket_write_mount")).toBe("docker socket");
    expect(compactFindingTypeLabel("management_surface")).toBe("mgmt surface");
    expect(compactFindingTypeLabel("off_host_target")).toBe("off host");
    expect(compactFindingTypeLabel("shared_forward_target")).toBe("shared target");
    expect(compactFindingTypeLabel("ambiguous_target")).toBe("ambiguous");
    expect(compactFindingTypeLabel("port_bypass")).toBe("direct port");
    expect(compactFindingTypeLabel("image_latest")).toBe("unpinned image");
    expect(compactFindingTypeLabel("image_stale")).toBe("stale image");
    expect(compactFindingTypeLabel("no_backup")).toBe("no backup");
    expect(compactFindingTypeLabel("intent_drift")).toBe("intent drift");
  });

  it("falls back to humanized type for unknown types", () => {
    expect(compactFindingTypeLabel("some_unknown_type")).toBe("some unknown type");
  });

  it("returns a non-empty string for all known types", () => {
    for (const type of knownTypes) {
      expect(compactFindingTypeLabel(type).length).toBeGreaterThan(0);
    }
  });
});

describe("compactFindingHeadline", () => {
  it("returns specific headline for known types", () => {
    expect(compactFindingHeadline("certificate_expired")).toBe("Certificate expired");
    expect(compactFindingHeadline("unmatched_target")).toBe("No live target");
    expect(compactFindingHeadline("management_surface")).toBe("Public management surface");
    expect(compactFindingHeadline("port_bypass")).toBe("Port published without proxy");
    expect(compactFindingHeadline("intent_drift")).toBe("Exposure intent drift");
  });

  it("falls back to humanized type for unknown types", () => {
    expect(compactFindingHeadline("my_custom_type")).toBe("my custom type");
  });

  it("returns a non-empty string for all known types", () => {
    for (const type of knownTypes) {
      expect(compactFindingHeadline(type).length).toBeGreaterThan(0);
    }
  });
});

describe("compactFindingNextCheck", () => {
  it("returns specific action for known types", () => {
    expect(compactFindingNextCheck("certificate_expired")).toBe("Renew now");
    expect(compactFindingNextCheck("unmatched_target")).toBe("Verify proxy target");
    expect(compactFindingNextCheck("image_latest")).toBe("Pin to a specific version tag");
    expect(compactFindingNextCheck("no_backup")).toBe("Add a backup tool to the stack");
    expect(compactFindingNextCheck("intent_drift")).toBe("Review saved intent");
  });

  it("falls back to generic action for unknown types", () => {
    expect(compactFindingNextCheck("unknown_type")).toBe("Inspect path");
  });

  it("returns a non-empty string for all known types", () => {
    for (const type of knownTypes) {
      expect(compactFindingNextCheck(type).length).toBeGreaterThan(0);
    }
  });
});
