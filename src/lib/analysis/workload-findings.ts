import type { RouteRecord, WorkloadFinding } from "@/lib/routeviz-types";
import type { DockerWorkload } from "@/lib/collectors/docker";
import { stripImageToBaseName, suppressionKey } from "@/lib/analysis/route-findings";

export const BACKUP_TOOL_IMAGES = new Set([
  "duplicati", "duplicacy", "restic", "borgbackup", "borg",
  "rclone", "rsnapshot", "backrest", "kopia",
  "syncthing",
  "borgmatic", "volumerize", "offen-backup",
  "backup-tools", "docker-vackup",
]);

export const PERSISTENT_PATH_PREFIXES = [
  "/home", "/data", "/storage", "/media", "/var/lib",
  "/config", "/configs", "/opt", "/srv", "/mnt",
  "/backup", "/backups", "/volumes",
];

function isMountPersistent(mountPath: string): boolean {
  const lower = mountPath.toLowerCase();
  return PERSISTENT_PATH_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function createWorkloadFindings(
  workloads: DockerWorkload[],
  routes: RouteRecord[],
  suppressed: Set<string>,
): WorkloadFinding[] {
  const findings: WorkloadFinding[] = [];
  const routeLinkedWorkloadIds = new Set(routes.flatMap((r) => r.relatedWorkloads.map((w) => w.name)));

  const projectsWithBackup = new Set<string>();
  for (const workload of workloads) {
    const baseName = stripImageToBaseName(workload.image);
    const serviceNameLower = (workload.serviceName ?? "").toLowerCase();
    if (BACKUP_TOOL_IMAGES.has(baseName) || BACKUP_TOOL_IMAGES.has(serviceNameLower)) {
      if (workload.composeProject) projectsWithBackup.add(workload.composeProject);
    }
  }

  for (const workload of workloads) {
    const isLatestTag = workload.image.endsWith(":latest") ||
      (!workload.image.includes(":") && workload.image.includes("/")) ||
      (workload.image.split(":").length === 1);

    const unproxiedPorts = workload.publishedPorts.filter((port) => {
      const isAllInterfaces = port.hostIp === null || port.hostIp === "0.0.0.0" || port.hostIp === "::";
      return isAllInterfaces && !routeLinkedWorkloadIds.has(workload.name);
    });
    const dedupedPorts = unproxiedPorts.filter(
      (port, idx, arr) => arr.findIndex((p) => p.publicPort === port.publicPort) === idx,
    );

    if (dedupedPorts.length > 0 && !suppressed.has(suppressionKey("port_bypass", workload.name))) {
      const portList = dedupedPorts.map((p) => `${p.publicPort}→${p.privatePort}`).join(", ");
      findings.push({
        id: `${workload.id}-port_bypass`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "port_bypass",
        severity: "medium",
        title: `${workload.name} is publishing ports directly without a proxy`,
        evidence: `Port${dedupedPorts.length > 1 ? "s" : ""} ${portList} bound to all interfaces with no matching proxy route.`,
        nextCheck: "Confirm this is intentional. If the service should only be reached through a reverse proxy, remove the host port binding.",
      });
    }

    // ── IMAGE VERSION CHECKS ───────────────────────────────────────────────
    const { imageUpdateStatus, latestImageTag } = workload;

    // Confirmed outdated — pinned semver and latest is higher
    if (imageUpdateStatus === "outdated" && !suppressed.has(suppressionKey("image_outdated", workload.name))) {
      findings.push({
        id: `${workload.id}-image_outdated`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "image_outdated",
        severity: "low",
        title: `${workload.name} is running an outdated image`,
        evidence: `Running ${workload.image} — latest available on Docker Hub is ${latestImageTag}.`,
        nextCheck: "Update the image tag in your compose file and recreate the container.",
      });
    }

    // Unpinned (:latest or untagged) — nudge to check + pin
    if (isLatestTag && !suppressed.has(suppressionKey("image_latest", workload.name))) {
      const nudge = imageUpdateStatus === "unknown" && latestImageTag
        ? ` Latest stable release on Docker Hub is ${latestImageTag} — verify your running container matches it.`
        : "";
      findings.push({
        id: `${workload.id}-image_latest`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "image_latest",
        severity: "low",
        title: `${workload.name} is running an unpinned image tag`,
        evidence: `Image: ${workload.image}. Using :latest or an untagged image means updates are unpredictable — the container may silently change behaviour after a pull.${nudge}`,
        nextCheck: "Pin the image to a specific version tag in your compose file to get predictable, auditable deployments.",
      });
    }

    // No data at all — private registry or image not on Docker Hub
    if (imageUpdateStatus === "no_data" && !isLatestTag && !suppressed.has(suppressionKey("image_no_data", workload.name))) {
      findings.push({
        id: `${workload.id}-image_no_data`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "image_no_data",
        severity: "low",
        title: `${workload.name} version can't be checked`,
        evidence: `Running ${workload.image}. No version information was found on Docker Hub — the image may be from a private registry or not published there.`,
        nextCheck: "Check the image source manually and confirm the running version is current.",
      });
    }

    // Pinned but non-semver (can't compare) — nudge to check manually
    if (!isLatestTag && imageUpdateStatus === "unknown" && latestImageTag && !suppressed.has(suppressionKey("image_check", workload.name))) {
      findings.push({
        id: `${workload.id}-image_check`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "image_check",
        severity: "low",
        title: `${workload.name} may have a newer version available`,
        evidence: `Running ${workload.image}. Latest tag on Docker Hub is ${latestImageTag} — version scheme can't be compared automatically.`,
        nextCheck: "Check the project's release page to confirm whether an upgrade is needed.",
      });
    }

    if (workload.createdAt && !suppressed.has(suppressionKey("image_stale", workload.name))) {
      const ageMs = Date.now() - new Date(workload.createdAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      if (ageDays > 180) {
        findings.push({
          id: `${workload.id}-image_stale`,
          workloadId: workload.id,
          workloadName: workload.name,
          type: "image_stale",
          severity: "low",
          title: `${workload.name} has not been recreated in ${ageDays} days`,
          evidence: `Container started ${ageDays} days ago (${workload.createdAt.slice(0, 10)}). Long-running containers may be missing security patches from newer image releases.`,
          nextCheck: "Pull the latest image and recreate the container to pick up any upstream security fixes.",
        });
      }
    }

    const persistentMounts = workload.mounts.filter(isMountPersistent);
    const hasBackupInStack = workload.composeProject ? projectsWithBackup.has(workload.composeProject) : false;
    if (persistentMounts.length > 0 && !hasBackupInStack && !suppressed.has(suppressionKey("no_backup", workload.name))) {
      findings.push({
        id: `${workload.id}-no_backup`,
        workloadId: workload.id,
        workloadName: workload.name,
        type: "no_backup",
        severity: "low",
        title: `${workload.name} has persistent storage with no backup tool detected`,
        evidence: `Mount${persistentMounts.length > 1 ? "s" : ""}: ${persistentMounts.slice(0, 3).join(", ")}${persistentMounts.length > 3 ? ` +${persistentMounts.length - 3} more` : ""}. No known backup tool found in the compose stack.`,
        nextCheck: "Add a backup tool (Duplicati, Restic, Kopia, etc.) to the stack, or confirm an external backup solution covers these paths.",
      });
    }
  }

  return findings;
}
