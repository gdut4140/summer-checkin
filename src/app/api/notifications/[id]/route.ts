// ============================================================
// Phase 3: 通知 API — 单条操作（标记已读 / 删除）
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-utils";
import { markAsRead, deleteNotification } from "@/lib/notification";

// PATCH /api/notifications/[id] — 标记单条已读
// Body: { read: true }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (body.read === true) {
      const ok = await markAsRead(id, user.id);
      if (!ok) {
        return NextResponse.json(
          { error: "Notification not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: "Invalid action. Send { read: true }" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Notification API] PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update notification" },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications/[id] — 删除单条通知
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ok = await deleteNotification(id, user.id);

    if (!ok) {
      return NextResponse.json(
        { error: "Notification not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Notification API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete notification" },
      { status: 500 }
    );
  }
}
