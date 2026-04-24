export function humanizeFindingType(value: string) {
  return value.replaceAll("_", " ");
}

export function compactFindingTypeLabel(type: string) {
  switch (type) {
    case "certificate_expired":
      return "cert expired";
    case "unmatched_target":
      return "no live target";
    case "docker_socket_write_mount":
      return "docker socket";
    case "management_surface":
      return "mgmt surface";
    case "off_host_target":
      return "off host";
    case "shared_forward_target":
      return "shared target";
    case "ambiguous_target":
      return "ambiguous";
    case "port_bypass":
      return "direct port";
    case "image_latest":
      return "unpinned image";
    case "image_stale":
      return "stale image";
    case "no_backup":
      return "no backup";
    default:
      return humanizeFindingType(type);
  }
}

export function compactFindingHeadline(type: string) {
  switch (type) {
    case "certificate_expired":
      return "Certificate expired";
    case "unmatched_target":
      return "No live target";
    case "docker_socket_write_mount":
      return "Docker socket exposed";
    case "management_surface":
      return "Public management surface";
    case "off_host_target":
      return "Routes off host";
    case "shared_forward_target":
      return "Shared forward target";
    case "ambiguous_target":
      return "Ambiguous target";
    case "port_bypass":
      return "Port published without proxy";
    case "image_latest":
      return "Unpinned image tag";
    case "image_stale":
      return "Image not refreshed recently";
    case "no_backup":
      return "No backup tool in stack";
    default:
      return humanizeFindingType(type);
  }
}

export function compactFindingNextCheck(type: string) {
  switch (type) {
    case "certificate_expired":
      return "Renew now";
    case "unmatched_target":
      return "Verify proxy target";
    case "docker_socket_write_mount":
      return "Tighten exposure";
    case "management_surface":
      return "Confirm public access";
    case "off_host_target":
      return "Verify remote dependency";
    case "shared_forward_target":
      return "Confirm extra hostname";
    case "ambiguous_target":
      return "Resolve the target";
    case "port_bypass":
      return "Remove host port binding or add proxy";
    case "image_latest":
      return "Pin to a specific version tag";
    case "image_stale":
      return "Pull latest and recreate";
    case "no_backup":
      return "Add a backup tool to the stack";
    default:
      return "Inspect path";
  }
}
