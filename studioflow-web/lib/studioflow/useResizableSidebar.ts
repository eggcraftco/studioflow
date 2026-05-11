"use client";

import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type SetStateAction } from "react";
import { db, functions } from "@/lib/firebase/client";
import { withWebSyncStatus } from "@/lib/studioflow/syncStatus";

type ResizableSidebarOptions = {
  initialWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  collapsedWidth?: number;
  storageKey?: string;
  workspaceId?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useResizableSidebar({
  initialWidth = 360,
  minWidth = 260,
  maxWidth = 520,
  collapsedWidth = 64,
  storageKey,
  workspaceId
}: ResizableSidebarOptions = {}) {
  const [width, setWidth] = useState(initialWidth);
  const [collapsed, setCollapsedState] = useState(false);
  const widthRef = useRef(initialWidth);
  const collapsedRef = useRef(false);
  const resizingRef = useRef(false);

  function applyWidth(nextWidth: number) {
    const clean = clamp(nextWidth, minWidth, maxWidth);
    widthRef.current = clean;
    setWidth(clean);
    return clean;
  }

  function applyCollapsed(nextCollapsed: boolean) {
    collapsedRef.current = nextCollapsed;
    setCollapsedState(nextCollapsed);
    return nextCollapsed;
  }

  const saveCloudLayout = useCallback((nextWidth: number, nextCollapsed: boolean) => {
    if (!workspaceId) return;
    const cleanWidth = clamp(nextWidth, minWidth, maxWidth);
    const callable = httpsCallable<Record<string, unknown>, { ok?: boolean; layout?: { width?: number; visible?: boolean }; message?: string }>(
      functions,
      "saveWorkspaceSidebarLayout"
    );

    void withWebSyncStatus(async () => {
      const response = await callable({
        companyId: workspaceId,
        width: cleanWidth,
        visible: !nextCollapsed
      });

      if (response.data?.ok === false) {
        throw new Error(response.data.message || "Could not save sidebar layout.");
      }
    }, "Saving sidebar layout to cloud.").catch(() => {
      // The UI already updated locally; the cloud sync indicator records the failure.
    });
  }, [maxWidth, minWidth, workspaceId]);

  const setCollapsed = useCallback((nextValue: SetStateAction<boolean>) => {
    const nextCollapsed = typeof nextValue === "function"
      ? (nextValue as (current: boolean) => boolean)(collapsedRef.current)
      : nextValue;
    applyCollapsed(nextCollapsed);
    saveCloudLayout(widthRef.current, nextCollapsed);
  }, [saveCloudLayout]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const savedWidth = Number(window.localStorage.getItem(`${storageKey}:width`));
    const savedCollapsed = window.localStorage.getItem(`${storageKey}:collapsed`);
    if (Number.isFinite(savedWidth) && savedWidth > 0) applyWidth(savedWidth);
    if (savedCollapsed === "true") applyCollapsed(true);
  }, [maxWidth, minWidth, storageKey]);

  useEffect(() => {
    if (!workspaceId) return;
    return onSnapshot(doc(db, "companySettings", workspaceId), snapshot => {
      if (resizingRef.current) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      const cloudWidth = Number(data.ordersSidebarWidth);
      const cloudVisible = data.ordersSidebarVisible;
      if (Number.isFinite(cloudWidth) && cloudWidth > 0) applyWidth(cloudWidth);
      if (typeof cloudVisible === "boolean") applyCollapsed(!cloudVisible);
    });
  }, [maxWidth, minWidth, workspaceId]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(`${storageKey}:width`, String(width));
    window.localStorage.setItem(`${storageKey}:collapsed`, String(collapsed));
  }, [collapsed, storageKey, width]);

  const startResize = useCallback((event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    if (collapsedRef.current) applyCollapsed(false);
    resizingRef.current = true;

    const startX = event.clientX;
    const startWidth = widthRef.current;
    let latestWidth = startWidth;

    function handleMove(moveEvent: globalThis.PointerEvent) {
      latestWidth = applyWidth(startWidth + moveEvent.clientX - startX);
    }

    function handleUp() {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      resizingRef.current = false;
      saveCloudLayout(latestWidth, false);
    }

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }, [maxWidth, minWidth, saveCloudLayout]);

  const workspaceStyle = useMemo(() => ({
    "--studio-sidebar-width": `${collapsed ? collapsedWidth : width}px`
  }) as CSSProperties, [collapsed, collapsedWidth, width]);

  return {
    collapsed,
    setCollapsed,
    startResize,
    workspaceStyle
  };
}
