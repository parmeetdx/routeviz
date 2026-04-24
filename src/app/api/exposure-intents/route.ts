import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { deleteExposureIntent, isExposureIntentMode, saveExposureIntent } from "@/lib/routeviz-server";

export const dynamic = "force-dynamic";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/routes");
  revalidatePath("/findings");
  revalidatePath("/setup");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { routeSlug, mode } = (body ?? {}) as Record<string, unknown>;

  if (typeof routeSlug !== "string" || !routeSlug) {
    return NextResponse.json({ ok: false, error: "routeSlug is required." }, { status: 400 });
  }
  if (typeof mode !== "string" || !isExposureIntentMode(mode)) {
    return NextResponse.json({ ok: false, error: "Invalid mode." }, { status: 400 });
  }

  try {
    await saveExposureIntent(routeSlug, mode);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save exposure intent." },
      { status: 400 },
    );
  }

  revalidateAll();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { routeSlug } = (body ?? {}) as Record<string, unknown>;

  if (typeof routeSlug !== "string" || !routeSlug) {
    return NextResponse.json({ ok: false, error: "routeSlug is required." }, { status: 400 });
  }

  try {
    await deleteExposureIntent(routeSlug);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not delete exposure intent." },
      { status: 400 },
    );
  }

  revalidateAll();
  return NextResponse.json({ ok: true });
}
