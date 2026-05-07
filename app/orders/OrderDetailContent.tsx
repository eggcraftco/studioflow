"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { CardIconGlyph, CardTitle, type CardIcon } from "@/components/CardTitle";
import { hiddenMoneyLabel, usePricePrivacy } from "@/components/PricePrivacy";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  CLIENT_FILE_ACCEPT,
  canManageClientFilesForRole,
  clientFileSizeLabel,
  clientFileTypeLabel,
  deleteClientFileForOrder,
  isClientFileImage,
  renameClientFileForOrder,
  uploadClientFileForOrder
} from "@/lib/studioflow/clientFiles";
import {
  DEFAULT_ORDER_DETAIL_CARD_LAYOUT,
  ORDER_WORKSPACE_LAYOUT_KEY,
  layoutFromOrderWorkspaceSnapshotJSON,
  loadOrderDetailCardLayout,
  resetIndependentOrderCardLayout,
  saveIndependentOrderCardLayout,
  saveOrderDetailCardLayout,
  subscribeOrderDetailCardLayout,
  type OrderDetailCardId,
  type OrderDetailCardLayout
} from "@/lib/studioflow/cardLayouts";
import {
  loadWorkspaceBlockHeadings,
  saveWorkspaceBlockHeadings,
  WEB_BLOCK_HEADING_CARD_IDS,
  type BlockHeadingSettings,
  type HeadingItem,
  type ScheduleHeadingItem
} from "@/lib/studioflow/blockHeadings";
import {
  canEditOrderDetailsForRole,
  canEditOrderFullyForRole,
  canEditOrderStatusForRole,
  ORDER_PREVIEW_IMAGE_ACCEPT,
  updateOrderFromWeb,
  uploadOrderPreviewImage,
  type CreateOrderInput,
  type UpdateOrderInput
} from "@/lib/studioflow/orders";
import {
  loadWorkspaceStatusOptions,
  loadTeamAccessData,
  type ClientFileDetail,
  type OrderDetail,
  type TeamMemberDetail,
  type ToDoDetail,
  type WorkspaceContext,
  type WorkspaceSettingsOverview
} from "@/lib/studioflow/firestore";
import { formatStudioMoney, moneySymbol, type StudioMoneySettings } from "@/lib/studioflow/money";

function formatDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatShortDate(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}

function formatDateTime(date: Date | null) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function statusCustomToggleStorageKey(toggle: HeadingItem) {
  return `statusToggle::${toggle.id.trim().toLowerCase()}`;
}

function statusCustomToggleValue(values: Record<string, boolean>, toggle: HeadingItem) {
  const stableKey = statusCustomToggleStorageKey(toggle);
  const legacyUUIDKey = `statusToggle::${toggle.id.trim()}`;
  return values[stableKey] ?? values[legacyUUIDKey] ?? values[toggle.title] ?? false;
}

function orderMoney(value: number, hidden: boolean, settings: StudioMoneySettings) {
  if (hidden) return hiddenMoneyLabel(moneySymbol(settings));
  return formatStudioMoney(value, settings);
}

function uploadSafetyAcceptanceKey(workspaceId: string) {
  return `studioflow-upload-policy-accepted:${workspaceId}`;
}

function dateInputValue(date: Date | null) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function dateFromInputValue(value: string | undefined) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(part => Number(part));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function addCalendarDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function escapeCalendarText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function safeCalendarFileName(value: string) {
  return (value || "studioflow-order")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "studioflow-order";
}

function orderCalendarTitle(order: OrderDetail) {
  const parts = [order.customerName, order.designName]
    .map(part => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : "Order";
}

function orderCalendarNotes(order: OrderDetail) {
  const lines = [
    order.customerName ? `Customer: ${order.customerName}` : "",
    order.designName ? `Design: ${order.designName}` : "",
    order.watchRef ? `Reference: ${order.watchRef}` : "",
    order.id ? `Order ID: ${order.id}` : "",
    `Created: ${formatDate(order.paymentDate)}`,
    `Delivery Due: ${formatDate(order.dueDate)}`
  ].filter(Boolean);
  return lines.join("\n");
}

function todoReminderTitle(task: ToDoDetail) {
  const title = task.title.trim();
  return title || "To Do";
}

function todoReminderNotes(order: OrderDetail, task: ToDoDetail) {
  const assignee = [task.assignedToEmail, task.assignedToUid]
    .map(value => value.trim())
    .find(Boolean) ?? "";
  const lines = [
    order.customerName ? `Customer: ${order.customerName}` : "",
    order.designName ? `Design: ${order.designName}` : "",
    assignee ? `Assigned to: ${assignee}` : "",
    task.priority ? `Priority: ${task.priority}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

function todoReminderDueDate(task: ToDoDetail) {
  if (task.dueAt) return task.dueAt;
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function todoReminderPriorityValue(priority: string) {
  const normalized = priority.trim().toLowerCase();
  if (["high", "urgent", "blocked", "overdue"].includes(normalized)) return "1";
  if (["low"].includes(normalized)) return "9";
  return "5";
}

function todoItemsSignature(items: ToDoDetail[]) {
  return items
    .map(item => [
      item.id,
      item.title,
      item.note,
      item.assignedToUid,
      item.assignedToEmail,
      item.dueAt?.getTime() ?? "",
      item.priority,
      item.isDone ? "1" : "0"
    ].join("|"))
    .join("||");
}

function downloadOrderCalendarFile(order: OrderDetail) {
  if (!order.paymentDate || !order.dueDate) {
    throw new Error("Created date and delivery due date are needed before exporting a calendar event.");
  }

  const title = orderCalendarTitle(order);
  const startDate = calendarDateValue(order.paymentDate);
  const endDate = calendarDateValue(addCalendarDays(order.dueDate, 1));
  const uid = `studioflow-${order.id || safeCalendarFileName(title)}@eggcraft`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EGGcraft//StudioFlow//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(uid)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${startDate}`,
    `DTEND;VALUE=DATE:${endDate}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(orderCalendarNotes(order))}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeCalendarFileName(title)}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadTodoReminderFile(order: OrderDetail, task: ToDoDetail) {
  const title = todoReminderTitle(task);
  const dueDate = calendarDateValue(todoReminderDueDate(task));
  const uid = `studioflow-todo-${order.id || "order"}-${task.id || safeCalendarFileName(title)}@eggcraft`;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EGGcraft//StudioFlow//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTODO",
    `UID:${escapeCalendarText(uid)}`,
    `DTSTAMP:${stamp}`,
    `DUE;VALUE=DATE:${dueDate}`,
    `SUMMARY:${escapeCalendarText(title)}`,
    `DESCRIPTION:${escapeCalendarText(todoReminderNotes(order, task))}`,
    `PRIORITY:${todoReminderPriorityValue(task.priority)}`,
    `STATUS:${task.isDone ? "COMPLETED" : "NEEDS-ACTION"}`,
    "END:VTODO",
    "END:VCALENDAR"
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeCalendarFileName(title)}-reminder.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todoPdfStatus(task: ToDoDetail) {
  if (task.isDone) return "Done";
  if (isOverdue(task.dueAt)) return "Overdue";
  return "Open";
}

function todoPdfMeta(order: OrderDetail, task: ToDoDetail) {
  const assignee = [task.assignedToEmail, task.assignedToUid]
    .map(value => value.trim())
    .find(Boolean) || "Unassigned";
  return [
    `Assigned: ${assignee}`,
    `Priority: ${task.priority || "Normal"}`,
    `Due: ${formatDate(task.dueAt)}`,
    order.id ? `Order ID: ${order.id}` : ""
  ].filter(Boolean);
}

function todoPdfHtml(order: OrderDetail, tasks: ToDoDetail[], workspaceName: string) {
  const sortedTasks = tasks;
  const openCount = sortedTasks.filter(task => !task.isDone).length;
  const doneCount = sortedTasks.filter(task => task.isDone).length;
  const overdueCount = sortedTasks.filter(task => !task.isDone && isOverdue(task.dueAt)).length;
  const orderName = order.customerName.trim() || order.designName.trim() || "Order";
  const designName = order.designName.trim() || "-";
  const rows = sortedTasks.length === 0
    ? `<div class="empty">No tasks here</div>`
    : sortedTasks.map(task => {
      const status = todoPdfStatus(task);
      const tone = task.isDone ? "done" : status === "Overdue" ? "overdue" : "open";
      const note = task.note.trim();
      return `
        <article class="task ${tone}">
          <div class="check">${task.isDone ? "✓" : ""}</div>
          <div class="task-body">
            <div class="task-title-row">
              <strong>${escapeHtml(task.title.trim() || "To Do")}</strong>
              <span class="status ${tone}">${escapeHtml(status)}</span>
            </div>
            <div class="meta">${todoPdfMeta(order, task).map(item => `<span>${escapeHtml(item)}</span>`).join("")}</div>
            ${note ? `<p>${escapeHtml(note)}</p>` : ""}
          </div>
        </article>
      `;
    }).join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>To Do PDF - ${escapeHtml(orderName)}</title>
        <style>
          @page { size: A4; margin: 24mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202126; background: #fff; }
          .page { max-width: 780px; margin: 0 auto; padding: 32px 34px; }
          header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid #ddd; padding-bottom: 18px; margin-bottom: 18px; }
          .brand { color: #8b8f96; font-size: 12px; font-weight: 700; }
          .doc-title { text-align: right; color: rgba(30, 32, 38, 0.32); font-size: 28px; font-weight: 900; letter-spacing: .04em; }
          .summary { padding: 14px; border-radius: 12px; background: rgba(23, 25, 35, .035); margin-bottom: 16px; }
          .summary h1 { margin: 0 0 7px; font-size: 20px; }
          .summary div { display: flex; flex-wrap: wrap; gap: 12px; color: #777c84; font-size: 11px; font-weight: 700; }
          .task { display: flex; gap: 10px; align-items: flex-start; margin: 9px 0; }
          .check { width: 22px; height: 22px; border: 2px solid #a0a4aa; border-radius: 999px; display: grid; place-items: center; color: #34c759; font-size: 14px; font-weight: 900; flex: 0 0 auto; margin-top: 8px; }
          .task.done .check { border-color: #34c759; background: rgba(52, 199, 89, .08); }
          .task.overdue .check { border-color: #ff3b30; }
          .task-body { flex: 1; border: 1px solid rgba(18, 133, 255, .12); background: rgba(18, 133, 255, .045); border-radius: 10px; padding: 11px 12px; }
          .task.done .task-body { border-color: rgba(52, 199, 89, .14); background: rgba(52, 199, 89, .045); }
          .task.overdue .task-body { border-color: rgba(255, 59, 48, .16); background: rgba(255, 59, 48, .045); }
          .task-title-row { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
          .task-title-row strong { font-size: 13px; line-height: 1.3; }
          .status { border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 900; white-space: nowrap; color: #1285ff; background: rgba(18, 133, 255, .1); }
          .status.done { color: #2fbf55; background: rgba(52, 199, 89, .11); }
          .status.overdue { color: #ff3b30; background: rgba(255, 59, 48, .1); }
          .meta { display: flex; flex-wrap: wrap; gap: 8px 12px; color: #7e838b; font-size: 10px; font-weight: 700; margin-top: 7px; }
          p { margin: 7px 0 0; color: #777c84; font-size: 11px; line-height: 1.45; }
          .empty { padding: 14px; border-radius: 10px; color: #80848b; background: rgba(23, 25, 35, .04); font-size: 13px; font-weight: 700; }
          footer { border-top: 1px solid #ddd; margin-top: 22px; padding-top: 10px; text-align: center; color: #8b8f96; font-size: 10px; }
          @media print { .page { padding: 0; } }
        </style>
      </head>
      <body>
        <main class="page">
          <header>
            <div class="brand">${escapeHtml(workspaceName || "StudioFlow")}</div>
            <div class="doc-title">TO DO PDF</div>
          </header>
          <section class="summary">
            <h1>${escapeHtml(orderName)}</h1>
            <div>
              <span>Design Name: ${escapeHtml(designName)}</span>
              <span>Open: ${openCount}</span>
              <span>Done: ${doneCount}</span>
              <span>Overdue: ${overdueCount}</span>
            </div>
          </section>
          ${rows}
          <footer>Generated automatically from StudioFlow</footer>
        </main>
      </body>
    </html>`;
}

function openTodoPdfPrint(order: OrderDetail, tasks: ToDoDetail[], workspaceName: string) {
  const popup = window.open("", "_blank", "width=900,height=1100");
  if (!popup) throw new Error("The To Do PDF window could not be opened. Please allow pop-ups for this page.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(todoPdfHtml(order, tasks, workspaceName));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

function historyPdfHtml(order: OrderDetail, logs: OrderDetail["historyLog"], workspaceName: string) {
  const orderName = order.customerName.trim() || order.designName.trim() || "Order";
  const designName = order.designName.trim() || "-";
  const rows = logs.length === 0
    ? `<div class="empty">No history yet. Important changes will appear here.</div>`
    : logs.map(item => {
      const oldValue = item.oldValue.trim() || "-";
      const newValue = item.newValue.trim() || "-";
      return `
        <article class="history-row">
          <div class="timeline">
            <span></span>
            <i></i>
          </div>
          <div class="history-body">
            <div class="history-title-row">
              <strong>${escapeHtml(item.title || "Update")}</strong>
              <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
            </div>
            <div class="change-row">
              <span>${escapeHtml(oldValue)}</span>
              <b>→</b>
              <strong>${escapeHtml(newValue)}</strong>
            </div>
          </div>
        </article>
      `;
    }).join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>History Log PDF - ${escapeHtml(orderName)}</title>
        <style>
          @page { size: A4; margin: 24mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202126; background: #fff; }
          .page { max-width: 780px; margin: 0 auto; padding: 32px 34px; }
          header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid #ddd; padding-bottom: 18px; margin-bottom: 18px; }
          .brand { color: #8b8f96; font-size: 12px; font-weight: 700; }
          .doc-title { text-align: right; color: rgba(30, 32, 38, 0.32); font-size: 28px; font-weight: 900; letter-spacing: .04em; }
          .summary { padding: 14px; border-radius: 12px; background: rgba(23, 25, 35, .035); margin-bottom: 16px; }
          .summary h1 { margin: 0 0 7px; font-size: 20px; }
          .summary div { display: flex; flex-wrap: wrap; gap: 12px; color: #777c84; font-size: 11px; font-weight: 700; }
          .history-row { display: flex; gap: 10px; align-items: stretch; margin: 8px 0; }
          .timeline { width: 20px; flex: 0 0 auto; display: grid; justify-items: center; padding-top: 10px; }
          .timeline span { width: 16px; height: 16px; border-radius: 999px; background: rgba(18, 133, 255, .18); position: relative; }
          .timeline span::after { content: ""; position: absolute; inset: 5px; border-radius: 999px; background: #1285ff; }
          .timeline i { width: 1px; min-height: 32px; background: rgba(18, 133, 255, .18); display: block; }
          .history-body { flex: 1; border: 1px solid rgba(18, 133, 255, .12); background: rgba(18, 133, 255, .045); border-radius: 10px; padding: 11px 12px; }
          .history-title-row { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
          .history-title-row strong { font-size: 13px; line-height: 1.3; }
          .history-title-row span { color: #7e838b; font-size: 10px; font-weight: 800; white-space: nowrap; }
          .change-row { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 8px; align-items: start; margin-top: 7px; color: #7e838b; font-size: 11px; line-height: 1.35; }
          .change-row span, .change-row strong { overflow-wrap: anywhere; }
          .change-row b { color: #8b8f96; font-size: 11px; }
          .change-row strong { color: #202126; }
          .empty { padding: 14px; border-radius: 10px; color: #80848b; background: rgba(23, 25, 35, .04); font-size: 13px; font-weight: 700; }
          footer { border-top: 1px solid #ddd; margin-top: 22px; padding-top: 10px; text-align: center; color: #8b8f96; font-size: 10px; }
          @media print { .page { padding: 0; } }
        </style>
      </head>
      <body>
        <main class="page">
          <header>
            <div class="brand">${escapeHtml(workspaceName || "StudioFlow")}</div>
            <div class="doc-title">HISTORY LOG PDF</div>
          </header>
          <section class="summary">
            <h1>${escapeHtml(orderName)}</h1>
            <div>
              <span>Design Name: ${escapeHtml(designName)}</span>
              <span>Placed On: ${escapeHtml(formatDate(order.paymentDate))}</span>
              <span>Total Logs: ${logs.length}</span>
            </div>
          </section>
          ${rows}
          <footer>Generated automatically from StudioFlow</footer>
        </main>
      </body>
    </html>`;
}

function openHistoryPdfPrint(order: OrderDetail, workspaceName: string) {
  const popup = window.open("", "_blank", "width=900,height=1100");
  if (!popup) throw new Error("The History Log PDF window could not be opened. Please allow pop-ups for this page.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(historyPdfHtml(order, order.historyLog, workspaceName));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

type OrderPdfRow = {
  title: string;
  value: string;
  tone?: "green" | "orange" | "red" | "gray";
};

type OrderPdfItem = {
  title: string;
  value: string;
};

function orderPdfRowHtml(row: OrderPdfRow) {
  const toneClass = row.tone ? ` tone-${row.tone}` : "";
  return `
    <div class="pdf-row">
      <strong>${escapeHtml(row.title)}:</strong>
      <span class="${toneClass.trim()}">${escapeHtml(row.value || "-")}</span>
    </div>
  `;
}

function orderPdfRowsHtml(rows: OrderPdfRow[]) {
  return rows.map(orderPdfRowHtml).join("");
}

function orderPdfSectionHtml(title: string, bodyHtml: string) {
  if (!bodyHtml.trim()) return "";
  return `
    <section class="pdf-section">
      <h2>${escapeHtml(title.toUpperCase())}</h2>
      <div class="pdf-box">${bodyHtml}</div>
    </section>
  `;
}

function orderPdfMoney(value: number, settings: StudioMoneySettings, hidden: boolean) {
  return orderMoney(value, hidden, settings);
}

function orderPdfHtml(
  order: OrderDetail,
  workspaceName: string,
  options: {
    settings?: WorkspaceSettingsOverview | null;
    canSeeFinance: boolean;
    canSeeAdvancedFinance: boolean;
    hideNumbers: boolean;
    previewUrl: string;
    statusSteps: OrderPdfItem[];
    statusToggles: OrderPdfItem[];
    materialItems: OrderPdfItem[];
  }
) {
  const settings = options.settings;
  const orderName = order.customerName.trim() || order.designName.trim() || "Order";
  const designName = order.designName.trim() || "-";
  const showCustomer = settings?.pdfShowCustomer ?? true;
  const showContact = settings?.pdfShowContact ?? true;
  const showPreview = settings?.pdfShowPreview ?? true;
  const showFinCustomer = Boolean(options.canSeeFinance && (settings?.pdfShowFinCustomer ?? true));
  const showPaymentMethod = Boolean(showFinCustomer && options.canSeeAdvancedFinance && (settings?.pdfShowPaymentMethod ?? true));
  const showFinInternal = Boolean(options.canSeeAdvancedFinance && (settings?.pdfShowFinInternal ?? false));
  const showStatus = settings?.pdfShowStatus ?? true;
  const showShipping = settings?.pdfShowShipping ?? true;
  const showMaterials = settings?.pdfShowMaterials ?? true;
  const showPriority = settings?.pdfShowPriority ?? true;
  const appSubtitle = settings?.appSubtitle?.trim() || workspaceName || "StudioFlow";
  const logoUrl = settings?.appLogoUrl?.trim() || "";
  const taxRuleName = order.taxType === "Profit"
    ? (settings?.taxRuleNameProfit || "Margin Scheme (2nd Hand)")
    : (settings?.taxRuleNameRevenue || "Standard Tax (Services/New)");
  const formatMoney = (value: number) => orderPdfMoney(value, settings, options.hideNumbers);

  const customerSection = showCustomer ? orderPdfSectionHtml("Customer & Design", orderPdfRowsHtml([
    { title: "Customer Name", value: order.customerName },
    { title: "Design Name", value: designName },
    { title: "Reference", value: order.watchRef || "-" },
    { title: "Placed On", value: formatDate(order.paymentDate) }
  ])) : "";

  const prioritySection = showPriority ? orderPdfSectionHtml("Priority / Risk", orderPdfRowsHtml([
    { title: "Priority", value: order.priority || "Normal" },
    { title: "Risk", value: order.risk || "None" },
    ...(order.risk && order.risk !== "None" ? [{ title: "Reason", value: order.riskReason || "-" }] : [])
  ])) : "";

  const materialSection = showMaterials ? orderPdfSectionHtml("Materials & Inventory", [
    orderPdfRowsHtml(options.materialItems.map(item => ({ title: item.title, value: item.value }))),
    order.invNotes.trim() ? `<div class="pdf-divider"></div><p><strong>Notes / Supplier:</strong><br />${escapeHtml(order.invNotes)}</p>` : ""
  ].join("")) : "";

  const contactRows: OrderPdfRow[] = [
    { title: "Email", value: order.emailAddress || "-" },
    { title: "Telephone", value: order.whatsappNumber || "-" },
    { title: "Instagram", value: order.instagramUsername || "-" },
    { title: "Channel", value: order.communication.length > 0 ? order.communication.join(", ") : "-" }
  ];
  const address = order.customFields.communicationAddress || order.customFields.Address || "";
  if (address.trim()) contactRows.push({ title: "Address", value: address });
  const contactSection = showContact ? orderPdfSectionHtml("Contact & Notes", [
    orderPdfRowsHtml(contactRows),
    `<div class="pdf-divider"></div><p><strong>Special Notes:</strong><br />${escapeHtml(order.notes || "No special notes provided.")}</p>`
  ].join("")) : "";

  const previewSection = showPreview ? `
    <section class="pdf-section">
      <h2>PREVIEW</h2>
      ${options.previewUrl && isProbablyImageUrl(options.previewUrl)
        ? `<img class="preview-image" src="${escapeHtml(options.previewUrl)}" alt="${escapeHtml(designName)}" />`
        : `<div class="pdf-box empty-preview">No preview image provided.</div>`}
    </section>
  ` : "";

  const financeRows: OrderPdfRow[] = [];
  if (showFinCustomer) {
    financeRows.push({ title: "Paid", value: formatMoney(order.paidAmount), tone: "green" });
    financeRows.push({ title: "Remaining", value: formatMoney(order.remainingAmount), tone: "orange" });
    if (showPaymentMethod) financeRows.push({ title: "Payment Method", value: order.paymentMethod || "-" });
  }
  if (showFinCustomer && showFinInternal) {
    financeRows.push({ title: "", value: "__divider__" });
  }
  if (showFinInternal) {
    financeRows.push({ title: "Platform Fee", value: formatMoney(order.paymentFee), tone: "red" });
    financeRows.push({ title: "Watch Cost", value: formatMoney(order.watchPurchasePrice), tone: "red" });
    financeRows.push({ title: "Shipping Cost", value: formatMoney(order.deliveryCost), tone: "red" });
    financeRows.push({ title: `Tax Amount (${taxRuleName})`, value: formatMoney(order.taxAmount), tone: "red" });
    financeRows.push({ title: "Final Profit", value: formatMoney(order.netProfit), tone: "green" });
  }
  const financeSection = financeRows.length > 0 ? orderPdfSectionHtml("Financial Info", financeRows.map(row => (
    row.value === "__divider__" ? `<div class="pdf-divider"></div>` : orderPdfRowHtml(row)
  )).join("")) : "";

  const statusRows = [
    { title: "Delivery Time", value: `${order.deliveryTime || 0} days` },
    ...options.statusSteps,
    ...options.statusToggles
  ];
  const statusSection = showStatus ? orderPdfSectionHtml("Production Status", orderPdfRowsHtml(statusRows)) : "";

  const shippingSection = showShipping ? orderPdfSectionHtml("Shipping & Tracking", orderPdfRowsHtml([
    { title: "Dispatched", value: order.isDispatched ? "Yes" : "No" },
    { title: "Delivered", value: order.isDelivered ? "Yes" : "No" },
    { title: "Courier", value: order.courier || "-" },
    { title: "Tracking No.", value: order.trackingNumber || "-" }
  ])) : "";

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Order PDF - ${escapeHtml(orderName)}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #202126; background: #fff; }
          .page { max-width: 780px; margin: 0 auto; padding: 30px 34px; }
          header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid #ddd; padding-bottom: 16px; margin-bottom: 18px; }
          .brand { color: #8b8f96; font-size: 12px; font-weight: 700; }
          .brand img { display: block; max-height: 48px; max-width: 150px; object-fit: contain; margin-bottom: 6px; }
          .doc-title { text-align: right; color: rgba(30, 32, 38, 0.28); font-size: 28px; font-weight: 900; letter-spacing: .04em; }
          .summary { padding: 14px; border-radius: 12px; background: rgba(23, 25, 35, .035); margin-bottom: 18px; }
          .summary h1 { margin: 0 0 7px; font-size: 20px; }
          .summary div { display: flex; flex-wrap: wrap; gap: 12px; color: #777c84; font-size: 11px; font-weight: 700; }
          .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px 22px; align-items: start; }
          .pdf-section { break-inside: avoid; margin-bottom: 18px; }
          .pdf-section h2 { margin: 0 0 8px; color: #777c84; font-size: 11px; font-weight: 900; letter-spacing: .08em; }
          .pdf-box { padding: 14px; border-radius: 10px; background: rgba(23, 25, 35, .04); }
          .pdf-row { display: grid; grid-template-columns: 122px minmax(0, 1fr); gap: 8px; align-items: start; font-size: 12px; line-height: 1.4; margin: 7px 0; }
          .pdf-row strong { color: #202126; font-weight: 800; }
          .pdf-row span { color: #30323a; overflow-wrap: anywhere; }
          .tone-green { color: #34c759 !important; font-weight: 800; }
          .tone-orange { color: #ff9500 !important; font-weight: 800; }
          .tone-red { color: #ff3b30 !important; font-weight: 800; }
          .tone-gray { color: #8b8f96 !important; font-weight: 800; }
          .pdf-divider { height: 1px; background: rgba(20, 22, 28, .16); margin: 10px 0; }
          p { margin: 0; color: #777c84; font-size: 12px; line-height: 1.45; }
          .preview-image { display: block; max-width: 100%; max-height: 210px; object-fit: contain; border-radius: 10px; background: rgba(23, 25, 35, .04); }
          .empty-preview { color: #777c84; font-size: 12px; font-weight: 700; }
          footer { border-top: 1px solid #ddd; margin-top: 22px; padding-top: 10px; text-align: center; color: #8b8f96; font-size: 10px; }
          @media print { .page { padding: 0; } }
        </style>
      </head>
      <body>
        <main class="page">
          <header>
            <div class="brand">
              ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(workspaceName || "StudioFlow")}" />` : ""}
              ${escapeHtml(appSubtitle)}
            </div>
            <div class="doc-title">JOB SHEET</div>
          </header>
          <section class="summary">
            <h1>${escapeHtml(orderName)}</h1>
            <div>
              <span>Design Name: ${escapeHtml(designName)}</span>
              <span>Placed On: ${escapeHtml(formatDate(order.paymentDate))}</span>
              <span>Delivery Due: ${escapeHtml(formatDate(order.dueDate))}</span>
            </div>
          </section>
          <div class="grid">
            <div>
              ${customerSection}
              ${prioritySection}
              ${materialSection}
              ${contactSection}
              ${previewSection}
            </div>
            <div>
              ${financeSection}
              ${statusSection}
              ${shippingSection}
            </div>
          </div>
          <footer>Generated automatically from StudioFlow</footer>
        </main>
      </body>
    </html>`;
}

function openOrderPdfPrint(
  order: OrderDetail,
  workspaceName: string,
  options: Parameters<typeof orderPdfHtml>[2]
) {
  const popup = window.open("", "_blank", "width=900,height=1100");
  if (!popup) throw new Error("The Order PDF window could not be opened. Please allow pop-ups for this page.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(orderPdfHtml(order, workspaceName, options));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

function isoDateFromToday(daysFromToday: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return dateInputValue(date);
}

function dateTimeInputValue(date: Date | null) {
  if (!date) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function daysRemaining(date: Date | null) {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(date);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function remainingDaysLabel(date: Date | null) {
  const days = daysRemaining(date);
  if (days === null) return "-";
  if (days > 0) return `${days} days`;
  if (days === 0) return "Due today";
  return `${Math.abs(days)} days late`;
}

function summaryDeliveryLabel(order: OrderDetail) {
  const status = order.status.trim().toLowerCase();
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (order.isDispatched) return "Done";
  const days = daysRemaining(order.dueDate);
  if (days === null) return "-";
  if (days > 0) return `${days} days`;
  if (days === 0) return "Today";
  return `Late (${Math.abs(days)} days)`;
}

function summaryDeliveryTone(order: OrderDetail) {
  const status = order.status.trim().toLowerCase();
  if (status === "cancelled" || status === "canceled" || order.isDispatched) return "gray";
  const days = daysRemaining(order.dueDate);
  if (days === null) return "gray";
  if (days <= 7) return "red";
  if (days <= 14) return "yellow";
  return "green";
}

function isOverdue(date: Date | null) {
  const days = daysRemaining(date);
  return days !== null && days < 0;
}

function isProbablyImageUrl(value: string) {
  const lower = value.toLowerCase().split("?")[0];
  return /\.(png|jpe?g|webp|gif|heic|heif)$/.test(lower);
}

function dynamicStatusTone(value: string) {
  const normalized = value.trim().toLowerCase();
  const green = new Set(["none", "done", "completed", "delivered", "approved", "deposit paid", "shipped", "ready to ship"]);
  const red = new Set(["not yet", "blocked", "overdue", "urgent"]);
  const gray = new Set(["cancelled", "canceled", "refunded", "new", "quoted", "low"]);
  if (green.has(normalized)) return "green";
  if (red.has(normalized)) return "red";
  if (gray.has(normalized)) return "gray";
  return "orange";
}

function isWorkflowOnly(role: string) {
  const normalized = role.toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "workflow" || normalized === "workflowonly";
}

function orderEditForm(order: OrderDetail): CreateOrderInput {
  return {
    customerName: order.customerName,
    designName: order.designName,
    watchRef: order.watchRef,
    orderValue: order.paidAmount + order.remainingAmount,
    paidAmount: order.paidAmount,
    deliveryDueDate: dateInputValue(order.dueDate),
    designStatus: order.designStatus || "Not Yet",
    paintingStatus: order.status || "Not Yet",
    notes: order.notes
  };
}

function clientFileByline(file: ClientFileDetail) {
  const uploadedBy = file.uploadedByEmail || file.uploadedBy;
  if (uploadedBy && file.source) return `${uploadedBy} - ${file.source}`;
  return uploadedBy || file.source || "";
}

function fileBadge(file: ClientFileDetail) {
  const lowerName = file.fileName.toLowerCase();
  if (lowerName.endsWith(".pdf") || file.contentType.toLowerCase().includes("pdf")) return "PDF";
  if (lowerName.endsWith(".psd")) return "PSD";
  if (lowerName.endsWith(".psb")) return "PSB";
  if (isClientFileImage(file)) return "IMG";
  const extension = lowerName.includes(".") ? lowerName.split(".").pop() : "";
  return extension ? extension.slice(0, 4).toUpperCase() : "FILE";
}

function isClientFilePdf(file: ClientFileDetail) {
  return file.fileName.toLowerCase().endsWith(".pdf") || file.contentType.toLowerCase().includes("pdf");
}

const CARD_LABELS: Record<OrderDetailCardId, string> = {
  preview: "Preview",
  summary: "Order Summary",
  customer: "Customer & Communication",
  materials: "Materials & Inventory",
  priority: "Priority / Risk",
  delivery: "Timeline & Delivery",
  notes: "Notes",
  clientFiles: "Client Files",
  todo: "To Do",
  financial: "Financial Info",
  status: "Production Status",
  shipping: "Shipping & Tracking",
  schedule: "Schedule & Alerts",
  historyLog: "History / Log"
};

const CARD_COLOR_OPTIONS = ["Default", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Pink"] as const;
const DEFAULT_STATUS_OPTIONS = ["New", "Not Yet", "In Progress", "Done", "Cancelled"];
const PRIORITY_OPTIONS = ["Low", "Normal", "High", "Urgent"];
const RISK_OPTIONS = ["None", "Waiting", "Blocked", "Overdue"];
const RISK_REASON_OPTIONS = ["-", "Waiting for customer", "Waiting for payment", "Waiting for material", "Other"];
const COURIER_OPTIONS = ["Auto Detect", "Royal Mail", "DHL", "FedEx", "UPS"];
const COMMUNICATION_CHANNELS = ["Instagram", "WhatsApp", "TikTok"];
const APP_DEFAULT_MATERIAL_LABELS = ["Dial Sourced", "Dial Received", "Watch Received", "Materials Ready"];

function communicationChannelKey(channel: string) {
  return channel.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function hasCommunicationChannel(channels: string[], channel: string) {
  const targetKey = communicationChannelKey(channel);
  return channels.some(item => communicationChannelKey(item) === targetKey);
}

const DEFAULT_CARD_HEIGHTS: Record<OrderDetailCardId, number> = {
  preview: 250,
  summary: 210,
  customer: 200,
  materials: 200,
  priority: 200,
  delivery: 200,
  notes: 220,
  clientFiles: 310,
  todo: 360,
  financial: 430,
  status: 260,
  shipping: 260,
  schedule: 390,
  historyLog: 360
};

type FinancePatch = NonNullable<UpdateOrderInput["finance"]>;
type DetailsPatch = NonNullable<UpdateOrderInput["details"]>;
type TodoPatch = NonNullable<UpdateOrderInput["todo"]>;
type SchedulePatch = NonNullable<UpdateOrderInput["schedule"]>;

type WebScheduleReminder = {
  id: string;
  title: string;
  note: string;
  dueAt: Date | null;
  priority: string;
  status: string;
  notify: boolean;
  completedAt: Date | null;
};

function materialDefaultCheckItems(settings: BlockHeadingSettings | null) {
  const saved = settings?.materialsDefaultChecks
    .map(item => item.title.trim())
    .filter(Boolean) ?? [];
  const labels = saved.length > 0
    ? saved
    : [
      settings?.invLabel1,
      settings?.invLabel2,
      settings?.invLabel3,
      settings?.invLabel4
    ].map(label => label?.trim() ?? "").filter(Boolean);

  return (labels.length > 0 ? labels : APP_DEFAULT_MATERIAL_LABELS).map((title, index) => ({
    id: `material-default-${index}-${title}`,
    title
  }));
}

function materialDefaultCheckValue(order: OrderDetail, index: number, title: string) {
  if (index === 0) return order.invBool1;
  if (index === 1) return order.invBool2;
  if (index === 2) return order.invBool3;
  if (index === 3) return order.invBool4;
  return order.customToggles[`materialsDefault::${title}`] ?? false;
}

function materialDefaultCheckPatch(index: number, title: string, value: boolean): DetailsPatch {
  if (index === 0) return { invBool1: value };
  if (index === 1) return { invBool2: value };
  if (index === 2) return { invBool3: value };
  if (index === 3) return { invBool4: value };
  return { materialsDefaultToggles: { [title]: value } };
}

function materialToggleValue(order: OrderDetail, title: string) {
  return order.customToggles[`materials::${title}`] ?? false;
}

const SCHEDULE_ITEMS_CUSTOM_KEY = "__scheduleAlertItemsV1";
const SWIFT_REFERENCE_SECONDS = 978307200;
const DEFAULT_QUICK_REMINDERS: ScheduleHeadingItem[] = [
  { id: "follow-up-customer", title: "Follow up customer", days: 1, priority: "Normal", notify: true },
  { id: "send-design-update", title: "Send design update", days: 1, priority: "Normal", notify: true },
  { id: "ask-for-approval", title: "Ask for approval", days: 2, priority: "High", notify: true },
  { id: "check-payment", title: "Check payment", days: 2, priority: "High", notify: true }
];

function parseScheduleDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const unixSeconds = value > 2000000000 ? value / 1000 : value + SWIFT_REFERENCE_SECONDS;
    return new Date(unixSeconds * 1000);
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return parseScheduleDate(numeric);
  }
  return null;
}

function scheduleRemindersFromFields(fields: Record<string, string>): WebScheduleReminder[] {
  const raw = fields[SCHEDULE_ITEMS_CUSTOM_KEY];
  if (!raw) return [];
  try {
    const decoded = JSON.parse(raw) as unknown;
    if (!Array.isArray(decoded)) return [];
    return decoded
      .filter(item => item && typeof item === "object")
      .map((item, index) => {
        const source = item as Record<string, unknown>;
        return {
          id: String(source.id || `schedule-${index}`),
          title: String(source.title || "Reminder"),
          note: String(source.note || ""),
          dueAt: parseScheduleDate(source.dueAt),
          priority: String(source.priority || "Normal"),
          status: String(source.status || "Pending"),
          notify: source.notify !== false,
          completedAt: parseScheduleDate(source.completedAt)
        };
      })
      .sort((first, second) => {
        if (first.status !== second.status) return first.status === "Pending" ? -1 : 1;
        return (first.dueAt?.getTime() ?? 0) - (second.dueAt?.getTime() ?? 0);
      });
  } catch {
    return [];
  }
}

function scheduleRelativeLabel(item: WebScheduleReminder) {
  if (item.status === "Done") return "Done";
  if (!item.dueAt) return "-";
  const seconds = (item.dueAt.getTime() - Date.now()) / 1000;
  if (seconds < 0) {
    const hours = Math.floor(Math.abs(seconds) / 3600);
    if (hours < 1) return "Due now";
    if (hours < 24) return `Overdue ${hours}h`;
    return `Overdue ${Math.max(1, Math.floor(hours / 24))}d`;
  }
  const hours = Math.floor(seconds / 3600);
  if (hours < 1) return "Due soon";
  if (hours < 24) return `In ${hours}h`;
  return `In ${Math.max(1, Math.floor(hours / 24))}d`;
}

function scheduleTone(item: WebScheduleReminder) {
  if (item.status === "Done") return "green";
  if (!item.dueAt) return "gray";
  if (item.dueAt.getTime() < Date.now()) return "red";
  const hours = (item.dueAt.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hours <= 24) return "yellow";
  return "blue";
}

function schedulePriorityTone(priority: string) {
  const normalized = priority.trim().toLowerCase();
  if (normalized === "urgent") return "red";
  if (normalized === "high") return "yellow";
  if (normalized === "low") return "gray";
  return "blue";
}

function clampColumnWidth(value: number | undefined) {
  if (!Number.isFinite(value)) return 350;
  return Math.min(Math.max(Number(value), 260), 800);
}

function cardHeight(layout: OrderDetailCardLayout, cardId: OrderDetailCardId) {
  const savedHeight = layout.cardHeights[cardId];
  if (Number.isFinite(savedHeight)) return Math.min(Math.max(Number(savedHeight), 160), 1200);
  return DEFAULT_CARD_HEIGHTS[cardId];
}

function effectiveCardHeight(
  layout: OrderDetailCardLayout,
  cardId: OrderDetailCardId,
  measuredMinimums: Partial<Record<OrderDetailCardId, number>>
) {
  return Math.max(cardHeight(layout, cardId), measuredMinimums[cardId] || 0);
}

function measuredCardMinimumHeight(cardId: OrderDetailCardId, frame: Element | null) {
  if (cardId === "clientFiles") return measuredClientFilesMinimumHeight(frame);

  const fixedMinimums: Partial<Record<OrderDetailCardId, number>> = {
    preview: 220,
    historyLog: 260
  };
  const fixedMinimum = fixedMinimums[cardId];
  if (fixedMinimum) return fixedMinimum;

  const card = frame?.querySelector<HTMLElement>(".order-detail-card");
  if (!card) return 160;

  const cardStyle = window.getComputedStyle(card);
  const paddingTop = Number.parseFloat(cardStyle.paddingTop) || 0;
  const paddingBottom = Number.parseFloat(cardStyle.paddingBottom) || 0;
  const measured = Array.from(card.children).reduce((total, child) => {
    const element = child as HTMLElement;
    const childStyle = window.getComputedStyle(element);
    const marginTop = Number.parseFloat(childStyle.marginTop) || 0;
    const marginBottom = Number.parseFloat(childStyle.marginBottom) || 0;
    return total + element.scrollHeight + marginTop + marginBottom;
  }, paddingTop + paddingBottom);

  return Math.min(Math.max(Math.ceil(measured + 4), 160), 1200);
}

function elementOuterHeight(element: HTMLElement | null) {
  if (!element) return 0;
  const style = window.getComputedStyle(element);
  const marginTop = Number.parseFloat(style.marginTop) || 0;
  const marginBottom = Number.parseFloat(style.marginBottom) || 0;
  return element.scrollHeight + marginTop + marginBottom;
}

function measuredClientFilesMinimumHeight(frame: Element | null) {
  const card = frame?.querySelector<HTMLElement>(".order-detail-card.is-client-files-card");
  if (!card) return 310;

  const cardStyle = window.getComputedStyle(card);
  const cardPadding = (Number.parseFloat(cardStyle.paddingTop) || 0) + (Number.parseFloat(cardStyle.paddingBottom) || 0);
  const titleHeight = elementOuterHeight(card.querySelector<HTMLElement>(".card-title"));
  const panel = card.querySelector<HTMLElement>(".app-client-files-panel");
  if (!panel) return Math.min(Math.max(Math.ceil(cardPadding + titleHeight + 220), 220), 1200);

  const panelStyle = window.getComputedStyle(panel);
  const panelPadding = (Number.parseFloat(panelStyle.paddingTop) || 0) + (Number.parseFloat(panelStyle.paddingBottom) || 0);
  const panelGap = Number.parseFloat(panelStyle.rowGap || panelStyle.gap) || 0;
  const childHeights: number[] = [];

  const addOuterHeight = (selector: string) => {
    const element = panel.querySelector<HTMLElement>(selector);
    if (element) childHeights.push(elementOuterHeight(element));
  };

  addOuterHeight(".app-client-files-intro");
  addOuterHeight(".locked-panel");
  addOuterHeight(".file-action-status");
  addOuterHeight(".file-action-error");

  const empty = panel.querySelector<HTMLElement>(".app-client-files-empty");
  const list = panel.querySelector<HTMLElement>(".app-client-files-list");

  if (empty) {
    childHeights.push(elementOuterHeight(empty));
  } else if (list) {
    const listStyle = window.getComputedStyle(list);
    const listGap = Number.parseFloat(listStyle.rowGap || listStyle.gap) || 0;
    const rows = Array.from(list.querySelectorAll<HTMLElement>(".client-file-list-row"));
    if (list.classList.contains("is-scrollable")) {
      const visibleRows = rows.slice(0, 3);
      const visibleRowsHeight = visibleRows.reduce((total, row) => total + elementOuterHeight(row), 0);
      childHeights.push(visibleRowsHeight + Math.max(visibleRows.length - 1, 0) * listGap);
    } else {
      childHeights.push(elementOuterHeight(list));
    }
  }

  addOuterHeight(".app-client-files-note");

  const panelHeight = panelPadding + childHeights.reduce((total, height) => total + height, 0) + Math.max(childHeights.length - 1, 0) * panelGap;
  return Math.min(Math.max(Math.ceil(cardPadding + titleHeight + panelHeight + 4), 220), 1200);
}

function sameMeasuredMinimums(
  first: Partial<Record<OrderDetailCardId, number>>,
  second: Partial<Record<OrderDetailCardId, number>>
) {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  for (const key of keys) {
    const cardId = key as OrderDetailCardId;
    if (Math.abs((first[cardId] || 0) - (second[cardId] || 0)) > 1) return false;
  }
  return true;
}

function cardProfileColor(layout: OrderDetailCardLayout, cardId: OrderDetailCardId) {
  return layout.cardColors[cardId] || "Default";
}

function flattenedColumns(columns: OrderDetailCardId[][]) {
  return columns.flat();
}

function layoutWithCardSize(
  layout: OrderDetailCardLayout,
  cardId: OrderDetailCardId,
  height: number,
  columnIndex?: number,
  width?: number
): OrderDetailCardLayout {
  const nextHeights = {
    ...layout.cardHeights,
    [cardId]: Math.round(Math.min(Math.max(height, 160), 1200))
  };
  const nextWidths = [...layout.columnWidths];

  if (typeof columnIndex === "number" && typeof width === "number") {
    while (nextWidths.length <= columnIndex) nextWidths.push(350);
    nextWidths[columnIndex] = clampColumnWidth(width);
  }

  return {
    ...layout,
    cardHeights: nextHeights,
    columnWidths: nextWidths
  };
}

export function OrderDetailContent({
  order,
  workspace,
  onReloadOrder,
  onOptimisticOrderPatch,
  onBlockHeadingSettingsChange,
  moneySettings,
  showBackLink = false
}: {
  order: OrderDetail;
  workspace: WorkspaceContext;
  onReloadOrder: () => Promise<void>;
  onOptimisticOrderPatch?: (patch: Partial<OrderDetail>) => void;
  onBlockHeadingSettingsChange?: (settings: BlockHeadingSettings | null) => void;
  moneySettings?: WorkspaceSettingsOverview | null;
  showBackLink?: boolean;
}) {
  const { user } = useAuth();
  const { hideNumbers } = usePricePrivacy();
  const [fileActionStatus, setFileActionStatus] = useState<string | null>(null);
  const [fileActionError, setFileActionError] = useState<string | null>(null);
  const [actioningFileId, setActioningFileId] = useState<string | null>(null);
  const [previewingClientFileId, setPreviewingClientFileId] = useState<string | null>(null);
  const [isClientFileDropTargeted, setIsClientFileDropTargeted] = useState(false);
  const clientFileInputRef = useRef<HTMLInputElement | null>(null);
  const [cardLayout, setCardLayout] = useState<OrderDetailCardLayout>(DEFAULT_ORDER_DETAIL_CARD_LAYOUT);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [layoutStatus, setLayoutStatus] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [blockHeadingSettings, setBlockHeadingSettings] = useState<BlockHeadingSettings | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutReadyOrderId, setLayoutReadyOrderId] = useState("");
  const savingLayoutRef = useRef(false);
  const [draggingCardId, setDraggingCardId] = useState<OrderDetailCardId | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<OrderDetailCardId | null>(null);
  const [resizingCardId, setResizingCardId] = useState<OrderDetailCardId | null>(null);
  const resizingCardIdRef = useRef<OrderDetailCardId | null>(null);
  const [measuredCardMinimums, setMeasuredCardMinimums] = useState<Partial<Record<OrderDetailCardId, number>>>({});
  const desktopCardFrameRefs = useRef(new Map<OrderDetailCardId, HTMLDivElement>());
  const mobileCardFrameRefs = useRef(new Map<OrderDetailCardId, HTMLDivElement>());
  const workspacePanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
    verticalScrollElement: HTMLElement | null;
    verticalScrollTop: number;
  } | null>(null);
  const [workspacePanning, setWorkspacePanning] = useState(false);
  const [isNarrowLayout, setIsNarrowLayout] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [orderActionStatus, setOrderActionStatus] = useState<string | null>(null);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);
  const [openCardMenuId, setOpenCardMenuId] = useState<OrderDetailCardId | null>(null);
  const [headingEditorCardId, setHeadingEditorCardId] = useState<OrderDetailCardId | null>(null);
  const [financeStatus, setFinanceStatus] = useState<string | null>(null);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [savingFinanceField, setSavingFinanceField] = useState<string | null>(null);
  const [inlineStatus, setInlineStatus] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [savingInlineField, setSavingInlineField] = useState<string | null>(null);
  const [previewMenuOpen, setPreviewMenuOpen] = useState(false);
  const [previewLinkEditing, setPreviewLinkEditing] = useState(false);
  const [previewLinkDraft, setPreviewLinkDraft] = useState(order.designLink);
  const [previewActioning, setPreviewActioning] = useState<string | null>(null);
  const previewFileInputRef = useRef<HTMLInputElement | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoAssignedToUid, setNewTodoAssignedToUid] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState("Normal");
  const [newTodoHasDueDate, setNewTodoHasDueDate] = useState(false);
  const [newTodoDueDate, setNewTodoDueDate] = useState(dateInputValue(new Date()));
  const [todoFilter, setTodoFilter] = useState<ToDoFilter>("Open");
  const [todoStatus, setTodoStatus] = useState<string | null>(null);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [savingTodoAction, setSavingTodoAction] = useState<string | null>(null);
  const [openTodoMenuId, setOpenTodoMenuId] = useState<string | null>(null);
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const [dragOverTodoId, setDragOverTodoId] = useState<string | null>(null);
  const [editingTodoTitleId, setEditingTodoTitleId] = useState<string | null>(null);
  const [editingTodoTitle, setEditingTodoTitle] = useState("");
  const [optimisticTodoItems, setOptimisticTodoItems] = useState<ToDoDetail[]>(order.todoItems);
  const todoServerSignatureRef = useRef(todoItemsSignature(order.todoItems));
  const todoOrderIdRef = useRef(order.id);
  const [newScheduleTitle, setNewScheduleTitle] = useState("Follow up customer");
  const [newScheduleDueAt, setNewScheduleDueAt] = useState(dateTimeInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [newSchedulePriority, setNewSchedulePriority] = useState<NonNullable<SchedulePatch["priority"]>>("Normal");
  const [newScheduleNotify, setNewScheduleNotify] = useState(workspace.billingPlan !== "demo");
  const [newScheduleNote, setNewScheduleNote] = useState("");
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [savingScheduleAction, setSavingScheduleAction] = useState<string | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMemberDetail[]>([]);
  const [workspaceStatusOptions, setWorkspaceStatusOptions] = useState<string[]>(DEFAULT_STATUS_OPTIONS);
  const independentCardLayout = useMemo(
    () => layoutFromOrderWorkspaceSnapshotJSON(order.customFields[ORDER_WORKSPACE_LAYOUT_KEY], order.id),
    [order.customFields, order.id]
  );
  const isOrderCardLayoutIndependent = Boolean(independentCardLayout);

  const canSeeFinance = useMemo(() => !isWorkflowOnly(workspace.role), [workspace.role]);
  const canSeeAdvancedFinance = Boolean(workspace.entitlements.features.financial_advanced && canSeeFinance);
  const canUseClientFiles = Boolean(workspace.entitlements.features.client_files);
  const canManageClientFiles = Boolean(canUseClientFiles && canManageClientFilesForRole(workspace.role));
  const canSeeTeamAssignment = Boolean(workspace.entitlements.features.team_access);
  const canCustomizeCards = Boolean(workspace.entitlements.features.card_customization);
  const layoutReady = layoutReadyOrderId === order.id;
  const canUseLiteWorkspaceCards = workspace.billingPlan !== "demo";
  const canEditOrderFully = canEditOrderFullyForRole(workspace.role);
  const canEditOrderStatus = canEditOrderStatusForRole(workspace.role);
  const canEditWorkflowFields = canEditOrderStatus;
  const money = (value: number, hidden = false) => orderMoney(value, hidden, moneySettings);
  const canInlineEditFinance = Boolean(canSeeFinance && canEditOrderFully);
  const canInlineEditFullDetails = canEditOrderDetailsForRole(workspace.role);
  const canEditToDoItems = canEditWorkflowFields;
  const canEditScheduleItems = canEditWorkflowFields;
  const canEditCardLayout = Boolean(canCustomizeCards && canEditWorkflowFields);
  const canNotifyScheduleItems = workspace.billingPlan !== "demo";
  const canUseCalendarExport = workspace.billingPlan !== "demo";

  function setCardFrameRef(cardId: OrderDetailCardId, node: HTMLDivElement | null, mode: "desktop" | "mobile") {
    const refs = mode === "mobile" ? mobileCardFrameRefs.current : desktopCardFrameRefs.current;
    if (node) refs.set(cardId, node);
    else refs.delete(cardId);
  }

  function measureVisibleCardMinimums() {
    if (resizingCardIdRef.current) return;

    const next: Partial<Record<OrderDetailCardId, number>> = {};
    const refs = isNarrowLayout ? mobileCardFrameRefs.current : desktopCardFrameRefs.current;
    refs.forEach((node, cardId) => {
      next[cardId] = measuredCardMinimumHeight(cardId, node);
    });
    setMeasuredCardMinimums(current => sameMeasuredMinimums(current, next) ? current : next);
  }

  function shouldStartWorkspacePan(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return !target.closest([
      ".order-card-drag-handle",
      ".order-card-height-resize-handle",
      ".order-card-corner-resize-handle",
      ".order-card-menu",
      ".order-card-menu-panel",
      ".workspace-blocks-modal",
      "button",
      "a",
      "input",
      "textarea",
      "select",
      "label",
      "[role='button']",
      "[contenteditable='true']"
    ].join(","));
  }

  function verticalWorkspacePanElement(workspaceElement: HTMLElement) {
    if (workspaceElement.scrollHeight > workspaceElement.clientHeight + 1) {
      return workspaceElement;
    }

    const ordersPane = workspaceElement.closest(".orders-detail-pane");
    if (ordersPane instanceof HTMLElement && ordersPane.scrollHeight > ordersPane.clientHeight + 1) {
      return ordersPane;
    }

    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
  }

  function startWorkspacePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!shouldStartWorkspacePan(event.target)) return;

    const verticalScrollElement = verticalWorkspacePanElement(event.currentTarget);
    workspacePanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
      verticalScrollElement,
      verticalScrollTop: verticalScrollElement?.scrollTop ?? 0
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setWorkspacePanning(true);
  }

  function moveWorkspacePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = workspacePanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    if (pan.verticalScrollElement) {
      pan.verticalScrollElement.scrollTop = pan.verticalScrollTop - (event.clientY - pan.startY);
    } else {
      event.currentTarget.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    }
    event.preventDefault();
  }

  function endWorkspacePan(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = workspacePanRef.current;
    if (pan && event.currentTarget.hasPointerCapture(pan.pointerId)) {
      event.currentTarget.releasePointerCapture(pan.pointerId);
    }
    workspacePanRef.current = null;
    setWorkspacePanning(false);
  }

  useEffect(() => {
    if (!canSeeTeamAssignment && todoFilter === "Mine") {
      setTodoFilter("Open");
    }
    if (!canSeeTeamAssignment && newTodoAssignedToUid) {
      setNewTodoAssignedToUid("");
    }
  }, [canSeeTeamAssignment, newTodoAssignedToUid, todoFilter]);

  useEffect(() => {
    const serverSignature = todoItemsSignature(order.todoItems);
    if (todoOrderIdRef.current !== order.id) {
      todoOrderIdRef.current = order.id;
      todoServerSignatureRef.current = serverSignature;
      setOptimisticTodoItems(order.todoItems);
      return;
    }

    if (serverSignature !== todoServerSignatureRef.current) {
      todoServerSignatureRef.current = serverSignature;
      setOptimisticTodoItems(order.todoItems);
    }
  }, [order.id, order.todoItems]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(measureVisibleCardMinimums);
    return () => window.cancelAnimationFrame(frame);
  });

  useEffect(() => {
    function handleResize() {
      if (resizingCardIdRef.current) return;
      window.requestAnimationFrame(measureVisibleCardMinimums);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isNarrowLayout]);

  useEffect(() => {
    if (!canNotifyScheduleItems) setNewScheduleNotify(false);
  }, [canNotifyScheduleItems]);

  useEffect(() => {
    setOpenTodoMenuId(null);
    cancelTodoTitleEdit();
    setCalendarStatus(null);
    setCalendarError(null);
  }, [order.id]);

  useEffect(() => {
    if (!canSeeTeamAssignment) {
      setTeamMembers([]);
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        const data = await loadTeamAccessData(workspace);
        if (!cancelled) setTeamMembers(data.members);
      } catch {
        if (!cancelled) setTeamMembers([]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [canSeeTeamAssignment, workspace]);

  const todoAssigneeOptions = useMemo(() => {
    const options: Array<{ uid: string; label: string; email: string }> = [
      { uid: "", label: "Unassigned", email: "" }
    ];
    const seen = new Set<string>([""]);
    const addOption = (uid: string, label: string, email: string) => {
      const cleanUid = uid.trim();
      if (!cleanUid || seen.has(cleanUid)) return;
      options.push({
        uid: cleanUid,
        label: label.trim() || email.trim() || cleanUid,
        email: email.trim()
      });
      seen.add(cleanUid);
    };

    if (canSeeTeamAssignment && user?.uid) {
      addOption(user.uid, user.displayName || user.email || "Me", user.email || "");
      teamMembers.forEach(member => {
        addOption(member.id, member.displayName || member.email || member.id, member.email);
      });
    }

    return options;
  }, [canSeeTeamAssignment, teamMembers, user?.displayName, user?.email, user?.uid]);
  const newTodoAssignee = useMemo(
    () => todoAssigneeOptions.find(option => option.uid === newTodoAssignedToUid) ?? todoAssigneeOptions[0],
    [newTodoAssignedToUid, todoAssigneeOptions]
  );

  const scheduleItems = useMemo(() => scheduleRemindersFromFields(order.customFields), [order.customFields]);
  const activeScheduleItems = useMemo(() => scheduleItems.filter(item => item.status !== "Done"), [scheduleItems]);
  const completedScheduleItems = useMemo(() => scheduleItems.filter(item => item.status === "Done"), [scheduleItems]);
  const clientFileItems = useMemo(() => {
    return [...order.clientFiles].sort((first, second) => {
      const firstTime = first.uploadedAt?.getTime() ?? 0;
      const secondTime = second.uploadedAt?.getTime() ?? 0;
      return secondTime - firstTime;
    });
  }, [order.clientFiles]);
  const previewableClientFiles = useMemo(
    () => clientFileItems.filter(file => canUseClientFiles && Boolean(file.downloadURL)),
    [canUseClientFiles, clientFileItems]
  );
  const activeClientFilePreview = previewingClientFileId
    ? previewableClientFiles.find(file => file.id === previewingClientFileId) ?? null
    : null;

  function handleDownloadCalendarEvent() {
    setCalendarStatus(null);
    setCalendarError(null);

    if (!canUseCalendarExport) {
      setCalendarError("Apple Calendar export is available from StudioFlow Lite.");
      return;
    }

    if (!order.paymentDate || !order.dueDate) {
      setCalendarError("Created date and delivery due date are needed before exporting a calendar event.");
      return;
    }

    try {
      downloadOrderCalendarFile(order);
      setCalendarStatus("Calendar file downloaded.");
    } catch (error) {
      setCalendarError(error instanceof Error ? error.message : "Calendar file could not be created.");
    }
  }

  useEffect(() => {
    if (previewingClientFileId && !previewableClientFiles.some(file => file.id === previewingClientFileId)) {
      setPreviewingClientFileId(null);
    }
  }, [previewableClientFiles, previewingClientFileId]);

  const quickReminderOptions = useMemo(() => {
    const saved = blockHeadingSettings?.scheduleQuickReminders
      ?.map(item => ({ ...item, title: item.title.trim() }))
      .filter(item => item.title.length > 0) ?? [];
    return saved.length > 0 ? saved : DEFAULT_QUICK_REMINDERS;
  }, [blockHeadingSettings?.scheduleQuickReminders]);
  const specialNoteSections = useMemo(() => {
    const saved = blockHeadingSettings?.specialNoteSections
      ?.map(item => ({ id: item.id.trim(), title: item.title.trim() }))
      .filter(item => item.id.length > 0 && item.title.length > 0) ?? [];
    const hasPrimary = saved.some(item => item.id === PRIMARY_SPECIAL_NOTE_ID);
    return hasPrimary ? saved : [{ id: PRIMARY_SPECIAL_NOTE_ID, title: "Special Notes" }, ...saved];
  }, [blockHeadingSettings?.specialNoteSections]);

  const desktopColumns = useMemo(() => {
    const sourceColumns = cardLayout.columns.length > 0 ? cardLayout.columns : [cardLayout.cardOrder];
    const columns = sourceColumns.map((column, index) => ({
      id: `column-${index}`,
      index,
      width: clampColumnWidth(cardLayout.columnWidths[index]),
      cards: column.filter(cardId => cardLayout.visibility[cardId] && (canSeeFinance || cardId !== "financial"))
    }));

    let lastVisibleIndex = columns.findIndex(column => column.cards.length > 0);
    columns.forEach((column, index) => {
      if (column.cards.length > 0) lastVisibleIndex = index;
    });

    return lastVisibleIndex < 0 ? [] : columns.slice(0, lastVisibleIndex + 1);
  }, [canSeeFinance, cardLayout]);
  const visibleMobileCards = useMemo(
    () => cardLayout.mobileCardOrder.filter(cardId => cardLayout.visibility[cardId] && (canSeeFinance || cardId !== "financial")),
    [canSeeFinance, cardLayout]
  );
  const allCardsHidden = visibleMobileCards.length === 0;
  const customizeCardOrder = (isNarrowLayout ? cardLayout.mobileCardOrder : cardLayout.cardOrder)
    .filter(cardId => canSeeFinance || cardId !== "financial");

  function cardLabel(cardId: OrderDetailCardId) {
    return CARD_LABELS[cardId];
  }

  function cardIcon(cardId: OrderDetailCardId): CardIcon {
    const icons: Record<OrderDetailCardId, CardIcon> = {
      preview: "photo",
      summary: "docText",
      customer: "customer",
      materials: "shippingBox",
      priority: "warningTriangle",
      delivery: "calendarClock",
      notes: "notes",
      clientFiles: "folderPerson",
      todo: "checklist",
      financial: "finance",
      status: "paintbrush",
      shipping: "airplane",
      schedule: "calendarClock",
      historyLog: "historyClock"
    };
    return icons[cardId];
  }

  function renderCardTitle(cardId: OrderDetailCardId) {
    return <CardTitle icon={cardIcon(cardId)} title={cardLabel(cardId)} />;
  }

  function productionStepTitles() {
    const titles = productionSteps()
      ?.map(step => step.title.trim())
      .filter(Boolean) ?? [];
    return titles.length > 0 ? titles : ["Design", "Painting"];
  }

  function productionSteps() {
    const steps = blockHeadingSettings?.customSteps
      ?.map(step => ({ id: step.id.trim(), title: step.title.trim() }))
      .filter(step => Boolean(step.title)) ?? [];
    return steps.length > 0 ? steps : [
      { id: "design", title: "Design" },
      { id: "painting", title: "Painting" }
    ];
  }

  function statusStepStorageKey(step: Pick<HeadingItem, "id" | "title">) {
    const rawId = step.id?.trim() || step.title.trim();
    return `statusStep::${rawId.toLowerCase()}`;
  }

  function statusStepValue(step: Pick<HeadingItem, "id" | "title">) {
    return order.extraStatuses[statusStepStorageKey(step)] ?? order.extraStatuses[step.title] ?? "Not Yet";
  }

  function resolvedSummaryStep(storedValue: string | undefined, fallbackIndex: number) {
    const cleaned = (storedValue || "").trim();
    const titles = productionStepTitles();
    if (cleaned && titles.some(title => title.toLowerCase() === cleaned.toLowerCase())) return cleaned;
    return titles[fallbackIndex] || (fallbackIndex === 0 ? "Design" : "Painting");
  }

  function summaryStepValue(stepName: string) {
    const titles = productionStepTitles();
    const index = titles.findIndex(title => title.toLowerCase() === stepName.trim().toLowerCase());
    if (index === 0) return order.designStatus || "Not Yet";
    if (index === 1) return order.status || "Not Yet";
    return order.extraStatuses[stepName] || "Not Yet";
  }

  const statusOptions = useMemo(() => {
    const merged = [...workspaceStatusOptions, "Not Yet", "Done", "Cancelled"];
    return Array.from(new Set(merged.map(item => item.trim()).filter(Boolean)));
  }, [workspaceStatusOptions]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const updateNarrowLayout = () => setIsNarrowLayout(mediaQuery.matches);
    updateNarrowLayout();
    mediaQuery.addEventListener("change", updateNarrowLayout);
    return () => mediaQuery.removeEventListener("change", updateNarrowLayout);
  }, []);

  useEffect(() => {
    if (savingLayoutRef.current || resizingCardIdRef.current) return;

    setLayoutReadyOrderId("");
    setLayoutStatus(null);
    setLayoutError(null);

    if (independentCardLayout) {
      setCardLayout(independentCardLayout);
      setLayoutReadyOrderId(order.id);
    } else {
      setCardLayout(DEFAULT_ORDER_DETAIL_CARD_LAYOUT);
    }
  }, [independentCardLayout, order.id]);

  useEffect(() => {
    if (!user || !workspace.id) {
      setCardLayout(DEFAULT_ORDER_DETAIL_CARD_LAYOUT);
      return;
    }
    if (savingLayoutRef.current || resizingCardIdRef.current) return;

    const currentUser = user;
    let cancelled = false;
    async function run() {
      setLayoutError(null);
      try {
        const loadedLayout = await loadOrderDetailCardLayout(currentUser.uid, workspace.id, order.id);
        if (!cancelled && !savingLayoutRef.current && !resizingCardIdRef.current) {
          setCardLayout(independentCardLayout ?? loadedLayout);
          setLayoutReadyOrderId(order.id);
        }
      } catch (loadError) {
        if (!cancelled && !savingLayoutRef.current && !resizingCardIdRef.current) {
          setCardLayout(independentCardLayout ?? DEFAULT_ORDER_DETAIL_CARD_LAYOUT);
          setLayoutReadyOrderId(order.id);
          setLayoutError(loadError instanceof Error ? loadError.message : "Could not load card layout.");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [independentCardLayout, order.id, user, workspace.id]);

  useEffect(() => {
    if (!user || !workspace.id) return;
    if (independentCardLayout) {
      if (!savingLayoutRef.current && !resizingCardIdRef.current) {
        setCardLayout(independentCardLayout);
        setLayoutReadyOrderId(order.id);
        setLayoutError(null);
      }
      return;
    }

    return subscribeOrderDetailCardLayout(
      user.uid,
      workspace.id,
      workspace.ownerUid,
      order.id,
      layout => {
        if (savingLayoutRef.current || resizingCardIdRef.current) return;
        setCardLayout(layout);
        setLayoutReadyOrderId(order.id);
        setLayoutError(null);
      },
      message => {
        setLayoutError(message);
      }
    );
  }, [independentCardLayout, order.id, user, workspace.id, workspace.ownerUid]);

  useEffect(() => {
    if (!workspace.id) {
      setBlockHeadingSettings(null);
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        const loaded = await loadWorkspaceBlockHeadings(workspace);
        if (!cancelled) {
          setBlockHeadingSettings(loaded);
          onBlockHeadingSettingsChange?.(loaded);
        }
      } catch {
        if (!cancelled) {
          setBlockHeadingSettings(null);
          onBlockHeadingSettingsChange?.(null);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [onBlockHeadingSettingsChange, workspace]);

  useEffect(() => {
    if (!workspace.id) {
      setWorkspaceStatusOptions(DEFAULT_STATUS_OPTIONS);
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        const loaded = await loadWorkspaceStatusOptions(workspace.id);
        if (!cancelled) setWorkspaceStatusOptions(loaded.length > 0 ? loaded : DEFAULT_STATUS_OPTIONS);
      } catch {
        if (!cancelled) setWorkspaceStatusOptions(DEFAULT_STATUS_OPTIONS);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  async function persistLayout(nextLayout: OrderDetailCardLayout, successMessage = "Card layout saved.", fallbackLayout?: OrderDetailCardLayout) {
    setLayoutError(null);
    setLayoutStatus(null);

    if (!canCustomizeCards) {
      setLayoutError("Card customization is available from StudioFlow Lite.");
      return;
    }
    if (!user) {
      setLayoutError("Sign in again to save card customization.");
      return;
    }
    if (!layoutReady) {
      setLayoutError("Card layout is still loading. Please try again in a moment.");
      return;
    }

    const previousLayout = fallbackLayout ?? cardLayout;
    setCardLayout(nextLayout);
    savingLayoutRef.current = true;
    setSavingLayout(true);
    try {
      const saved = isOrderCardLayoutIndependent
        ? await saveIndependentOrderCardLayout(user.uid, workspace.id, order.id, nextLayout)
        : await saveOrderDetailCardLayout(user.uid, workspace.id, nextLayout, order.id);
      setCardLayout(saved);
      setLayoutStatus(successMessage);
    } catch (saveError) {
      setCardLayout(previousLayout);
      setLayoutError(saveError instanceof Error ? saveError.message : "Could not save card layout.");
    } finally {
      savingLayoutRef.current = false;
      setSavingLayout(false);
    }
  }

  function toggleCardVisibility(cardId: OrderDetailCardId) {
    const nextLayout = {
      ...cardLayout,
      visibility: {
        ...cardLayout.visibility,
        [cardId]: !cardLayout.visibility[cardId]
      }
    };
    void persistLayout(nextLayout);
  }

  function hideCard(cardId: OrderDetailCardId) {
    setOpenCardMenuId(null);
    if (!cardLayout.visibility[cardId]) return;
    void persistLayout({
      ...cardLayout,
      visibility: {
        ...cardLayout.visibility,
        [cardId]: false
      }
    }, `${CARD_LABELS[cardId]} hidden.`);
  }

  function editCardHeading(cardId: OrderDetailCardId) {
    setOpenCardMenuId(null);
    setHeadingEditorCardId(cardId);
  }

  function setCardColor(cardId: OrderDetailCardId, color: string) {
    setOpenCardMenuId(null);
    if (!canCustomizeCards || savingLayout) return;

    const nextColors = { ...cardLayout.cardColors };
    if (color === "Default") {
      delete nextColors[cardId];
    } else {
      nextColors[cardId] = color;
    }

    void persistLayout({
      ...cardLayout,
      cardColors: nextColors
    }, "Block color saved.");
  }

  function moveCard(cardId: OrderDetailCardId, direction: -1 | 1) {
    if (isNarrowLayout) {
      moveMobileCard(cardId, direction);
      return;
    }

    const index = cardLayout.cardOrder.indexOf(cardId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= cardLayout.cardOrder.length) return;

    reorderCardByDrop(cardId, cardLayout.cardOrder[targetIndex], direction > 0);
  }

  function moveMobileCard(cardId: OrderDetailCardId, direction: -1 | 1) {
    const index = cardLayout.mobileCardOrder.indexOf(cardId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= cardLayout.mobileCardOrder.length) return;

    const nextMobileOrder = [...cardLayout.mobileCardOrder];
    const [movedCard] = nextMobileOrder.splice(index, 1);
    nextMobileOrder.splice(targetIndex, 0, movedCard);

    void persistLayout({
      ...cardLayout,
      mobileCardOrder: nextMobileOrder
    }, "Phone card order saved.");
  }

  function reorderCardByDrop(sourceCardId: OrderDetailCardId, targetCardId: OrderDetailCardId, insertAfter: boolean) {
    if (sourceCardId === targetCardId) return;

    if (isNarrowLayout) {
      reorderMobileCardByDrop(sourceCardId, targetCardId, insertAfter);
      return;
    }

    const nextColumns = (cardLayout.columns.length > 0 ? cardLayout.columns : [cardLayout.cardOrder])
      .map(column => column.filter(cardId => cardId !== sourceCardId));
    const targetColumnIndex = nextColumns.findIndex(column => column.includes(targetCardId));
    if (targetColumnIndex < 0) return;

    const targetIndex = nextColumns[targetColumnIndex].indexOf(targetCardId);
    nextColumns[targetColumnIndex].splice(insertAfter ? targetIndex + 1 : targetIndex, 0, sourceCardId);

    void persistLayout({
      ...cardLayout,
      columns: nextColumns,
      cardOrder: flattenedColumns(nextColumns)
    }, "Card order saved.");
  }

  function reorderMobileCardByDrop(sourceCardId: OrderDetailCardId, targetCardId: OrderDetailCardId, insertAfter: boolean) {
    if (sourceCardId === targetCardId) return;

    const nextMobileOrder = cardLayout.mobileCardOrder.filter(cardId => cardId !== sourceCardId);
    const targetIndex = nextMobileOrder.indexOf(targetCardId);
    if (targetIndex < 0) return;

    nextMobileOrder.splice(insertAfter ? targetIndex + 1 : targetIndex, 0, sourceCardId);

    void persistLayout({
      ...cardLayout,
      mobileCardOrder: nextMobileOrder
    }, "Phone card order saved.");
  }

  function handleCardDragStart(event: DragEvent<HTMLButtonElement>, cardId: OrderDetailCardId) {
    if (!canCustomizeCards || !layoutReady || savingLayout) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cardId);
    setDraggingCardId(cardId);
    setDragOverCardId(null);
  }

  function handleCardDragOver(event: DragEvent<HTMLDivElement>, cardId: OrderDetailCardId) {
    if (!draggingCardId || draggingCardId === cardId || !canCustomizeCards || !layoutReady || savingLayout) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverCardId(cardId);
  }

  function handleCardDrop(event: DragEvent<HTMLDivElement>, cardId: OrderDetailCardId) {
    event.preventDefault();
    if (!layoutReady) return;
    const droppedCardId = event.dataTransfer.getData("text/plain") as OrderDetailCardId || draggingCardId;
    const targetBox = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientY > targetBox.top + targetBox.height / 2;

    setDraggingCardId(null);
    setDragOverCardId(null);

    const currentOrder = isNarrowLayout ? cardLayout.mobileCardOrder : cardLayout.cardOrder;
    if (!droppedCardId || !currentOrder.includes(droppedCardId)) return;
    reorderCardByDrop(droppedCardId, cardId, insertAfter);
  }

  function handleCardDragEnd() {
    setDraggingCardId(null);
    setDragOverCardId(null);
  }

  function resetCardLayout() {
    void persistLayout(DEFAULT_ORDER_DETAIL_CARD_LAYOUT, "Default card layout restored.");
  }

  async function makeCurrentOrderIndependent() {
    setLayoutError(null);
    setLayoutStatus(null);

    if (!canCustomizeCards) {
      setLayoutError("Card customization is available from StudioFlow Lite.");
      return;
    }
    if (!canEditOrderFully) {
      setLayoutError("Only editable workspace members can make an order layout independent.");
      return;
    }
    if (!user) {
      setLayoutError("Sign in again to save this order layout.");
      return;
    }
    if (!layoutReady) {
      setLayoutError("Card layout is still loading. Please try again in a moment.");
      return;
    }

    const previousLayout = cardLayout;
    savingLayoutRef.current = true;
    setSavingLayout(true);
    try {
      const saved = await saveIndependentOrderCardLayout(user.uid, workspace.id, order.id, cardLayout);
      setCardLayout(saved);
      setLayoutReadyOrderId(order.id);
      setLayoutStatus("This order now uses its own card layout.");
      await onReloadOrder();
    } catch (saveError) {
      setCardLayout(previousLayout);
      setLayoutError(saveError instanceof Error ? saveError.message : "Could not make this order independent.");
    } finally {
      savingLayoutRef.current = false;
      setSavingLayout(false);
    }
  }

  async function rejoinSharedCardLayout() {
    setLayoutError(null);
    setLayoutStatus(null);

    if (!canCustomizeCards) {
      setLayoutError("Card customization is available from StudioFlow Lite.");
      return;
    }
    if (!canEditOrderFully) {
      setLayoutError("Only editable workspace members can rejoin the shared card layout.");
      return;
    }
    if (!user) {
      setLayoutError("Sign in again to reset this order layout.");
      return;
    }

    const previousLayout = cardLayout;
    savingLayoutRef.current = true;
    setSavingLayout(true);
    try {
      const saved = await resetIndependentOrderCardLayout(user.uid, workspace.id, order.id);
      setCardLayout(saved);
      setLayoutReadyOrderId(order.id);
      setLayoutStatus("This order now uses the shared card layout.");
      await onReloadOrder();
    } catch (saveError) {
      setCardLayout(previousLayout);
      setLayoutError(saveError instanceof Error ? saveError.message : "Could not rejoin the shared card layout.");
    } finally {
      savingLayoutRef.current = false;
      setSavingLayout(false);
    }
  }

  function handleCardResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
    cardId: OrderDetailCardId,
    columnIndex: number,
    mode: "height" | "corner"
  ) {
    if (!canCustomizeCards || !layoutReady || savingLayoutRef.current || (isNarrowLayout && mode === "corner")) return;

    event.preventDefault();
    event.stopPropagation();

    const startLayout = cardLayout;
    const pointerTarget = event.currentTarget;
    const pointerId = event.pointerId;
    const frame = event.currentTarget.closest(".order-detail-card-frame");
    const startX = event.clientX;
    const startY = event.clientY;
    const minHeight = Math.max(160, measuredCardMinimumHeight(cardId, frame));
    const startHeight = Math.max(effectiveCardHeight(startLayout, cardId, measuredCardMinimums), minHeight);
    const startWidth = clampColumnWidth(startLayout.columnWidths[columnIndex]);
    let latestHeight = startHeight;
    let latestWidth = startWidth;
    let moved = false;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = mode === "corner" ? "nwse-resize" : "ns-resize";
    document.body.style.userSelect = "none";
    resizingCardIdRef.current = cardId;
    setResizingCardId(cardId);
    setMeasuredCardMinimums(current => current[cardId] === minHeight ? current : {
      ...current,
      [cardId]: minHeight
    });

    try {
      pointerTarget.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is a best-effort helper; document listeners below are the fallback.
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      moved = true;
      latestHeight = Math.min(Math.max(startHeight + moveEvent.clientY - startY, minHeight), 1200);
      if (mode === "corner") {
        latestWidth = clampColumnWidth(startWidth + moveEvent.clientX - startX);
      }

      setCardLayout(current => layoutWithCardSize(
        current,
        cardId,
        latestHeight,
        mode === "corner" ? columnIndex : undefined,
        mode === "corner" ? latestWidth : undefined
      ));
    }

    function handlePointerUp() {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizingCardIdRef.current = null;
      setResizingCardId(null);

      try {
        if (pointerTarget.hasPointerCapture(pointerId)) {
          pointerTarget.releasePointerCapture(pointerId);
        }
      } catch {
        // Ignore browsers that do not support pointer capture on this element.
      }

      if (!moved) return;

      const nextLayout = layoutWithCardSize(
        startLayout,
        cardId,
        latestHeight,
        mode === "corner" ? columnIndex : undefined,
        mode === "corner" ? latestWidth : undefined
      );
      void persistLayout(nextLayout, mode === "corner" ? "Card size and column width saved." : "Card height saved.", startLayout);
    }

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);
  }

  async function handleRenameFile(file: ClientFileDetail) {
    setFileActionError(null);
    setFileActionStatus(null);

    if (!canManageClientFiles) {
      setFileActionError("Client Files rename is available to editable Pro and Team workspace members.");
      return;
    }

    const nextName = window.prompt("Rename client file", file.fileName)?.trim();
    if (!nextName || nextName === file.fileName) return;

    setActioningFileId(file.id);
    setFileActionStatus("Renaming file...");
    try {
      await renameClientFileForOrder({
        workspace,
        orderId: order.id,
        fileId: file.id,
        fileName: nextName
      });
      await onReloadOrder();
      setFileActionStatus(`Renamed ${nextName}.`);
    } catch (renameFailure) {
      setFileActionStatus(null);
      setFileActionError(renameFailure instanceof Error ? renameFailure.message : "Rename failed. Please try again.");
    } finally {
      setActioningFileId(null);
    }
  }

  async function handleDeleteFile(file: ClientFileDetail) {
    setFileActionError(null);
    setFileActionStatus(null);

    if (!canManageClientFiles) {
      setFileActionError("Client Files delete is available to editable Pro and Team workspace members.");
      return;
    }

    const confirmed = window.confirm(`Delete "${file.fileName}" from this order? This cannot be undone.`);
    if (!confirmed) return;

    setActioningFileId(file.id);
    setFileActionStatus("Deleting file...");
    try {
      const result = await deleteClientFileForOrder({
        workspace,
        orderId: order.id,
        fileId: file.id
      });
      await onReloadOrder();
      setFileActionStatus(result.storageCleanupError
        ? "File metadata was removed. Storage cleanup could not complete automatically."
        : `Deleted ${file.fileName}.`
      );
    } catch (deleteFailure) {
      setFileActionStatus(null);
      setFileActionError(deleteFailure instanceof Error ? deleteFailure.message : "Delete failed. Please try again.");
    } finally {
      setActioningFileId(null);
    }
  }

  async function handleUseFileAsPreview(file: ClientFileDetail) {
    setFileActionError(null);
    setFileActionStatus(null);

    if (!canManageClientFiles || !canInlineEditFullDetails) {
      setFileActionError("Only editable Pro and Team workspace members can use a client file in Preview.");
      return;
    }
    if (!canUseClientFiles || !file.downloadURL || !isClientFileImage(file)) {
      setFileActionError("Only uploaded image files can be used in the Preview card.");
      return;
    }
    if (file.downloadURL === order.designLink) {
      setFileActionStatus("This image is already used in Preview.");
      return;
    }

    setActioningFileId(file.id);
    setFileActionStatus("Setting Preview image...");
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        details: {
          designLink: file.downloadURL
        }
      });
      if (!cardLayout.visibility.preview && canCustomizeCards) {
        await persistLayout({
          ...cardLayout,
          visibility: {
            ...cardLayout.visibility,
            preview: true
          }
        }, "Preview card shown.");
      }
      await onReloadOrder();
      setFileActionStatus(`Preview now uses ${file.fileName}.`);
    } catch (previewFailure) {
      setFileActionStatus(null);
      setFileActionError(previewFailure instanceof Error ? previewFailure.message : "Could not use this file in Preview.");
    } finally {
      setActioningFileId(null);
    }
  }

  async function handleClientFileUpload(file: File | null | undefined) {
    if (!file) return;

    setFileActionError(null);
    setFileActionStatus(null);

    if (!user) {
      setFileActionError("Sign in again before uploading a client file.");
      return;
    }
    if (!canManageClientFiles) {
      setFileActionError("Client Files upload is available to editable Pro and Team workspace members.");
      return;
    }

    const maxUploadSizeMB = Math.min(Math.max(Math.round(moneySettings?.uploadSafetyMaxFileSizeMB ?? 10), 1), 50);
    const requirePolicyAcceptance = moneySettings?.uploadSafetyRequirePolicyAcceptance ?? true;
    if (file.size > maxUploadSizeMB * 1024 * 1024) {
      setFileActionError(`This file is larger than the ${maxUploadSizeMB} MB workspace upload limit.`);
      return;
    }

    let policyAccepted = !requirePolicyAcceptance;
    if (requirePolicyAcceptance) {
      const key = uploadSafetyAcceptanceKey(workspace.id);
      policyAccepted = window.localStorage.getItem(key) === "accepted";
      if (!policyAccepted) {
        const acceptedNow = window.confirm("Upload Safety: only upload safe, legal, work-related files that belong to this order. Accept this upload policy for this browser?");
        if (!acceptedNow) {
          setFileActionError("Accept the upload policy before uploading a client file.");
          return;
        }
        window.localStorage.setItem(key, "accepted");
        policyAccepted = true;
      }
    }

    setActioningFileId("upload");
    setFileActionStatus("Uploading file...");
    try {
      const uploadedFile = await uploadClientFileForOrder({
        workspace,
        orderId: order.id,
        file,
        uploadSafety: {
          policyAccepted,
          maxSizeMB: maxUploadSizeMB
        },
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName
        }
      });
      await onReloadOrder();
      setFileActionStatus(`Uploaded ${uploadedFile.fileName}.`);
    } catch (uploadFailure) {
      setFileActionStatus(null);
      setFileActionError(uploadFailure instanceof Error ? uploadFailure.message : "Upload failed. Please try again.");
    } finally {
      setActioningFileId(null);
      if (clientFileInputRef.current) clientFileInputRef.current.value = "";
    }
  }

  async function handleClientFileUploads(files: File[]) {
    const selectedFiles = files.filter(Boolean);
    if (selectedFiles.length === 0) return;
    for (const file of selectedFiles) {
      await handleClientFileUpload(file);
    }
  }

  function handleClientFileDragOver(event: DragEvent<HTMLDivElement>) {
    const hasFiles = Array.from(event.dataTransfer.types).includes("Files");
    if (!hasFiles) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canManageClientFiles && !actioningFileId ? "copy" : "none";
    setIsClientFileDropTargeted(true);
  }

  function handleClientFileDragLeave(event: DragEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsClientFileDropTargeted(false);
  }

  function handleClientFileDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsClientFileDropTargeted(false);

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    if (actioningFileId) {
      setFileActionError("Wait for the current Client Files action to finish.");
      return;
    }
    void handleClientFileUploads(files);
  }

  async function handleOrderEditSaved(message: string) {
    await onReloadOrder();
    setEditOpen(false);
    setOrderActionError(null);
    setOrderActionStatus(message && message.includes("No changes") ? message : null);
  }

  async function saveFinancePatch(patch: FinancePatch, fieldLabel: string) {
    if (!canInlineEditFinance) {
      setFinanceError("Your workspace role cannot edit financial info.");
      return;
    }

    setFinanceError(null);
    setFinanceStatus(null);
    setSavingFinanceField(fieldLabel);
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        finance: patch
      });
      await onReloadOrder();
    } catch (financeFailure) {
      setFinanceStatus(null);
      setFinanceError(financeFailure instanceof Error ? financeFailure.message : "Could not update financial info.");
    } finally {
      setSavingFinanceField(null);
    }
  }

  function applyOptimisticDetailsPatch(patch: DetailsPatch) {
    const nextPatch: Partial<OrderDetail> = {};

    if (typeof patch.customerName === "string") nextPatch.customerName = patch.customerName;
    if (typeof patch.designName === "string") nextPatch.designName = patch.designName;
    if (typeof patch.watchRef === "string") nextPatch.watchRef = patch.watchRef;
    if (typeof patch.designLink === "string") nextPatch.designLink = patch.designLink;
    if (typeof patch.emailAddress === "string") nextPatch.emailAddress = patch.emailAddress;
    if (typeof patch.whatsappNumber === "string") nextPatch.whatsappNumber = patch.whatsappNumber;
    if (typeof patch.instagramUsername === "string") nextPatch.instagramUsername = patch.instagramUsername;
    if (typeof patch.notes === "string") nextPatch.notes = patch.notes;
    if (typeof patch.tiktokUsername === "string" || typeof patch.address === "string") {
      nextPatch.customFields = {
        ...order.customFields,
        ...(typeof patch.address === "string" ? { communicationAddress: patch.address } : {}),
        ...(typeof patch.tiktokUsername === "string" ? { "communicationChannel::TikTok": patch.tiktokUsername } : {})
      };
    }
    if (Array.isArray(patch.communication)) nextPatch.communication = patch.communication;
    if (typeof patch.deliveryTime === "number") nextPatch.deliveryTime = patch.deliveryTime;
    if (typeof patch.courier === "string") nextPatch.courier = patch.courier;
    if (typeof patch.trackingNumber === "string") nextPatch.trackingNumber = patch.trackingNumber;
    if (typeof patch.isDispatched === "boolean") nextPatch.isDispatched = patch.isDispatched;
    if (typeof patch.isDelivered === "boolean") nextPatch.isDelivered = patch.isDelivered;
    if (typeof patch.priority === "string") nextPatch.priority = patch.priority;
    if (typeof patch.risk === "string") nextPatch.risk = patch.risk;
    if (typeof patch.riskReason === "string") nextPatch.riskReason = patch.riskReason;
    if (typeof patch.invBool1 === "boolean") nextPatch.invBool1 = patch.invBool1;
    if (typeof patch.invBool2 === "boolean") nextPatch.invBool2 = patch.invBool2;
    if (typeof patch.invBool3 === "boolean") nextPatch.invBool3 = patch.invBool3;
    if (typeof patch.invBool4 === "boolean") nextPatch.invBool4 = patch.invBool4;
    if (typeof patch.invNotes === "string") nextPatch.invNotes = patch.invNotes;
    if (patch.extraStatuses) nextPatch.extraStatuses = { ...order.extraStatuses, ...patch.extraStatuses };
    if (patch.customToggles) nextPatch.customToggles = { ...order.customToggles, ...patch.customToggles };
    if (patch.statusNotesSupplier !== undefined) {
      nextPatch.customFields = {
        ...order.customFields,
        ...(nextPatch.customFields ?? {}),
        "status::notesSupplier": String(patch.statusNotesSupplier ?? "")
      };
    }
    if (patch.specialNotes && typeof patch.specialNotes === "object") {
      const nextCustomFields = { ...order.customFields, ...(nextPatch.customFields ?? {}) };
      Object.entries(patch.specialNotes).forEach(([sectionId, value]) => {
        const key = specialNoteCustomFieldKey(sectionId);
        if (!key) return;
        if (String(value ?? "").trim()) nextCustomFields[key] = String(value ?? "");
        else delete nextCustomFields[key];
      });
      nextPatch.customFields = nextCustomFields;
    }

    if (Object.keys(nextPatch).length > 0) {
      onOptimisticOrderPatch?.(nextPatch);
    }
  }

  async function saveDetailsPatch(patch: DetailsPatch, fieldLabel: string) {
    if (!canInlineEditFullDetails) {
      setInlineError("Your workspace role cannot edit full order details.");
      return;
    }

    setInlineError(null);
    setInlineStatus(null);
    setSavingInlineField(fieldLabel);
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        details: patch
      });
      applyOptimisticDetailsPatch(patch);
      await onReloadOrder();
    } catch (saveFailure) {
      setInlineStatus(null);
      setInlineError(saveFailure instanceof Error ? saveFailure.message : "Could not update order detail.");
    } finally {
      setSavingInlineField(null);
    }
  }

  useEffect(() => {
    if (!previewLinkEditing) setPreviewLinkDraft(order.designLink);
  }, [order.designLink, previewLinkEditing]);

  async function savePreviewLink(nextLink: string) {
    if (!canInlineEditFullDetails) {
      setInlineError("Your workspace role cannot edit the preview image.");
      return;
    }

    setInlineError(null);
    setPreviewActioning("link");
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        details: {
          designLink: nextLink.trim()
        }
      });
      setPreviewLinkEditing(false);
      setPreviewMenuOpen(false);
      await onReloadOrder();
    } catch (saveFailure) {
      setInlineError(saveFailure instanceof Error ? saveFailure.message : "Could not update preview image.");
    } finally {
      setPreviewActioning(null);
    }
  }

  async function removePreviewImage() {
    await savePreviewLink("");
  }

  async function uploadPreviewFile(file: File) {
    if (!user) {
      setInlineError("Sign in again before uploading a preview image.");
      return;
    }
    if (!canInlineEditFullDetails) {
      setInlineError("Your workspace role cannot edit the preview image.");
      return;
    }

    setInlineError(null);
    const maxUploadSizeMB = Math.min(Math.max(Math.round(moneySettings?.uploadSafetyMaxFileSizeMB ?? 10), 1), 50);
    const requirePolicyAcceptance = moneySettings?.uploadSafetyRequirePolicyAcceptance ?? true;
    if (file.size > maxUploadSizeMB * 1024 * 1024) {
      setInlineError(`This image is larger than the ${maxUploadSizeMB} MB workspace upload limit.`);
      return;
    }

    let policyAccepted = !requirePolicyAcceptance;
    if (requirePolicyAcceptance) {
      const key = uploadSafetyAcceptanceKey(workspace.id);
      policyAccepted = window.localStorage.getItem(key) === "accepted";
      if (!policyAccepted) {
        const acceptedNow = window.confirm("Upload Safety: only upload safe, legal, work-related files that belong to this order. Accept this upload policy for this browser?");
        if (!acceptedNow) {
          setInlineError("Accept the upload policy before uploading a preview image.");
          return;
        }
        window.localStorage.setItem(key, "accepted");
        policyAccepted = true;
      }
    }

    setPreviewActioning("upload");
    try {
      const downloadURL = await uploadOrderPreviewImage({
        workspace,
        orderId: order.id,
        file,
        uploadSafety: {
          policyAccepted,
          maxSizeMB: maxUploadSizeMB
        },
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName
        }
      });
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        details: {
          designLink: downloadURL
        }
      });
      setPreviewMenuOpen(false);
      await onReloadOrder();
    } catch (uploadFailure) {
      setInlineError(uploadFailure instanceof Error ? uploadFailure.message : "Could not upload preview image.");
    } finally {
      setPreviewActioning(null);
      if (previewFileInputRef.current) previewFileInputRef.current.value = "";
    }
  }

  async function saveStatusPatch(patch: Pick<UpdateOrderInput, "designStatus" | "paintingStatus">, fieldLabel: string) {
    if (!canEditOrderStatus) {
      setInlineError("Your workspace role cannot edit order statuses.");
      return;
    }

    setInlineError(null);
    setInlineStatus(null);
    setSavingInlineField(fieldLabel);
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        ...patch
      });
      onOptimisticOrderPatch?.({
        ...(patch.designStatus ? { designStatus: patch.designStatus } : {}),
        ...(patch.paintingStatus ? { status: patch.paintingStatus } : {})
      });
      await onReloadOrder();
    } catch (saveFailure) {
      setInlineStatus(null);
      setInlineError(saveFailure instanceof Error ? saveFailure.message : "Could not update status.");
    } finally {
      setSavingInlineField(null);
    }
  }

  async function saveStatusDetailsPatch(patch: DetailsPatch, fieldLabel: string) {
    if (!canEditOrderStatus) {
      setInlineError("Your workspace role cannot edit order statuses.");
      return;
    }

    setInlineError(null);
    setInlineStatus(null);
    setSavingInlineField(fieldLabel);
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        details: patch
      });
      applyOptimisticDetailsPatch(patch);
      await onReloadOrder();
    } catch (saveFailure) {
      setInlineStatus(null);
      setInlineError(saveFailure instanceof Error ? saveFailure.message : "Could not update status.");
    } finally {
      setSavingInlineField(null);
    }
  }

  function optimisticTodoPatch(items: ToDoDetail[], patch: TodoPatch): ToDoDetail[] {
    if (patch.action === "add") {
      const title = (patch.title ?? "").trim();
      if (!title) return items;
      return [{
        id: `local-${Date.now()}`,
        title,
        note: patch.note ?? "",
        assignedToUid: patch.assignedToUid ?? "",
        assignedToEmail: patch.assignedToEmail ?? "",
        dueAt: dateFromInputValue(patch.dueDate),
        priority: patch.priority || "Normal",
        isDone: false
      }, ...items];
    }

    const taskId = patch.taskId ?? "";
    const index = items.findIndex(item => item.id === taskId);
    if (index < 0) return items;

    if (patch.action === "delete") {
      return items.filter(item => item.id !== taskId);
    }

    if (patch.action === "toggle") {
      return items.map(item => item.id === taskId ? { ...item, isDone: patch.isDone ?? !item.isDone } : item);
    }

    if (patch.action === "update") {
      return items.map(item => {
        if (item.id !== taskId) return item;
        return {
          ...item,
          title: patch.title ?? item.title,
          note: patch.note ?? item.note,
          priority: patch.priority ?? item.priority,
          dueAt: Object.prototype.hasOwnProperty.call(patch, "dueDate") ? dateFromInputValue(patch.dueDate) : item.dueAt,
          assignedToUid: patch.assignedToUid ?? item.assignedToUid,
          assignedToEmail: patch.assignedToEmail ?? item.assignedToEmail
        };
      });
    }

    if (patch.action === "move") {
      const next = [...items];
      const [moved] = next.splice(index, 1);
      let targetIndex = index;
      if (patch.move === "up") targetIndex = index - 1;
      if (patch.move === "down") targetIndex = index + 1;
      if (patch.move === "top") targetIndex = 0;
      if (patch.move === "bottom") targetIndex = next.length;
      if (targetIndex < 0 || targetIndex > next.length) return items;
      next.splice(targetIndex, 0, moved);
      return next;
    }

    if (patch.action === "reorder") {
      const orderedIds = patch.orderedIds ?? [];
      if (orderedIds.length !== items.length) return items;
      const byId = new Map(items.map(item => [item.id, item]));
      const reordered = orderedIds.map(id => byId.get(id)).filter((item): item is ToDoDetail => Boolean(item));
      return reordered.length === items.length ? reordered : items;
    }

    return items;
  }

  async function saveTodoPatch(patch: TodoPatch, fieldLabel: string) {
    if (!canEditToDoItems) {
      setTodoError("Your workspace role cannot edit To Do items.");
      return;
    }

    setTodoError(null);
    setTodoStatus(null);
    setSavingTodoAction(fieldLabel);
    const previousTodoItems = optimisticTodoItems;
    setOptimisticTodoItems(current => optimisticTodoPatch(current, patch));
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        todo: patch
      });
      if (patch.action === "add") {
        setNewTodoTitle("");
        setNewTodoHasDueDate(false);
        setNewTodoPriority("Normal");
      }
      setOpenTodoMenuId(null);
      setDraggingTodoId(null);
      setDragOverTodoId(null);
      setEditingTodoTitleId(null);
    } catch (saveFailure) {
      setOptimisticTodoItems(previousTodoItems);
      setTodoStatus(null);
      setTodoError(saveFailure instanceof Error ? saveFailure.message : "Could not update To Do.");
    } finally {
      setSavingTodoAction(null);
    }
  }

  function reorderedTodoIdsForDrop(draggedId: string, targetId: string, event: DragEvent<HTMLElement>) {
    if (!draggedId || !targetId || draggedId === targetId) return null;
    const sourceIndex = optimisticTodoItems.findIndex(item => item.id === draggedId);
    const targetIndex = optimisticTodoItems.findIndex(item => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return null;

    const next = [...optimisticTodoItems];
    const [dragged] = next.splice(sourceIndex, 1);
    const targetAfterRemoval = next.findIndex(item => item.id === targetId);
    if (targetAfterRemoval < 0) return null;

    const bounds = event.currentTarget.getBoundingClientRect();
    const dropAfterTarget = event.clientY > bounds.top + bounds.height / 2;
    next.splice(targetAfterRemoval + (dropAfterTarget ? 1 : 0), 0, dragged);
    const orderedIds = next.map(item => item.id);
    return orderedIds.every((id, index) => id === optimisticTodoItems[index]?.id) ? null : orderedIds;
  }

  function dropTodoTask(targetId: string, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const draggedId = draggingTodoId;
    setDraggingTodoId(null);
    setDragOverTodoId(null);
    if (!canEditToDoItems || !draggedId || Boolean(savingTodoAction)) return;
    const orderedIds = reorderedTodoIdsForDrop(draggedId, targetId, event);
    if (!orderedIds) return;
    void saveTodoPatch({ action: "reorder", orderedIds }, "Task order");
  }

  function toggleCommunicationChannel(channel: string) {
    const selected = hasCommunicationChannel(order.communication, channel);
    const nextChannels = selected
      ? order.communication.filter(item => communicationChannelKey(item) !== communicationChannelKey(channel))
      : [...order.communication, channel];
    void saveDetailsPatch({ communication: nextChannels }, "Communication channels");
  }

  function addTodoItem() {
    const title = newTodoTitle.trim();
    if (!title) {
      setTodoError("Add a task title first.");
      return;
    }
    void saveTodoPatch({
      action: "add",
      title,
      priority: newTodoPriority,
      dueDate: newTodoHasDueDate ? newTodoDueDate : "",
      assignedToUid: canSeeTeamAssignment ? newTodoAssignedToUid : "",
      assignedToEmail: canSeeTeamAssignment && newTodoAssignedToUid ? newTodoAssignee.email : ""
    }, "Task");
  }

  function startEditingTodoTitle(task: ToDoDetail) {
    if (!canEditToDoItems || savingTodoAction) return;
    setOpenTodoMenuId(null);
    setEditingTodoTitleId(task.id);
    setEditingTodoTitle(task.title);
    setTodoError(null);
  }

  function cancelTodoTitleEdit() {
    setEditingTodoTitleId(null);
    setEditingTodoTitle("");
  }

  function saveTodoTitleEdit(task: ToDoDetail) {
    const nextTitle = editingTodoTitle.trim();
    if (!nextTitle) {
      setTodoError("Task title is required.");
      return;
    }
    if (nextTitle === task.title.trim()) {
      cancelTodoTitleEdit();
      return;
    }
    void saveTodoPatch({
      action: "update",
      taskId: task.id,
      title: nextTitle
    }, "Task title");
  }

  function todoAssigneeLabel(task: ToDoDetail) {
    const assignedUid = task.assignedToUid.trim();
    const assignedEmail = task.assignedToEmail.trim();
    if (!assignedUid && !assignedEmail) return "Unassigned";
    if (assignedUid === user?.uid) return user.displayName || user.email || "Me";
    const member = teamMembers.find(item => item.id === assignedUid);
    if (member) return member.displayName || member.email || member.id;
    return assignedEmail || assignedUid;
  }

  function todoDueLabel(date: Date | null) {
    return date ? formatDate(date) : "No due date";
  }

  function todoPriorityClass(priority: string) {
    const normalized = priority.trim().toLowerCase();
    if (normalized === "urgent") return "urgent";
    if (normalized === "high") return "high";
    if (normalized === "low") return "low";
    return "normal";
  }

  function assignTodoTask(task: ToDoDetail, uid: string, email: string) {
    void saveTodoPatch({
      action: "update",
      taskId: task.id,
      assignedToUid: uid,
      assignedToEmail: email
    }, "Task assigned");
  }

  function setTodoDueDate(task: ToDoDetail, dueDate: string) {
    void saveTodoPatch({
      action: "update",
      taskId: task.id,
      dueDate
    }, "Task due date");
  }

  function moveTodoTask(task: ToDoDetail, move: NonNullable<TodoPatch["move"]>) {
    void saveTodoPatch({
      action: "move",
      taskId: task.id,
      move
    }, "Task order");
  }

  function downloadTodoReminder(task: ToDoDetail) {
    setOpenTodoMenuId(null);
    setTodoStatus(null);
    setTodoError(null);

    if (!canUseCalendarExport) {
      setTodoError("Apple Calendar and Reminders are available from StudioFlow Lite.");
      return;
    }

    try {
      downloadTodoReminderFile(order, task);
      setTodoStatus("Reminder file downloaded.");
    } catch (error) {
      setTodoError(error instanceof Error ? error.message : "Reminder file could not be created.");
    }
  }

  async function saveSchedulePatch(patch: SchedulePatch, fieldLabel: string) {
    if (!canEditScheduleItems) {
      setScheduleError("Your workspace role cannot edit Schedule & Alerts.");
      return;
    }

    setScheduleError(null);
    setScheduleStatus(null);
    setSavingScheduleAction(fieldLabel);
    try {
      await updateOrderFromWeb(workspace, {
        orderId: order.id,
        schedule: patch
      });
      await onReloadOrder();
      if (patch.action === "add") {
        setNewScheduleTitle("Follow up customer");
        setNewScheduleNote("");
        setNewScheduleDueAt(dateTimeInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
        setNewSchedulePriority("Normal");
        setNewScheduleNotify(canNotifyScheduleItems);
      }
      setScheduleStatus(patch.action === "add" ? "Reminder saved." : "Schedule updated.");
    } catch (saveFailure) {
      setScheduleStatus(null);
      setScheduleError(saveFailure instanceof Error ? saveFailure.message : "Could not update Schedule & Alerts.");
    } finally {
      setSavingScheduleAction(null);
    }
  }

  function applyQuickReminder(item: ScheduleHeadingItem) {
    const nextDate = new Date();
    nextDate.setMinutes(nextDate.getMinutes() + Number(item.hours || 0) * 60);
    nextDate.setDate(nextDate.getDate() + Number(item.days || 0));
    setNewScheduleTitle(item.title);
    setNewScheduleDueAt(dateTimeInputValue(nextDate));
    setNewSchedulePriority((item.priority as NonNullable<SchedulePatch["priority"]>) || "Normal");
    setNewScheduleNotify(canNotifyScheduleItems && item.notify !== false);
  }

  function addScheduleReminder() {
    const title = newScheduleTitle.trim();
    if (!title) {
      setScheduleError("Please add a reminder title.");
      setScheduleStatus(null);
      return;
    }
    if (!newScheduleDueAt) {
      setScheduleError("Please choose a reminder date.");
      setScheduleStatus(null);
      return;
    }
    void saveSchedulePatch({
      action: "add",
      title,
      note: newScheduleNote,
      dueAt: new Date(newScheduleDueAt).toISOString(),
      priority: newSchedulePriority,
      notify: canNotifyScheduleItems && newScheduleNotify
    }, "Add reminder");
  }

  function exportOrderPdf() {
    setInlineError(null);
    const materialChecks = materialDefaultCheckItems(blockHeadingSettings).map((item, index) => ({
      title: item.title,
      value: materialDefaultCheckValue(order, index, item.title) ? "Yes" : "No"
    }));
    const materialToggles = blockHeadingSettings?.materialsToggles
      ?.map(toggle => ({ ...toggle, title: toggle.title.trim() }))
      .filter(toggle => Boolean(toggle.title))
      .map(toggle => ({
        title: toggle.title,
        value: materialToggleValue(order, toggle.title) ? "Yes" : "No"
      })) ?? [];
    const statusSteps = productionSteps().map((step, index) => ({
      title: step.title,
      value: index === 0
        ? (order.designStatus || "Not Yet")
        : index === 1
          ? (order.status || "Not Yet")
          : statusStepValue(step)
    }));
    const statusToggles = blockHeadingSettings?.customToggles
      ?.map(toggle => ({ ...toggle, title: toggle.title.trim() }))
      .filter(toggle => Boolean(toggle.title))
      .map(toggle => ({
        title: toggle.title,
        value: statusCustomToggleValue(order.customToggles, toggle) ? "Yes" : "No"
      })) ?? [];

    try {
      openOrderPdfPrint(order, workspace.name, {
        settings: moneySettings,
        canSeeFinance,
        canSeeAdvancedFinance,
        hideNumbers,
        previewUrl: order.designLink,
        statusSteps,
        statusToggles,
        materialItems: [...materialChecks, ...materialToggles]
      });
    } catch (exportError) {
      setInlineError(exportError instanceof Error ? exportError.message : "Order PDF could not be opened.");
    }
  }

  function renderCardMenu(cardId: OrderDetailCardId) {
    const menuOpen = openCardMenuId === cardId;
    const locked = !canCustomizeCards || !layoutReady;
    const headingAvailable = WEB_BLOCK_HEADING_CARD_IDS.has(cardId);

    return (
      <div className="order-card-menu-wrap">
        <button
          aria-label={`${cardLabel(cardId)} menu`}
          className="order-card-menu-button"
          type="button"
          onClick={() => setOpenCardMenuId(current => current === cardId ? null : cardId)}
        >
          ...
        </button>
        {menuOpen ? (
          <div className="order-card-menu-panel">
            {locked ? (
              <p className="order-card-menu-note">
                {canCustomizeCards ? "Card layout is loading." : "Card customization is available from StudioFlow Lite."}
              </p>
            ) : null}
            {cardId === "todo" ? (
              <button
                type="button"
                onClick={() => {
                  setOpenCardMenuId(null);
                  setTodoError(null);
                  try {
                    openTodoPdfPrint(order, optimisticTodoItems, workspace.name);
                  } catch (exportError) {
                    setTodoError(exportError instanceof Error ? exportError.message : "To Do PDF could not be opened.");
                  }
                }}
              >
                Export To Do PDF
              </button>
            ) : null}
            {cardId === "historyLog" && canUseLiteWorkspaceCards ? (
              <button
                type="button"
                onClick={() => {
                  setOpenCardMenuId(null);
                  setInlineError(null);
                  try {
                    openHistoryPdfPrint(order, workspace.name);
                  } catch (exportError) {
                    setInlineError(exportError instanceof Error ? exportError.message : "History Log PDF could not be opened.");
                  }
                }}
              >
                Export History Log PDF
              </button>
            ) : null}
            <button type="button" disabled={locked || savingLayout} onClick={() => hideCard(cardId)}>
              Hide Block
            </button>
            <button
              type="button"
              disabled={locked || savingLayout}
              onClick={() => editCardHeading(cardId)}
              title={headingAvailable ? "Edit the headings inside this block" : "This card does not have web heading editing yet"}
            >
              Edit Block Headings
            </button>
            <div className="order-card-menu-label">Color</div>
            <div className="order-card-color-grid">
              {CARD_COLOR_OPTIONS.map(color => (
                <button
                  key={color}
                  className={cardProfileColor(cardLayout, cardId) === color ? "is-selected" : ""}
                  type="button"
                  disabled={locked || savingLayout}
                  onClick={() => setCardColor(cardId, color)}
                >
                  <span data-card-color={color} />
                  {color}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function renderCard(cardId: OrderDetailCardId) {
    if (!cardLayout.visibility[cardId]) return null;

    switch (cardId) {
      case "preview":
        return (
          <section key={cardId} className="card order-detail-card is-preview-card">
            {renderCardTitle(cardId)}
            <div className="app-preview-stage">
              <input
                ref={previewFileInputRef}
                type="file"
                accept={ORDER_PREVIEW_IMAGE_ACCEPT}
                hidden
                onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  if (file) void uploadPreviewFile(file);
                }}
              />
              {order.designLink && isProbablyImageUrl(order.designLink) ? (
                <img src={order.designLink} alt={order.designName || "Order preview"} className="app-preview-image" />
              ) : (
                <div className="app-preview-empty">
                  <span className="app-preview-icon image-placeholder-icon" aria-hidden="true"><CardIconGlyph icon="photo" /></span>
                  <strong>No preview image provided.</strong>
                </div>
              )}
              {previewLinkEditing ? (
                <form
                  className="app-preview-link-editor"
                  onSubmit={event => {
                    event.preventDefault();
                    void savePreviewLink(previewLinkDraft);
                  }}
                >
                  <span aria-hidden="true">↗</span>
                  <input
                    value={previewLinkDraft}
                    autoFocus
                    disabled={Boolean(previewActioning)}
                    placeholder="Paste photo link..."
                    onChange={event => setPreviewLinkDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Escape") {
                        setPreviewLinkDraft(order.designLink);
                        setPreviewLinkEditing(false);
                      }
                    }}
                  />
                  <button type="submit" disabled={Boolean(previewActioning)}>✓</button>
                  <button
                    type="button"
                    disabled={Boolean(previewActioning)}
                    onClick={() => {
                      setPreviewLinkDraft(order.designLink);
                      setPreviewLinkEditing(false);
                    }}
                  >
                    ×
                  </button>
                </form>
              ) : (
                <div className="app-preview-actions">
                  <button
                    className="app-preview-float"
                    type="button"
                    disabled={Boolean(previewActioning)}
                    aria-expanded={previewMenuOpen}
                    aria-label="Preview actions"
                    onClick={() => setPreviewMenuOpen(current => !current)}
                  >
                    {previewActioning ? "…" : "..."}
                  </button>
                  {previewMenuOpen ? (
                    <div className="app-preview-action-menu">
                      <button
                        type="button"
                        disabled={!canInlineEditFullDetails || Boolean(previewActioning)}
                        onClick={() => previewFileInputRef.current?.click()}
                      >
                        {order.designLink ? "Replace Image" : "Upload Image"}
                      </button>
                      <button
                        type="button"
                        disabled={!canInlineEditFullDetails || Boolean(previewActioning)}
                        onClick={() => {
                          setPreviewLinkDraft(order.designLink);
                          setPreviewLinkEditing(true);
                          setPreviewMenuOpen(false);
                        }}
                      >
                        {order.designLink ? "Edit photo link" : "Paste photo link..."}
                      </button>
                      {order.designLink ? (
                        <a href={order.designLink} target="_blank" rel="noreferrer">
                          Open
                        </a>
                      ) : null}
                      {order.designLink ? (
                        <button
                          className="is-danger"
                          type="button"
                          disabled={!canInlineEditFullDetails || Boolean(previewActioning)}
                          onClick={() => {
                            void removePreviewImage();
                          }}
                        >
                          Remove Preview Image
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </section>
        );
      case "summary": {
        const summaryStep1 = resolvedSummaryStep(blockHeadingSettings?.summaryStep1, 0);
        const summaryStep2 = resolvedSummaryStep(blockHeadingSettings?.summaryStep2, 1);
        const summaryValue1 = summaryStepValue(summaryStep1);
        const summaryValue2 = summaryStepValue(summaryStep2);
        const deliveryTone = summaryDeliveryTone(order);

        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel app-summary-panel">
              <div className="app-summary-top">
                <div className="app-summary-value">
                  <span>Order Value</span>
                  <strong>{canSeeFinance ? money(order.paidAmount + order.remainingAmount, hideNumbers) : "Hidden"}</strong>
                </div>
                <div className="app-summary-status-list">
                  <div className="app-summary-status-row">
                    <span>{summaryStep1}</span>
                    <b className={`app-summary-status-badge ${dynamicStatusTone(summaryValue1)}`}>{summaryValue1}</b>
                  </div>
                  <div className="app-summary-status-row">
                    <span>{summaryStep2}</span>
                    <b className={`app-summary-status-badge ${dynamicStatusTone(summaryValue2)}`}>{summaryValue2}</b>
                  </div>
                </div>
              </div>
              <div className="app-card-divider" />
              <div className="app-summary-bottom">
                <div className="app-summary-date-block">
                  <span>Placed On</span>
                  <strong>
                    <CardIconGlyph icon="calendar" />
                    {formatShortDate(order.paymentDate)}
                  </strong>
                </div>
                <div className="app-summary-date-block">
                  <span>Delivery In</span>
                  <strong className={`app-summary-delivery ${deliveryTone}`}>
                    <CardIconGlyph icon="historyClock" />
                    {summaryDeliveryLabel(order)}
                  </strong>
                </div>
              </div>
            </div>
          </section>
        );
      }
      case "materials": {
        const materialChecks = materialDefaultCheckItems(blockHeadingSettings);
        const materialToggles = blockHeadingSettings?.materialsToggles
          ?.map(toggle => ({ ...toggle, title: toggle.title.trim() }))
          .filter(toggle => Boolean(toggle.title)) ?? [];
        const showMaterialsNotes = blockHeadingSettings?.showMaterialsNotesSupplier ?? true;
        const materialsNotesLabel = blockHeadingSettings?.materialsNotesSupplierLabel?.trim() || "Notes / Supplier";
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            {canUseLiteWorkspaceCards ? (
              <div className="app-card-panel app-materials-panel">
                {materialChecks.map((item, index) => {
                  const fieldKey = `materials-default-${index}-${item.title}`;
                  return (
                    <InlineYesNoRow
                      key={item.id}
                      label={item.title}
                      value={materialDefaultCheckValue(order, index, item.title)}
                      disabled={!canInlineEditFullDetails}
                      saving={savingInlineField === fieldKey}
                      onSave={value => saveDetailsPatch(materialDefaultCheckPatch(index, item.title, value), fieldKey)}
                    />
                  );
                })}
                {materialToggles.length > 0 ? (
                  <>
                    <div className="app-card-divider" />
                    {materialToggles.map(toggle => {
                      const title = toggle.title.trim();
                      const fieldKey = `materials-toggle-${toggle.id || title}`;
                      return (
                        <InlineYesNoRow
                          key={toggle.id || title}
                          label={title || "Material Check"}
                          value={materialToggleValue(order, title)}
                          disabled={!canInlineEditFullDetails}
                          saving={savingInlineField === fieldKey}
                          onSave={value => saveDetailsPatch({ materialsToggles: { [title]: value } }, fieldKey)}
                        />
                      );
                    })}
                  </>
                ) : null}
                {showMaterialsNotes ? (
                  <>
                    <div className="app-card-divider" />
                    <InlineValueRow
                      label={materialsNotesLabel}
                      value={order.invNotes}
                      displayValue={order.invNotes || ""}
                      disabled={!canInlineEditFullDetails}
                      saving={savingInlineField === "Materials notes"}
                      onSave={value => saveDetailsPatch({ invNotes: String(value) }, "Materials notes")}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <LockedInline title="Materials & Inventory locked" note="Materials cards are available from StudioFlow Lite." />
            )}
          </section>
        );
      }
      case "priority":
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel">
              <InlineSelectRow
                label="Priority"
                value={order.priority || "Normal"}
                options={PRIORITY_OPTIONS}
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Priority"}
                onSave={value => saveDetailsPatch({ priority: value }, "Priority")}
              />
              <InlineSelectRow
                label="Risk"
                value={order.risk || "None"}
                options={RISK_OPTIONS}
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Risk"}
                onSave={value => saveDetailsPatch({ risk: value }, "Risk")}
              />
              {order.risk && order.risk !== "None" ? (
                <InlineSelectRow
                  label="Risk reason"
                  value={order.riskReason || "-"}
                  options={RISK_REASON_OPTIONS}
                  disabled={!canEditWorkflowFields}
                  saving={savingInlineField === "Risk reason"}
                  onSave={value => saveDetailsPatch({ riskReason: value }, "Risk reason")}
                />
              ) : null}
            </div>
          </section>
        );
      case "delivery": {
        const deliveryTone = summaryDeliveryTone(order);
        const deliveryMetricTone: ValueTone = deliveryTone === "yellow" ? "yellow" : deliveryTone === "red" ? "red" : deliveryTone === "green" ? "green" : "gray";
        const deliveryValueTone: ValueTone = deliveryTone === "yellow" ? "yellow" : deliveryTone === "red" ? "negative" : deliveryTone === "green" ? "green" : "gray";
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel app-delivery-panel">
              <div className="app-delivery-grid">
                <SoftMetricCard label="Created Date" value={formatShortDate(order.paymentDate)} tone="blue" icon="▦" />
                <SoftMetricCard label="Delivery Due" value={formatShortDate(order.dueDate)} tone={deliveryMetricTone} icon="⚑" />
              </div>
              <div className={`app-time-remaining is-${deliveryTone}`}>
                <span>◔</span>
                <div>
                  <strong>Time Remaining</strong>
                  <b>{remainingDaysLabel(order.dueDate)}</b>
                </div>
              </div>
              <div className="app-calendar-card">
                <button
                  className={`button secondary app-calendar-button is-${deliveryTone}`}
                  type="button"
                  onClick={handleDownloadCalendarEvent}
                  disabled={!canUseCalendarExport || !order.paymentDate || !order.dueDate}
                >
                  ▦ Add to Calendar
                </button>
                <p>Downloads an all-day calendar file from the created date to the delivery due date.</p>
                {!canUseCalendarExport ? (
                  <p className="app-calendar-status muted-copy">Available from StudioFlow Lite.</p>
                ) : null}
                {calendarStatus ? <p className="app-calendar-status success-copy">{calendarStatus}</p> : null}
                {calendarError ? <p className="app-calendar-status layout-error">{calendarError}</p> : null}
              </div>
              <div className="app-card-divider" />
              <InlineValueRow
                label="Delivery Time"
                value={order.deliveryTime > 0 ? String(order.deliveryTime) : ""}
                displayValue={order.deliveryTime > 0 ? `${order.deliveryTime} days` : "-"}
                inputType="number"
                tone={deliveryValueTone}
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Delivery Time"}
                onSave={value => saveDetailsPatch({ deliveryTime: Number(value) }, "Delivery Time")}
              />
              <InlineValueRow
                label="Delivery Due"
                value={dateInputValue(order.dueDate)}
                displayValue={formatDate(order.dueDate)}
                inputType="date"
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Delivery Due"}
                onSave={value => saveDetailsPatch({ deliveryDueDate: String(value) }, "Delivery Due")}
              />
              <InlineValueRow
                label="Created Date"
                value={dateInputValue(order.paymentDate)}
                displayValue={formatDate(order.paymentDate)}
                inputType="date"
                disabled={!canEditOrderFully}
                saving={savingInlineField === "Created Date"}
                onSave={value => saveDetailsPatch({ paymentDate: String(value) }, "Created Date")}
              />
            </div>
          </section>
        );
      }
      case "customer":
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel app-customer-panel">
              <InlineValueRow
                label="Customer Name"
                value={order.customerName}
                disabled={!canInlineEditFullDetails}
                saving={savingInlineField === "Customer Name"}
                onSave={value => saveDetailsPatch({ customerName: String(value) }, "Customer Name")}
              />
              <InlineValueRow
                label="Design Name"
                value={order.designName || ""}
                disabled={!canInlineEditFullDetails}
                saving={savingInlineField === "Design Name"}
                onSave={value => saveDetailsPatch({ designName: String(value) }, "Design Name")}
              />
              <InlineValueRow
                label="Reference"
                value={order.watchRef || ""}
                disabled={!canInlineEditFullDetails}
                saving={savingInlineField === "Reference"}
                onSave={value => saveDetailsPatch({ watchRef: String(value) }, "Reference")}
              />
              {order.designLink ? <AppValueRow label="Design Link" value="Open link" href={order.designLink} /> : <AppValueRow label="Design Link" value="" />}
              <div className="app-card-divider" />
              <div className="app-subsection-title"><span>▱</span><strong>Communication</strong></div>
              <InlineValueRow
                label="Telephone"
                value={order.whatsappNumber || ""}
                disabled={!canInlineEditFullDetails}
                saving={savingInlineField === "Telephone"}
                onSave={value => saveDetailsPatch({ whatsappNumber: String(value) }, "Telephone")}
              />
              <InlineValueRow
                label="Email"
                value={order.emailAddress || ""}
                inputType="email"
                disabled={!canInlineEditFullDetails}
                saving={savingInlineField === "Email"}
                onSave={value => saveDetailsPatch({ emailAddress: String(value) }, "Email")}
              />
              <InlineValueRow
                label="Address"
                value={order.customFields.communicationAddress || order.customFields.Address || ""}
                disabled={!canInlineEditFullDetails}
                saving={savingInlineField === "Address"}
                onSave={value => saveDetailsPatch({ address: String(value) }, "Address")}
              />
              <div className="app-value-row">
                <span>Channel</span>
                <div className="app-channel-pills">
                  {COMMUNICATION_CHANNELS.map(item => (
                    <button
                      key={item}
                      className={hasCommunicationChannel(order.communication, item) ? "is-selected" : ""}
                      type="button"
                      disabled={!canInlineEditFullDetails || savingInlineField === "Communication channels"}
                      onClick={() => toggleCommunicationChannel(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              {hasCommunicationChannel(order.communication, "Instagram") ? (
                <InlineValueRow
                  label="Instagram"
                  value={order.instagramUsername || ""}
                  disabled={!canInlineEditFullDetails}
                  saving={savingInlineField === "Instagram"}
                  onSave={value => saveDetailsPatch({ instagramUsername: String(value) }, "Instagram")}
                />
              ) : null}
              {hasCommunicationChannel(order.communication, "WhatsApp") ? (
                <InlineValueRow
                  label="WhatsApp"
                  value={order.whatsappNumber || ""}
                  disabled={!canInlineEditFullDetails}
                  saving={savingInlineField === "WhatsApp"}
                  onSave={value => saveDetailsPatch({ whatsappNumber: String(value) }, "WhatsApp")}
                />
              ) : null}
              {hasCommunicationChannel(order.communication, "TikTok") ? (
                <InlineValueRow
                  label="TikTok"
                  value={order.customFields["communicationChannel::TikTok"] || ""}
                  disabled={!canInlineEditFullDetails}
                  saving={savingInlineField === "TikTok"}
                  onSave={value => saveDetailsPatch({ tiktokUsername: String(value) }, "TikTok")}
                />
              ) : null}
              <div className="app-card-divider" />
              <AppValueRow label="Customer Notes" value={order.customFields.communicationCustomerNotes || ""} />
            </div>
          </section>
        );
      case "financial":
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            {canSeeFinance ? (
              <>
                {financeStatus ? <p className="layout-status finance-inline-message">{financeStatus}</p> : null}
                {financeError ? <p className="layout-error finance-inline-message">{financeError}</p> : null}
                <div className="app-card-panel app-financial-panel">
                  {canSeeAdvancedFinance ? (
                  <>
                    <FinanceInlineRow
                      label="Paid"
                      displayValue={money(order.paidAmount, hideNumbers)}
                      value={order.paidAmount}
                      tone="positive"
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "Paid"}
                      onSave={value => saveFinancePatch({ paidAmount: Number(value) }, "Paid")}
                    />
                    <DetailRow label="Remaining" value={money(order.remainingAmount, hideNumbers)} tone="positive" />
                    <FinancePaymentReceivedRow
                      remainingAmount={order.remainingAmount}
                      disabled={!canInlineEditFinance || order.remainingAmount <= 0}
                      saving={savingFinanceField === "Full payment"}
                      onSave={() => saveFinancePatch({ fullPaymentReceived: true }, "Full payment")}
                    />
                    <FinanceInlineRow
                      label="Payment method"
                      displayValue={order.paymentMethod || "-"}
                      value={order.paymentMethod || "Card"}
                      mode="select"
                      options={["Card", "Cash", "Bank Transfer", "PayPal", "Apple Pay", "Other"]}
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "Payment method"}
                      onSave={value => saveFinancePatch({ paymentMethod: String(value) }, "Payment method")}
                    />
                    <div className="app-card-divider" />
                    <FinanceInlineRow
                      label="Cost (Base)"
                      displayValue={money(order.watchPurchasePrice, hideNumbers)}
                      value={order.watchPurchasePrice}
                      tone="negative"
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "Cost (Base)"}
                      onSave={value => saveFinancePatch({ watchPurchasePrice: Number(value) }, "Cost (Base)")}
                    />
                    <FinanceInlineRow
                      label="Platform Fee"
                      displayValue={money(order.paymentFee, hideNumbers)}
                      value={order.paymentFee}
                      tone="negative-soft"
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "Platform Fee"}
                      onSave={value => saveFinancePatch({ paymentFee: Number(value) }, "Platform Fee")}
                    />
                    <FinanceInlineRow
                      label="Shipping Cost"
                      displayValue={money(order.deliveryCost, hideNumbers)}
                      value={order.deliveryCost}
                      tone="negative"
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "Shipping Cost"}
                      onSave={value => saveFinancePatch({ deliveryCost: Number(value) }, "Shipping Cost")}
                    />
                    <div className="app-card-divider" />
                    <FinanceInlineRow
                      label="VAT Rule"
                      displayValue={order.taxType || "-"}
                      value={order.taxType || "Revenue"}
                      mode="select"
                      options={["Revenue", "Profit"]}
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "VAT Rule"}
                      onSave={value => saveFinancePatch({ taxType: String(value) }, "VAT Rule")}
                    />
                    <FinanceInlineRow
                      label="VAT Rate (%)"
                      displayValue={`${order.taxRate}%`}
                      value={order.taxRate}
                      tone="negative"
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "VAT Rate (%)"}
                      onSave={value => saveFinancePatch({ taxRate: Number(value) }, "VAT Rate (%)")}
                    />
                    <DetailRow label="VAT Amount" value={money(order.taxAmount, hideNumbers)} tone="negative-soft" />
                    <div className="app-card-divider" />
                    <DetailRow label="Final Profit" value={money(order.netProfit, hideNumbers)} tone="positive" emphasis />
                  </>
                ) : (
                  <>
                    <FinanceInlineRow
                      label="Paid"
                      displayValue={money(order.paidAmount, hideNumbers)}
                      value={order.paidAmount}
                      tone="positive"
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "Paid"}
                      onSave={value => saveFinancePatch({ paidAmount: Number(value) }, "Paid")}
                    />
                    <FinanceInlineRow
                      label="Cost (Base)"
                      displayValue={money(order.watchPurchasePrice, hideNumbers)}
                      value={order.watchPurchasePrice}
                      tone="negative"
                      disabled={!canInlineEditFinance}
                      saving={savingFinanceField === "Cost (Base)"}
                      onSave={value => saveFinancePatch({ watchPurchasePrice: Number(value) }, "Cost (Base)")}
                    />
                    <LockedInline title="Advanced financial fields" note="Remaining, VAT, shipping, platform fee and final profit are available from StudioFlow Lite." />
                  </>
                  )}
                </div>
              </>
            ) : (
              <LockedInline title="Financial info hidden" note="Workflow Only users cannot view price and finance details." />
            )}
          </section>
        );
      case "status": {
        const statusSteps = productionSteps();
        const statusToggles = blockHeadingSettings?.customToggles
          ?.map(toggle => ({ ...toggle, title: toggle.title.trim() }))
          .filter(toggle => Boolean(toggle.title)) ?? [];
        const showStatusNotesSupplier = Boolean(blockHeadingSettings?.showStatusNotesSupplier);
        const statusNotesSupplierLabel = blockHeadingSettings?.statusNotesSupplierLabel?.trim() || "Notes / Supplier";
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel">
              {statusSteps.map((step, index) => {
                const stepTitle = step.title;
                if (index === 0) {
                  return (
                    <InlineSelectRow
                      key={`${stepTitle}-${index}`}
                      label={stepTitle}
                      value={order.designStatus || "Not Yet"}
                      options={statusOptions}
                      disabled={!canEditOrderStatus}
                      saving={savingInlineField === stepTitle}
                      statusColor
                      onSave={value => saveStatusPatch({ designStatus: value }, stepTitle)}
                    />
                  );
                }
                if (index === 1) {
                  return (
                    <InlineSelectRow
                      key={`${stepTitle}-${index}`}
                      label={stepTitle}
                      value={order.status || "Not Yet"}
                      options={statusOptions}
                      disabled={!canEditOrderStatus}
                      saving={savingInlineField === stepTitle}
                      statusColor
                      onSave={value => saveStatusPatch({ paintingStatus: value }, stepTitle)}
                    />
                  );
                }
                return (
                  <InlineSelectRow
                    key={step.id || `${stepTitle}-${index}`}
                    label={stepTitle}
                    value={statusStepValue(step)}
                    options={statusOptions}
                    disabled={!canEditOrderStatus}
                    saving={savingInlineField === stepTitle}
                    statusColor
                    onSave={value => saveStatusDetailsPatch({ extraStatuses: { [statusStepStorageKey(step)]: value } }, stepTitle)}
                  />
                );
              })}
              {statusToggles.length > 0 ? <div className="app-card-divider" /> : null}
              {statusToggles.map(toggle => (
                <InlineYesNoRow
                  key={toggle.id}
                  label={toggle.title}
                  value={statusCustomToggleValue(order.customToggles, toggle)}
                  disabled={!canEditOrderStatus}
                  saving={savingInlineField === toggle.id}
                  onSave={value => {
                    const storageKey = statusCustomToggleStorageKey(toggle);
                    return saveStatusDetailsPatch({ customToggles: { [storageKey]: value } }, toggle.id);
                  }}
                />
              ))}
              {showStatusNotesSupplier ? (
                <>
                  <div className="app-card-divider" />
                  <InlineValueRow
                    label={statusNotesSupplierLabel}
                    value={order.customFields["status::notesSupplier"] || ""}
                    disabled={!canEditOrderStatus}
                    saving={savingInlineField === statusNotesSupplierLabel}
                    onSave={value => saveStatusDetailsPatch({ statusNotesSupplier: String(value) }, statusNotesSupplierLabel)}
                  />
                </>
              ) : null}
            </div>
          </section>
        );
      }
      case "shipping":
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel">
              <InlineSelectRow
                label="Courier"
                value={order.courier || "Auto Detect"}
                options={COURIER_OPTIONS}
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Courier"}
                onSave={value => saveDetailsPatch({ courier: value }, "Courier")}
              />
              <InlineValueRow
                label="Tracking"
                value={order.trackingNumber || ""}
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Tracking"}
                onSave={value => saveDetailsPatch({ trackingNumber: String(value) }, "Tracking")}
              />
              <InlineSelectRow
                label="Dispatched"
                value={order.isDispatched ? "Yes" : "No"}
                options={["Yes", "No"]}
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Dispatched"}
                onSave={value => saveDetailsPatch({ isDispatched: value === "Yes" }, "Dispatched")}
              />
              <InlineSelectRow
                label="Delivered"
                value={order.isDelivered ? "Yes" : "No"}
                options={["Yes", "No"]}
                disabled={!canEditWorkflowFields}
                saving={savingInlineField === "Delivered"}
                onSave={value => saveDetailsPatch({ isDelivered: value === "Yes" }, "Delivered")}
              />
            </div>
          </section>
        );
      case "schedule":
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel app-schedule-panel">
              {scheduleStatus ? <p className="layout-status finance-inline-message">{scheduleStatus}</p> : null}
              {scheduleError ? <p className="layout-error finance-inline-message">{scheduleError}</p> : null}
              <div className="app-schedule-quick-row">
                <span>Quick Reminder</span>
                <select
                  className="input app-schedule-quick-select"
                  value=""
                  disabled={!canEditScheduleItems}
                  onChange={event => {
                    const selected = quickReminderOptions.find(item => item.id === event.target.value);
                    if (selected) applyQuickReminder(selected);
                  }}
                >
                  <option value="">Select reminder</option>
                  {quickReminderOptions.map(item => (
                    <option key={item.id} value={item.id}>{item.title}</option>
                  ))}
                </select>
              </div>
              <div className="app-schedule-form">
                <input
                  className="input"
                  value={newScheduleTitle}
                  disabled={!canEditScheduleItems}
                  placeholder="Reminder title"
                  onChange={event => setNewScheduleTitle(event.target.value)}
                />
                <div className="app-schedule-inline-controls">
                  <label>
                    <span>Date & Time</span>
                    <input
                      className="input"
                      type="datetime-local"
                      value={newScheduleDueAt}
                      disabled={!canEditScheduleItems}
                      onChange={event => setNewScheduleDueAt(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Priority</span>
                    <select
                      className="input"
                      value={newSchedulePriority}
                      disabled={!canEditScheduleItems}
                      onChange={event => setNewSchedulePriority(event.target.value as NonNullable<SchedulePatch["priority"]>)}
                    >
                      <option value="Low">Low</option>
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </label>
                  <label className="todo-switch app-schedule-notify">
                    <span>Notify</span>
                    <input
                      type="checkbox"
                      checked={newScheduleNotify}
                      disabled={!canEditScheduleItems || !canNotifyScheduleItems}
                      onChange={event => setNewScheduleNotify(event.target.checked)}
                    />
                    <i />
                  </label>
                </div>
                <textarea
                  className="input app-schedule-note"
                  value={newScheduleNote}
                  disabled={!canEditScheduleItems}
                  placeholder="Optional note..."
                  onChange={event => setNewScheduleNote(event.target.value)}
                />
                <button
                  className="button app-schedule-add-button"
                  type="button"
                  disabled={!canEditScheduleItems || savingScheduleAction === "Add reminder"}
                  onClick={addScheduleReminder}
                >
                  + Add Reminder
                </button>
                {!canNotifyScheduleItems ? (
                  <p className="muted-copy app-schedule-note-copy">Calendar and reminder notifications are available from StudioFlow Lite.</p>
                ) : null}
              </div>
              <div className="app-schedule-list-block">
                <div className="app-schedule-heading-row">
                  <strong>Upcoming</strong>
                  <span>{activeScheduleItems.length}</span>
                </div>
                {activeScheduleItems.length === 0 ? (
                  <div className="app-schedule-empty">No active reminders yet.</div>
                ) : (
                  <div className="app-schedule-list">
                    {activeScheduleItems.slice(0, 6).map(item => {
                      const tone = scheduleTone(item);
                      return (
                        <article key={item.id} className={`app-schedule-item tone-${tone}`}>
                          <span className="app-schedule-dot" />
                          <div className="app-schedule-item-main">
                            <div className="app-schedule-item-title">
                              <strong>{item.title}</strong>
                              <span className={`app-schedule-priority tone-${schedulePriorityTone(item.priority)}`}>{item.priority}</span>
                            </div>
                            <p>{formatDateTime(item.dueAt)} · {scheduleRelativeLabel(item)}</p>
                            {item.note ? <small>{item.note}</small> : null}
                          </div>
                          <div className="app-schedule-item-actions">
                            <button type="button" disabled={!canEditScheduleItems || Boolean(savingScheduleAction)} onClick={() => saveSchedulePatch({ action: "complete", reminderId: item.id }, "Reminder")}>Done</button>
                            <button type="button" disabled={!canEditScheduleItems || Boolean(savingScheduleAction)} onClick={() => saveSchedulePatch({ action: "snooze", reminderId: item.id, hours: 24 }, "Reminder")}>+1d</button>
                            <button type="button" disabled={!canEditScheduleItems || Boolean(savingScheduleAction)} onClick={() => saveSchedulePatch({ action: "delete", reminderId: item.id }, "Reminder")}>Delete</button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
              {completedScheduleItems.length > 0 ? (
                <div className="app-schedule-list-block">
                  <div className="app-schedule-heading-row">
                    <strong>Recently completed</strong>
                    <span>{completedScheduleItems.length}</span>
                  </div>
                  <div className="app-schedule-list">
                    {completedScheduleItems.slice(0, 3).map(item => (
                      <article key={item.id} className="app-schedule-item tone-green is-completed">
                        <span className="app-schedule-dot" />
                        <div className="app-schedule-item-main">
                          <div className="app-schedule-item-title">
                            <strong>{item.title}</strong>
                          </div>
                          <p>{formatDateTime(item.completedAt || item.dueAt)}</p>
                        </div>
                        <div className="app-schedule-item-actions">
                          <button type="button" disabled={!canEditScheduleItems || Boolean(savingScheduleAction)} onClick={() => saveSchedulePatch({ action: "delete", reminderId: item.id }, "Reminder")}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      case "historyLog":
        return (
          <section key={cardId} className="card order-detail-card is-history-card">
            {renderCardTitle(cardId)}
            {canUseLiteWorkspaceCards ? (
              <div className="app-card-panel app-history-panel">
                <div className="app-history-heading">
                  <strong>Recent important changes</strong>
                  <span>{order.historyLog.length}</span>
                </div>
                {order.historyLog.length === 0 ? (
                  <div className="app-history-empty">No history entries found for this order.</div>
                ) : null}
                <div className="app-history-list">
                  {order.historyLog.map(item => {
                    const oldValue = item.oldValue || "-";
                    const newValue = item.newValue || "-";
                    return (
                      <article key={item.id} className="app-history-entry">
                        <span className="app-history-clock">◔</span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{formatDateTime(item.createdAt)}</p>
                          <b className="app-history-change-row" title={`${oldValue} -> ${newValue}`}>
                            <span className="app-history-value" title={oldValue}>{oldValue}</span>
                            <span className="app-history-arrow">→</span>
                            <span className="app-history-value" title={newValue}>{newValue}</span>
                          </b>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : (
              <LockedInline title="History / Log locked" note="History cards are available from StudioFlow Lite." />
            )}
          </section>
        );
      case "todo":
        const todoItems = optimisticTodoItems;
        const openTasks = todoItems.filter(task => !task.isDone);
        const overdueTasks = openTasks.filter(task => isOverdue(task.dueAt));
        const doneTasks = todoItems.filter(task => task.isDone);
        const todoFilters: ToDoFilter[] = canSeeTeamAssignment
          ? ["Open", "All", "Mine", "Overdue", "Done"]
          : ["Open", "All", "Overdue", "Done"];
        const activeTodoFilter: ToDoFilter = todoFilters.includes(todoFilter) ? todoFilter : "Open";
        const currentUserUid = user?.uid ?? "";
        const currentUserEmail = (user?.email ?? "").trim().toLowerCase();
        const filteredTasks = todoItems.filter(task => {
          switch (activeTodoFilter) {
            case "All":
              return true;
            case "Done":
              return task.isDone;
            case "Mine":
              return Boolean(
                canSeeTeamAssignment
                && ((currentUserUid && task.assignedToUid === currentUserUid)
                  || (currentUserEmail && task.assignedToEmail.trim().toLowerCase() === currentUserEmail))
              );
            case "Overdue":
              return !task.isDone && isOverdue(task.dueAt);
            case "Open":
            default:
              return !task.isDone;
          }
        });
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel app-todo-panel">
              <div className="app-todo-stats">
                <StatCard label="Open" value={openTasks.length} tone="blue" />
                <StatCard label="Overdue" value={overdueTasks.length} tone="gray" />
                <StatCard label="Done" value={doneTasks.length} tone="green" />
              </div>
              {todoStatus ? <p className="layout-status finance-inline-message">{todoStatus}</p> : null}
              {todoError ? <p className="layout-error finance-inline-message">{todoError}</p> : null}
              <div className="app-todo-add-panel">
                <div className="app-todo-add-row">
                  <input
                    className="input"
                    value={newTodoTitle}
                    placeholder={canEditToDoItems ? "Add a task..." : "To Do editing is locked for your role."}
                    readOnly={!canEditToDoItems}
                    disabled={!canEditToDoItems || Boolean(savingTodoAction)}
                    onChange={event => setNewTodoTitle(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") addTodoItem();
                    }}
                  />
                  <button
                    type="button"
                    disabled={!canEditToDoItems || Boolean(savingTodoAction) || !newTodoTitle.trim()}
                    onClick={addTodoItem}
                  >
                    +
                  </button>
                </div>
                <div className="app-todo-controls">
                  <span>
                    <strong>Assign</strong>
                    {canSeeTeamAssignment ? (
                      <select
                        value={newTodoAssignedToUid}
                        disabled={!canEditToDoItems || Boolean(savingTodoAction)}
                        onChange={event => setNewTodoAssignedToUid(event.target.value)}
                      >
                        {todoAssigneeOptions.map(option => (
                          <option key={option.uid || "unassigned"} value={option.uid}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      <b>Team only</b>
                    )}
                  </span>
                  <span>
                    <strong>Priority</strong>
                    <select value={newTodoPriority} disabled={!canEditToDoItems || Boolean(savingTodoAction)} onChange={event => setNewTodoPriority(event.target.value)}>
                      {PRIORITY_OPTIONS.map(priority => <option key={priority}>{priority}</option>)}
                    </select>
                  </span>
                  <span>
                    <strong>Due</strong>
                    <label className="todo-switch">
                      <input
                        type="checkbox"
                        checked={newTodoHasDueDate}
                        disabled={!canEditToDoItems || Boolean(savingTodoAction)}
                        onChange={event => setNewTodoHasDueDate(event.target.checked)}
                      />
                      <i />
                    </label>
                  </span>
                  {newTodoHasDueDate ? (
                    <input
                      className="input app-todo-date-input"
                      type="date"
                      value={newTodoDueDate}
                      disabled={!canEditToDoItems || Boolean(savingTodoAction)}
                      onChange={event => setNewTodoDueDate(event.target.value)}
                    />
                  ) : null}
                </div>
              </div>
              {todoItems.length > 0 ? (
                <div className="app-todo-filters" aria-label="To Do filters">
                  {todoFilters.map(filter => (
                    <button
                      key={filter}
                      className={filter === activeTodoFilter ? "is-selected" : ""}
                      type="button"
                      onClick={() => setTodoFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              ) : null}
              {filteredTasks.length === 0 ? (
                <div className="app-todo-empty">
                  <span>✓</span>
                  <strong>No tasks here</strong>
                </div>
              ) : (
                <div className="app-todo-task-list">
                  {filteredTasks.map(task => {
                    const menuOpen = openTodoMenuId === task.id;
                    const taskIndex = todoItems.findIndex(item => item.id === task.id);
                    const taskOverdue = !task.isDone && isOverdue(task.dueAt);
                    const priorityClass = todoPriorityClass(task.priority);
                    const dueClass = taskOverdue ? "overdue" : task.dueAt ? "active" : "empty";
                    return (
                      <article
                        key={task.id}
                        className={`app-todo-task-row ${task.isDone ? "is-done" : ""} ${taskOverdue ? "is-overdue" : ""} ${draggingTodoId === task.id ? "is-todo-dragging" : ""} ${dragOverTodoId === task.id && draggingTodoId !== task.id ? "is-todo-drag-over" : ""}`}
                        draggable={canEditToDoItems && !savingTodoAction}
                        onDragStart={event => {
                          if (!canEditToDoItems || savingTodoAction) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", task.id);
                          setDraggingTodoId(task.id);
                          setOpenTodoMenuId(null);
                        }}
                        onDragOver={event => {
                          if (!canEditToDoItems || !draggingTodoId || draggingTodoId === task.id) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverTodoId(task.id);
                        }}
                        onDragLeave={() => {
                          setDragOverTodoId(current => current === task.id ? null : current);
                        }}
                        onDrop={event => dropTodoTask(task.id, event)}
                        onDragEnd={() => {
                          setDraggingTodoId(null);
                          setDragOverTodoId(null);
                        }}
                      >
                        <div className="app-todo-task-main">
                          <button
                            className="app-todo-check"
                            type="button"
                            disabled={!canEditToDoItems || Boolean(savingTodoAction)}
                            aria-label={task.isDone ? "Reopen task" : "Mark task done"}
                            onClick={() => saveTodoPatch({ action: "toggle", taskId: task.id, isDone: !task.isDone }, task.isDone ? "Task reopened" : "Task completed")}
                          >
                            {task.isDone ? "✓" : ""}
                          </button>
                          {editingTodoTitleId === task.id ? (
                            <input
                              className="input app-todo-title-input"
                              value={editingTodoTitle}
                              disabled={Boolean(savingTodoAction)}
                              autoFocus
                              draggable={false}
                              onClick={event => event.stopPropagation()}
                              onDragStart={event => event.preventDefault()}
                              onChange={event => setEditingTodoTitle(event.target.value)}
                              onKeyDown={event => {
                                if (event.key === "Enter") saveTodoTitleEdit(task);
                                if (event.key === "Escape") cancelTodoTitleEdit();
                              }}
                            />
                          ) : (
                            <button
                              className="app-todo-title-button"
                              type="button"
                              disabled={!canEditToDoItems || Boolean(savingTodoAction)}
                              draggable={false}
                              onClick={() => startEditingTodoTitle(task)}
                              title={canEditToDoItems ? "Edit task title" : undefined}
                            >
                              <strong className="app-todo-task-title">{task.title}</strong>
                            </button>
                          )}
                          {canEditToDoItems ? (
                            <div className="app-todo-task-menu-wrap">
                              <button
                                className="app-todo-task-menu-button"
                                type="button"
                                disabled={Boolean(savingTodoAction)}
                                aria-expanded={menuOpen}
                                aria-label={`${task.title} task menu`}
                                onClick={() => setOpenTodoMenuId(current => current === task.id ? null : task.id)}
                              >
                                ...
                              </button>
                              <button
                                className="app-todo-task-menu-chevron"
                                type="button"
                                disabled={Boolean(savingTodoAction)}
                                aria-label={menuOpen ? "Close task menu" : "Open task menu"}
                                onClick={() => setOpenTodoMenuId(current => current === task.id ? null : task.id)}
                              >
                               ⌄
                              </button>
                              {menuOpen ? (
                                <div className="app-todo-task-menu">
                                  <button type="button" onClick={() => saveTodoPatch({ action: "toggle", taskId: task.id, isDone: !task.isDone }, task.isDone ? "Task reopened" : "Task completed")}>
                                    <span>◎</span>{task.isDone ? "Reopen" : "Mark Done"}
                                  </button>
                                  <button type="button" onClick={() => downloadTodoReminder(task)}>
                                    <span>♢</span>Add Reminder
                                  </button>
                                  <details>
                                    <summary>Move</summary>
                                    <div>
                                      <button type="button" disabled={taskIndex <= 0} onClick={() => moveTodoTask(task, "up")}>Move Up</button>
                                      <button type="button" disabled={taskIndex < 0 || taskIndex >= todoItems.length - 1} onClick={() => moveTodoTask(task, "down")}>Move Down</button>
                                      <button type="button" disabled={taskIndex <= 0} onClick={() => moveTodoTask(task, "top")}>Move to Top</button>
                                      <button type="button" disabled={taskIndex < 0 || taskIndex >= todoItems.length - 1} onClick={() => moveTodoTask(task, "bottom")}>Move to Bottom</button>
                                    </div>
                                  </details>
                                  {canSeeTeamAssignment ? (
                                    <details>
                                      <summary>Assign</summary>
                                      <div>
                                        {todoAssigneeOptions.map(option => (
                                          <button key={option.uid || "unassigned"} type="button" onClick={() => assignTodoTask(task, option.uid, option.email)}>
                                            {option.label}
                                          </button>
                                        ))}
                                      </div>
                                    </details>
                                  ) : null}
                                  <details>
                                    <summary>Due date</summary>
                                    <div>
                                      <button type="button" onClick={() => setTodoDueDate(task, "")}>No due date</button>
                                      <button type="button" onClick={() => setTodoDueDate(task, isoDateFromToday(0))}>Today</button>
                                      <button type="button" onClick={() => setTodoDueDate(task, isoDateFromToday(1))}>Tomorrow</button>
                                      <button type="button" onClick={() => setTodoDueDate(task, isoDateFromToday(3))}>In 3 days</button>
                                      <button type="button" onClick={() => setTodoDueDate(task, isoDateFromToday(7))}>In 7 days</button>
                                    </div>
                                  </details>
                                  <details>
                                    <summary>Priority</summary>
                                    <div>
                                      {PRIORITY_OPTIONS.map(priority => (
                                        <button
                                          key={priority}
                                          type="button"
                                          onClick={() => saveTodoPatch({ action: "update", taskId: task.id, priority }, "Task priority")}
                                        >
                                          {priority}
                                        </button>
                                      ))}
                                    </div>
                                  </details>
                                  <button className="is-danger" type="button" onClick={() => saveTodoPatch({ action: "delete", taskId: task.id }, "Task deleted")}>
                                    <span>⌫</span>Delete
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <div className="app-todo-meta">
                          {canSeeTeamAssignment || task.assignedToUid || task.assignedToEmail ? (
                            <span className="app-todo-meta-item">
                              <b>◎</b>{todoAssigneeLabel(task)}
                            </span>
                          ) : null}
                          <span className={`app-todo-meta-pill priority-${priorityClass}`}>
                            <b>⚑</b>{task.priority || "Normal"}
                          </span>
                          <span className={`app-todo-meta-item due-${dueClass}`}>
                            <b>▦</b>{todoDueLabel(task.dueAt)}
                          </span>
                        </div>
                        {task.note ? <p className="app-todo-task-note">{task.note}</p> : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      case "clientFiles":
        return (
          <section key={cardId} className="card order-detail-card is-client-files-card">
            {renderCardTitle(cardId)}
            <div
              className={["app-card-panel app-client-files-panel", isClientFileDropTargeted ? "is-drop-targeted" : ""].filter(Boolean).join(" ")}
              onDragEnter={handleClientFileDragOver}
              onDragOver={handleClientFileDragOver}
              onDragLeave={handleClientFileDragLeave}
              onDrop={handleClientFileDrop}
            >
              <div className="app-client-files-intro">
                <div>
                  <strong>PDF, image, PSD and PSB files for this order.</strong>
                  <p>Visible to workspace members who can open this order.</p>
                </div>
                {canManageClientFiles ? (
                  <>
                    <input
                      ref={clientFileInputRef}
                      type="file"
                      accept={CLIENT_FILE_ACCEPT}
                      multiple
                      hidden
                      onChange={event => {
                        const files = Array.from(event.currentTarget.files ?? []);
                        event.currentTarget.value = "";
                        void handleClientFileUploads(files);
                      }}
                    />
                    <button
                      className="button app-upload-button"
                      type="button"
                      disabled={actioningFileId === "upload"}
                      onClick={() => clientFileInputRef.current?.click()}
                    >
                      {actioningFileId === "upload" ? "Uploading..." : "⇧ Upload File"}
                    </button>
                  </>
                ) : null}
              </div>
              {!canUseClientFiles ? (
                <div className="mini-panel locked-panel compact-mini-panel">
                  <CardTitle icon="lock" eyebrow="Locked" title="Client Files cloud access is locked" />
                  <p className="muted-copy">
                    Metadata stays visible, but previews and downloads are available in Pro and Team plans.
                  </p>
                </div>
              ) : null}
              {fileActionStatus ? <p className="file-action-status">{fileActionStatus}</p> : null}
              {fileActionError ? <p className="file-action-error">{fileActionError}</p> : null}
              {clientFileItems.length === 0 ? (
                <div className="app-client-files-empty">
                  <span>▱</span>
                  <strong>No client files yet.</strong>
                  <p>Upload PDFs, images, PSD or PSB files that belong to this client order.</p>
                </div>
              ) : (
                <div className={["app-client-files-list", "compact-list-grid", clientFileItems.length <= 3 ? "is-static" : "is-scrollable"].join(" ")}>
                  {clientFileItems.map(file => (
                    <ClientFileCard
                      key={file.id}
                      file={file}
                      canUseClientFiles={canUseClientFiles}
                      canManageClientFiles={canManageClientFiles}
                      actioning={actioningFileId === file.id}
                      actionDisabled={Boolean(actioningFileId)}
                      onPreview={() => setPreviewingClientFileId(file.id)}
                      onRename={() => handleRenameFile(file)}
                      onDelete={() => handleDeleteFile(file)}
                      onUseAsPreview={() => handleUseFileAsPreview(file)}
                    />
                  ))}
                </div>
              )}
              <p className="app-client-files-note">
                Allowed: PDF, JPG, PNG, HEIC, HEIF, WEBP, PSD and PSB. The size limit follows Settings &gt; Safety &amp; Uploads.
              </p>
            </div>
          </section>
        );
      case "notes":
        return (
          <section key={cardId} className="card order-detail-card">
            {renderCardTitle(cardId)}
            <div className="app-card-panel app-notes-panel">
              {specialNoteSections.map(section => {
                const isPrimary = section.id === PRIMARY_SPECIAL_NOTE_ID;
                const value = isPrimary ? order.notes : specialNoteValue(order.customFields, section.id);
                return (
                  <InlineNotesField
                    key={section.id}
                    title={section.title}
                    value={value}
                    disabled={!canInlineEditFullDetails}
                    saving={savingInlineField === `Note ${section.id}`}
                    onSave={nextValue => saveDetailsPatch(
                      isPrimary ? { notes: nextValue } : { specialNotes: { [section.id]: nextValue } },
                      `Note ${section.id}`
                    )}
                  />
                );
              })}
            </div>
          </section>
        );
      default:
        return null;
    }
  }

  function renderDesktopCardFrame(cardId: OrderDetailCardId, columnIndex: number) {
    const renderedHeight = effectiveCardHeight(cardLayout, cardId, measuredCardMinimums);
    const frameStyle: CSSProperties = {
      height: `${renderedHeight}px`,
      minHeight: `${renderedHeight}px`
    };
    const frameClassName = [
      "order-detail-card-frame",
      "has-drag-handle",
      canCustomizeCards && layoutReady ? "can-drag" : "",
      canCustomizeCards && layoutReady ? "can-resize" : "",
      draggingCardId === cardId ? "is-dragging" : "",
      dragOverCardId === cardId ? "is-drop-target" : "",
      resizingCardId === cardId ? "is-resizing" : ""
    ].filter(Boolean).join(" ");

    return (
      <div
        key={cardId}
        ref={node => setCardFrameRef(cardId, node, "desktop")}
        className={frameClassName}
        data-card-color={cardProfileColor(cardLayout, cardId)}
        onDragOver={event => handleCardDragOver(event, cardId)}
        onDragLeave={() => dragOverCardId === cardId ? setDragOverCardId(null) : undefined}
        onDrop={event => handleCardDrop(event, cardId)}
        style={frameStyle}
      >
        <button
          aria-label={`Drag ${cardLabel(cardId)}`}
          className="order-card-drag-handle"
          disabled={!canCustomizeCards || !layoutReady || savingLayout}
          draggable={canCustomizeCards && layoutReady && !savingLayout}
          onDragStart={event => handleCardDragStart(event, cardId)}
          onDragEnd={handleCardDragEnd}
          title={canCustomizeCards ? "Drag to reorder card" : "Card customization is available from StudioFlow Lite."}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        {renderCardMenu(cardId)}
        {renderCard(cardId)}
        {canCustomizeCards && layoutReady ? (
          <>
            <button
              aria-label={`Resize ${cardLabel(cardId)} height`}
              className="order-card-height-resize-handle"
              type="button"
              onPointerDown={event => handleCardResizePointerDown(event, cardId, columnIndex, "height")}
              title="Drag to resize card height"
            >
              <span />
            </button>
            <button
              aria-label={`Resize ${cardLabel(cardId)} height and column width`}
              className="order-card-corner-resize-handle"
              type="button"
              onPointerDown={event => handleCardResizePointerDown(event, cardId, columnIndex, "corner")}
              title="Drag to resize card and column"
            >
              <span />
              <span />
              <span />
              <span />
            </button>
          </>
        ) : null}
      </div>
    );
  }

  function renderMobileCardFrame(cardId: OrderDetailCardId) {
    const renderedHeight = effectiveCardHeight(cardLayout, cardId, measuredCardMinimums);
    const frameStyle: CSSProperties = {
      height: `${renderedHeight}px`,
      minHeight: `${renderedHeight}px`
    };
    const frameClassName = [
      "order-detail-card-frame",
      "order-detail-mobile-card-frame",
      canCustomizeCards && layoutReady ? "can-resize" : "",
      resizingCardId === cardId ? "is-resizing" : ""
    ].filter(Boolean).join(" ");

    return (
      <div
        key={cardId}
        ref={node => setCardFrameRef(cardId, node, "mobile")}
        className={frameClassName}
        data-card-color={cardProfileColor(cardLayout, cardId)}
        style={frameStyle}
      >
        {renderCardMenu(cardId)}
        {renderCard(cardId)}
        {canCustomizeCards && layoutReady ? (
          <button
            aria-label={`Resize ${cardLabel(cardId)} height`}
            className="order-card-height-resize-handle"
            type="button"
            onPointerDown={event => handleCardResizePointerDown(event, cardId, 0, "height")}
            title="Drag to resize card height"
          >
            <span />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="order-detail-shell">
      <section className="order-detail-toolbar">
        <div>
          {showBackLink ? <Link className="studio-pill" href="/orders">Back to orders</Link> : null}
          <h1>{order.customerName}</h1>
          <p>{order.designName}</p>
        </div>
        <div className="order-toolbar-pills">
          <button className="button secondary" type="button" onClick={exportOrderPdf}>
            Export PDF
          </button>
          <button className="button secondary customize-button" type="button" onClick={() => setCustomizeOpen(open => !open)}>
            Customize cards
          </button>
        </div>
      </section>

      {orderActionError ? <p className="layout-error order-action-message">{orderActionError}</p> : null}
      {inlineError ? <p className="layout-error order-action-message">{inlineError}</p> : null}

      <OrderEditModal
        order={order}
        workspace={workspace}
        open={editOpen}
        canEditFullOrder={canEditOrderFully}
        canEditStatus={canEditOrderStatus}
        statusOptions={statusOptions}
        onClose={() => setEditOpen(false)}
        onSaved={handleOrderEditSaved}
        onError={setOrderActionError}
      />

      <BlockHeadingsModal
        cardId={headingEditorCardId}
        workspace={workspace}
        canCustomizeCards={canCustomizeCards}
        canSave={canEditCardLayout}
        onClose={() => setHeadingEditorCardId(null)}
        onSaved={settings => {
          setBlockHeadingSettings(settings);
          onBlockHeadingSettingsChange?.(settings);
        }}
      />

      {activeClientFilePreview ? (
        <ClientFilePreviewModal
          files={previewableClientFiles}
          activeFile={activeClientFilePreview}
          canManageClientFiles={canManageClientFiles}
          actionDisabled={Boolean(actioningFileId)}
          actioning={actioningFileId === activeClientFilePreview.id}
          onClose={() => setPreviewingClientFileId(null)}
          onSelect={fileId => setPreviewingClientFileId(fileId)}
          onUseAsPreview={() => handleUseFileAsPreview(activeClientFilePreview)}
        />
      ) : null}

      {customizeOpen ? (
        <div className="modal-backdrop workspace-blocks-backdrop" role="presentation" onMouseDown={() => setCustomizeOpen(false)}>
          <section
            className="customize-cards-panel workspace-blocks-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-blocks-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="customize-cards-header">
              <div>
                <h2 id="workspace-blocks-title">Workspace Blocks</h2>
                <p>Show or hide the cards you want to see in the order detail workspace.</p>
              </div>
              <div className="workspace-blocks-actions">
                <button className="button secondary" type="button" onClick={resetCardLayout} disabled={!canCustomizeCards || savingLayout}>
                  Reset
                </button>
                <button className="workspace-blocks-close" type="button" onClick={() => setCustomizeOpen(false)} aria-label="Close Workspace Blocks">
                  ×
                </button>
              </div>
            </div>

            {!layoutReady ? (
              <div className="mini-panel compact-mini-panel">
                <CardTitle icon="storage" eyebrow="Loading" title="Card layout is loading." />
              </div>
            ) : null}

            {!canCustomizeCards ? (
              <div className="mini-panel locked-panel compact-mini-panel">
                <CardTitle icon="lock" eyebrow="Locked" title="Card customization is available from StudioFlow Lite." />
              </div>
            ) : null}

            {canCustomizeCards && layoutReady ? (
              <div className="workspace-layout-mode-card">
                <CardTitle
                  icon={isOrderCardLayoutIndependent ? "folderPerson" : "storage"}
                  eyebrow="Workspace Customization"
                  title={isOrderCardLayoutIndependent ? "This order uses its own layout" : "This order uses the shared layout"}
                />
                <p>
                  {isOrderCardLayoutIndependent
                    ? "Card order, visibility, colours and sizes saved here affect only this order."
                    : "Make this order independent when one order needs a separate card setup."}
                </p>
                <div className="workspace-layout-mode-actions">
                  {isOrderCardLayoutIndependent ? (
                    <>
                      <button className="button secondary" type="button" disabled={savingLayout || !canEditCardLayout} onClick={() => void persistLayout(cardLayout, "Saved layout for this order.")}>
                        Save this order
                      </button>
                      <button className="button secondary" type="button" disabled={savingLayout || !canEditCardLayout} onClick={() => void rejoinSharedCardLayout()}>
                        Rejoin shared
                      </button>
                    </>
                  ) : (
                    <button className="button secondary" type="button" disabled={savingLayout || !canEditCardLayout} onClick={() => void makeCurrentOrderIndependent()}>
                      Make this order independent
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="customize-card-list">
              {customizeCardOrder.map((cardId, index) => (
                <div
                  key={cardId}
                  className={[
                    "customize-card-row",
                    draggingCardId === cardId ? "is-dragging" : "",
                    dragOverCardId === cardId ? "is-drop-target" : ""
                  ].filter(Boolean).join(" ")}
                  onDragOver={event => handleCardDragOver(event, cardId)}
                  onDragLeave={() => dragOverCardId === cardId ? setDragOverCardId(null) : undefined}
                  onDrop={event => handleCardDrop(event, cardId)}
                >
                  <div className="customize-card-main">
                    <span className="customize-card-icon" aria-hidden="true">
                      <CardIconGlyph icon={cardIcon(cardId)} />
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        checked={cardLayout.visibility[cardId]}
                        disabled={!canCustomizeCards || savingLayout}
                        onChange={() => toggleCardVisibility(cardId)}
                      />
                      <span>{cardLabel(cardId)}</span>
                    </label>
                  </div>
                  {isNarrowLayout ? (
                    <div className="customize-card-actions">
                      <button
                        className="button secondary"
                        type="button"
                        disabled={!canCustomizeCards || savingLayout || index === 0}
                        onClick={() => moveCard(cardId, -1)}
                      >
                        Move Up
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={!canCustomizeCards || savingLayout || index === customizeCardOrder.length - 1}
                        onClick={() => moveCard(cardId, 1)}
                      >
                        Move Down
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {savingLayout ? <p className="layout-status">Saving card layout...</p> : null}
            {layoutStatus ? <p className="layout-status">{layoutStatus}</p> : null}
            {layoutError ? <p className="layout-error">{layoutError}</p> : null}
          </section>
        </div>
      ) : null}

      {allCardsHidden ? (
        <div className="order-detail-mobile-stack is-visible">
          <section className="card order-detail-card">
            <CardTitle icon="orders" eyebrow="Cards hidden" title="All cards are hidden" />
            <p className="muted-copy">Open Customize cards to show cards again.</p>
          </section>
        </div>
      ) : (
        <>
          <div
            className={`order-detail-workspace${workspacePanning ? " is-panning" : ""}`}
            onPointerDown={startWorkspacePan}
            onPointerMove={moveWorkspacePan}
            onPointerUp={endWorkspacePan}
            onPointerCancel={endWorkspacePan}
            onLostPointerCapture={endWorkspacePan}
          >
            <div className="order-detail-canvas">
              {desktopColumns.map(column => (
                <div
                  key={column.id}
                  className="order-detail-column"
                  style={{ width: `${column.width}px` }}
                >
                  {column.cards.map(cardId => renderDesktopCardFrame(cardId, column.index))}
                </div>
              ))}
            </div>
          </div>

          <div className="order-detail-mobile-stack">
            {visibleMobileCards.map(cardId => renderMobileCardFrame(cardId))}
          </div>
        </>
      )}
    </div>
  );
}

function OrderEditModal({
  order,
  workspace,
  open,
  canEditFullOrder,
  canEditStatus,
  statusOptions,
  onClose,
  onSaved,
  onError
}: {
  order: OrderDetail;
  workspace: WorkspaceContext;
  open: boolean;
  canEditFullOrder: boolean;
  canEditStatus: boolean;
  statusOptions: string[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [form, setForm] = useState<CreateOrderInput>(() => orderEditForm(order));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(orderEditForm(order));
    setSaving(false);
    setStatus("");
    setError("");
  }, [open, order]);

  if (!open) return null;

  const lockedMessage = !canEditStatus
    ? "View Only cannot edit orders."
    : canEditFullOrder
      ? ""
      : "Workflow Only cannot edit finance fields.";

  function updateField<Key extends keyof CreateOrderInput>(key: Key, value: CreateOrderInput[Key]) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    onError(null);

    if (!canEditStatus) {
      setError("Your workspace role cannot edit this order.");
      return;
    }

    const orderValue = Number(form.orderValue);
    const paidAmount = Number(form.paidAmount);
    if (canEditFullOrder) {
      if (!form.customerName.trim()) {
        setError("Customer name is required.");
        return;
      }
      if (!form.designName.trim()) {
        setError("Design name is required.");
        return;
      }
      if (!form.deliveryDueDate) {
        setError("Delivery due date is required.");
        return;
      }
      if (!Number.isFinite(orderValue) || orderValue < 0 || !Number.isFinite(paidAmount) || paidAmount < 0) {
        setError("Order value and paid amount must be valid positive numbers.");
        return;
      }
      if (paidAmount > orderValue) {
        setError("Paid amount cannot be greater than the order value.");
        return;
      }
    }

    setSaving(true);
    setStatus("Saving order...");
    try {
      const payload = canEditFullOrder
        ? {
          ...form,
          customerName: form.customerName.trim(),
          designName: form.designName.trim(),
          watchRef: form.watchRef.trim(),
          notes: form.notes.trim(),
          orderValue,
          paidAmount
        }
        : {
          designStatus: form.designStatus,
          paintingStatus: form.paintingStatus
        };
      const result = await updateOrderFromWeb(workspace, {
        orderId: order.id,
        ...payload
      });
      await onSaved(result.changed ? "Order updated." : "No changes to save.");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Could not update the order. Please try again.";
      setStatus("");
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="card add-order-modal order-edit-modal" role="dialog" aria-modal="true" aria-labelledby="edit-order-title">
        <div className="add-order-header">
          <div>
            <p className="orders-kicker">Order Management</p>
            <h2 id="edit-order-title">Edit Order</h2>
            <p>{order.customerName} - {order.designName}</p>
          </div>
          <button className="toolbar-icon-button" type="button" onClick={onClose} aria-label="Close Edit Order">
            x
          </button>
        </div>

        {lockedMessage ? (
          <div className="mini-panel compact-mini-panel">
            <p className="muted-copy" style={{ margin: 0 }}>{lockedMessage}</p>
          </div>
        ) : null}

        <form className="add-order-form" onSubmit={handleSubmit}>
          {canEditFullOrder ? (
            <>
              <label>
                Customer name
                <input className="input" value={form.customerName} onChange={event => updateField("customerName", event.target.value)} disabled={saving} />
              </label>
              <label>
                Design name
                <input className="input" value={form.designName} onChange={event => updateField("designName", event.target.value)} disabled={saving} />
              </label>
              <label>
                Reference / watch model
                <input className="input" value={form.watchRef} onChange={event => updateField("watchRef", event.target.value)} disabled={saving} />
              </label>
              <div className="add-order-two-col">
                <label>
                  Order value
                  <input className="input" type="number" min="0" step="0.01" value={form.orderValue} onChange={event => updateField("orderValue", Number(event.target.value))} disabled={saving} />
                </label>
                <label>
                  Paid amount
                  <input className="input" type="number" min="0" step="0.01" value={form.paidAmount} onChange={event => updateField("paidAmount", Number(event.target.value))} disabled={saving} />
                </label>
              </div>
              <label>
                Delivery due date
                <input className="input" type="date" value={form.deliveryDueDate} onChange={event => updateField("deliveryDueDate", event.target.value)} disabled={saving} />
              </label>
            </>
          ) : null}

          <div className="add-order-two-col">
            <label>
              Design status
              <select className="input" value={form.designStatus} onChange={event => updateField("designStatus", event.target.value)} disabled={saving || !canEditStatus}>
                {Array.from(new Set([form.designStatus, ...statusOptions].map(option => option.trim()).filter(Boolean))).map(option => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Painting status
              <select className="input" value={form.paintingStatus} onChange={event => updateField("paintingStatus", event.target.value)} disabled={saving || !canEditStatus}>
                {Array.from(new Set([form.paintingStatus, ...statusOptions].map(option => option.trim()).filter(Boolean))).map(option => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          {canEditFullOrder ? (
            <label>
              Notes
              <textarea className="input add-order-notes" value={form.notes} onChange={event => updateField("notes", event.target.value)} disabled={saving} />
            </label>
          ) : null}

          {status ? <p className="layout-status">{status}</p> : null}
          {error ? <p className="layout-error">{error}</p> : null}

          <div className="add-order-actions">
            <button className="button secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="button" type="submit" disabled={saving || !canEditStatus}>
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type HeadingListKey =
  | "customSteps"
  | "customFields"
  | "customToggles"
  | "materialsToggles"
  | "materialsDefaultChecks"
  | "financialExpenseItems"
  | "financialRemainingItems"
  | "specialNoteSections"
  | "scheduleQuickReminders";

const PRIMARY_SPECIAL_NOTE_ID = "00000000-0000-0000-0000-000000000101";

function specialNoteCustomFieldKey(sectionId: string) {
  const cleanId = sectionId.trim();
  if (!cleanId || cleanId === PRIMARY_SPECIAL_NOTE_ID) return "";
  return `specialNote::${cleanId.toUpperCase()}`;
}

function specialNoteValue(customFields: Record<string, string>, sectionId: string) {
  const cleanId = sectionId.trim();
  const canonicalKey = specialNoteCustomFieldKey(cleanId);
  const legacyKey = cleanId ? `specialNote::${cleanId}` : "";
  const lowerKey = cleanId ? `specialNote::${cleanId.toLowerCase()}` : "";
  return customFields[canonicalKey] ?? customFields[legacyKey] ?? customFields[lowerKey] ?? "";
}

function webHeadingId() {
  return globalThis.crypto?.randomUUID?.() ?? `heading-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function prepareBlockHeadingSettings(cardId: OrderDetailCardId, settings: BlockHeadingSettings): BlockHeadingSettings {
  if (cardId === "materials" && settings.materialsDefaultChecks.length === 0) {
    const labels = [settings.invLabel1, settings.invLabel2, settings.invLabel3, settings.invLabel4]
      .map(label => label.trim())
      .filter(Boolean);
    return {
      ...settings,
      materialsDefaultChecks: labels.map(title => ({ id: webHeadingId(), title }))
    };
  }

  if (cardId === "notes" && !settings.specialNoteSections.some(item => item.id === PRIMARY_SPECIAL_NOTE_ID)) {
    return {
      ...settings,
      specialNoteSections: [{ id: PRIMARY_SPECIAL_NOTE_ID, title: "Special Notes" }, ...settings.specialNoteSections]
    };
  }

  return settings;
}

function BlockHeadingsModal({
  cardId,
  workspace,
  canCustomizeCards,
  canSave,
  onClose,
  onSaved
}: {
  cardId: OrderDetailCardId | null;
  workspace: WorkspaceContext;
  canCustomizeCards: boolean;
  canSave: boolean;
  onClose: () => void;
  onSaved?: (settings: BlockHeadingSettings) => void;
}) {
  const [settings, setSettings] = useState<BlockHeadingSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const supported = Boolean(cardId && WEB_BLOCK_HEADING_CARD_IDS.has(cardId));

  useEffect(() => {
    if (!cardId) return;
    const activeCardId = cardId;
    setSettings(null);
    setStatus("");
    setError("");

    if (!supported) return;

    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const loaded = await loadWorkspaceBlockHeadings(workspace);
        if (!cancelled) setSettings(prepareBlockHeadingSettings(activeCardId, loaded));
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load block headings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [cardId, supported, workspace]);

  if (!cardId) return null;

  const title = CARD_LABELS[cardId];

  function updateSetting<Key extends keyof BlockHeadingSettings>(key: Key, value: BlockHeadingSettings[Key]) {
    setSettings(current => current ? { ...current, [key]: value } : current);
  }

  function updateList(key: HeadingListKey, items: HeadingItem[]) {
    updateSetting(key, items as BlockHeadingSettings[typeof key]);
  }

  function listItems(key: HeadingListKey) {
    return (settings?.[key] ?? []) as HeadingItem[];
  }

  function addItem(key: HeadingListKey, title = "New Heading") {
    updateList(key, [...listItems(key), { id: webHeadingId(), title }]);
  }

  function renameItem(key: HeadingListKey, id: string, title: string) {
    updateList(key, listItems(key).map(item => item.id === id ? { ...item, title } : item));
  }

  function removeItem(key: HeadingListKey, id: string) {
    updateList(key, listItems(key).filter(item => item.id !== id));
  }

  async function handleSave() {
    if (!settings || !cardId) return;
    const activeCardId = cardId;
    setError("");
    setStatus("");

    if (!canSave) {
      setError(canCustomizeCards ? "Your workspace role cannot edit block headings." : "Card customization is available from StudioFlow Lite.");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveWorkspaceBlockHeadings(workspace, activeCardId, settings);
      const preparedSaved = prepareBlockHeadingSettings(activeCardId, saved);
      setSettings(preparedSaved);
      onSaved?.(preparedSaved);
      setStatus("Block headings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save block headings.");
    } finally {
      setSaving(false);
    }
  }

  function renderTextSetting(label: string, key: keyof BlockHeadingSettings) {
    if (!settings) return null;
    return (
      <label className="block-heading-field">
        {label}
        <input
          className="input"
          value={String(settings[key] ?? "")}
          disabled={saving || !canSave}
          onChange={event => updateSetting(key, event.target.value as BlockHeadingSettings[typeof key])}
        />
      </label>
    );
  }

  function renderToggleSetting(label: string, key: keyof BlockHeadingSettings) {
    if (!settings) return null;
    return (
      <label className="block-heading-toggle">
        <input
          type="checkbox"
          checked={Boolean(settings[key])}
          disabled={saving || !canSave}
          onChange={event => updateSetting(key, event.target.checked as BlockHeadingSettings[typeof key])}
        />
        <span>{label}</span>
      </label>
    );
  }

  function renderList(label: string, key: HeadingListKey, addLabel: string, lockedPrimary = false) {
    const items = listItems(key);
    return (
      <section className="block-heading-section">
        <div className="compact-row-head">
          <strong>{label}</strong>
          <button className="button secondary" type="button" disabled={saving || !canSave} onClick={() => addItem(key, addLabel)}>
            Add
          </button>
        </div>
        {items.length === 0 ? <p className="muted-copy">No headings yet.</p> : null}
        <div className="block-heading-list">
          {items.map((item, index) => {
            const primaryLocked = lockedPrimary && item.id === PRIMARY_SPECIAL_NOTE_ID;
            return (
              <div className="block-heading-row" key={item.id}>
                <span>{index + 1}</span>
                <input
                  className="input"
                  value={item.title}
                  disabled={saving || !canSave}
                  onChange={event => renameItem(key, item.id, event.target.value)}
                />
                <button
                  className="button secondary"
                  type="button"
                  disabled={saving || !canSave || primaryLocked}
                  onClick={() => removeItem(key, item.id)}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderEditor() {
    if (!canCustomizeCards) {
      return <LockedInline title="Card customization is available from StudioFlow Lite." note="Demo / Free workspaces cannot edit block headings." />;
    }

    if (!supported) {
      return (
        <div className="mini-panel compact-mini-panel">
          <p className="muted-copy" style={{ margin: 0 }}>Block heading editing for this card is not available on web yet.</p>
        </div>
      );
    }

    if (loading || !settings) {
      return <p className="muted-copy">Loading block headings...</p>;
    }

    switch (cardId) {
      case "financial":
        return (
          <>
            <section className="block-heading-section">
              <strong>Spending / Cost Headings</strong>
              {renderToggleSetting("Show base cost field", "financialShowBaseCost")}
              {renderTextSetting("Base cost label", "financialBaseCostLabel")}
              {renderList("Extra spending headings", "financialExpenseItems", "Spending")}
            </section>
            {renderList("Remaining / Pending headings", "financialRemainingItems", "Remaining")}
          </>
        );
      case "materials":
        return (
          <>
            {renderList("Default material checks", "materialsDefaultChecks", "Material Check")}
            {renderList("Extra Yes / No checks", "materialsToggles", "Material Check")}
            <section className="block-heading-section">
              <strong>Notes / Supplier Field</strong>
              {renderToggleSetting("Show Notes / Supplier", "showMaterialsNotesSupplier")}
              {renderTextSetting("Heading", "materialsNotesSupplierLabel")}
            </section>
          </>
        );
      case "status":
        return (
          <>
            {renderList("Status dropdown headings", "customSteps", "Step")}
            <section className="block-heading-section">
              <strong>Order Summary / Small Order Badges</strong>
              {renderTextSetting("Summary 1", "summaryStep1")}
              {renderTextSetting("Summary 2", "summaryStep2")}
              {renderTextSetting("Badge 1", "orderListStep1")}
              {renderTextSetting("Badge 2", "orderListStep2")}
            </section>
            {renderList("Extra Yes / No checks", "customToggles", "Check")}
            <section className="block-heading-section">
              <strong>Notes / Supplier Field</strong>
              {renderToggleSetting("Show Notes / Supplier", "showStatusNotesSupplier")}
              {renderTextSetting("Heading", "statusNotesSupplierLabel")}
            </section>
          </>
        );
      case "summary":
        return (
          <section className="block-heading-section">
            <strong>Order Summary Status Rows</strong>
            {renderTextSetting("Summary 1", "summaryStep1")}
            {renderTextSetting("Summary 2", "summaryStep2")}
          </section>
        );
      case "customer":
        return (
          <>
            {renderList("Customer & Design Fields", "customFields", "Custom Field")}
            <section className="block-heading-section">
              <strong>Visible Communication Fields</strong>
              {renderToggleSetting("Telephone", "communicationShowTelephone")}
              {renderToggleSetting("Email", "communicationShowEmail")}
              {renderToggleSetting("Address", "communicationShowAddress")}
              {renderToggleSetting("Channel", "communicationShowChannel")}
              {renderToggleSetting("Customer Notes", "communicationShowCustomerNotes")}
            </section>
            <section className="block-heading-section">
              <div className="compact-row-head">
                <strong>Channel Button Names</strong>
                <button
                  className="button secondary"
                  type="button"
                  disabled={saving || !canSave}
                  onClick={() => updateSetting("communicationChannelLabels", [...settings.communicationChannelLabels, "Channel"])}
                >
                  Add
                </button>
              </div>
              <div className="block-heading-list">
                {settings.communicationChannelLabels.map((label, index) => (
                  <div className="block-heading-row" key={`${label}-${index}`}>
                    <span>{index + 1}</span>
                    <input
                      className="input"
                      value={label}
                      disabled={saving || !canSave}
                      onChange={event => {
                        const next = [...settings.communicationChannelLabels];
                        next[index] = event.target.value;
                        updateSetting("communicationChannelLabels", next);
                      }}
                    />
                    <button
                      className="button secondary"
                      type="button"
                      disabled={saving || !canSave}
                      onClick={() => updateSetting("communicationChannelLabels", settings.communicationChannelLabels.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        );
      case "notes":
        return renderList("Special Note Fields", "specialNoteSections", "Special Note", true);
      case "schedule":
        return renderList("Quick reminders", "scheduleQuickReminders", "Custom reminder");
      default:
        return null;
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="card add-order-modal block-headings-modal" role="dialog" aria-modal="true" aria-labelledby="block-heading-title">
        <div className="add-order-header">
          <div>
            <p className="orders-kicker">Workspace Blocks</p>
            <h2 id="block-heading-title">Edit Block Headings</h2>
            <p>{title}</p>
          </div>
          <button className="toolbar-icon-button" type="button" onClick={onClose} aria-label="Close Edit Block Headings">
            x
          </button>
        </div>

        {!canSave && canCustomizeCards && supported ? (
          <div className="mini-panel compact-mini-panel">
            <p className="muted-copy" style={{ margin: 0 }}>Your workspace role cannot edit block headings.</p>
          </div>
        ) : null}

        <div className="block-headings-body">
          {renderEditor()}
        </div>

        {status ? <p className="layout-status">{status}</p> : null}
        {error ? <p className="layout-error">{error}</p> : null}

        <div className="add-order-actions">
          <button className="button secondary" type="button" onClick={onClose} disabled={saving}>Close</button>
          {supported ? (
            <button className="button" type="button" onClick={handleSave} disabled={saving || loading || !settings || !canSave}>
              {saving ? "Saving..." : "Save Headings"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

type ValueTone = "positive" | "negative" | "negative-soft" | "green" | "blue" | "gray" | "red" | "yellow";
type ToDoFilter = "Open" | "All" | "Mine" | "Overdue" | "Done";

function toneClass(tone?: ValueTone) {
  return tone ? `tone-${tone}` : "";
}

function DetailRow({
  label,
  value,
  tone,
  emphasis = false
}: {
  label: string;
  value: string;
  tone?: ValueTone;
  emphasis?: boolean;
}) {
  return (
    <div className={["detail-row", emphasis ? "is-emphasis" : ""].filter(Boolean).join(" ")}>
      <span>{label}</span>
      <strong className={toneClass(tone)}>{value}</strong>
    </div>
  );
}

function DetailLink({ label, href }: { label: string; href: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <a href={href} target="_blank" rel="noreferrer">Open link</a>
    </div>
  );
}

function AppValueRow({
  label,
  value,
  href,
  tone
}: {
  label: string;
  value: string;
  href?: string;
  tone?: ValueTone;
}) {
  const className = ["app-value-pill", toneClass(tone), value ? "" : "is-empty"].filter(Boolean).join(" ");
  return (
    <div className="app-value-row">
      <span>{label}</span>
      {href ? (
        <a className={className} href={href} target="_blank" rel="noreferrer">
          {value || "-"}
        </a>
      ) : (
        <strong className={className}>{value || ""}</strong>
      )}
    </div>
  );
}

function InlineValueRow({
  label,
  value,
  displayValue,
  inputType = "text",
  tone,
  disabled,
  saving,
  onSave
}: {
  label: string;
  value: string;
  displayValue?: string;
  inputType?: "text" | "email" | "number" | "date";
  tone?: ValueTone;
  disabled: boolean;
  saving: boolean;
  onSave: (value: string | number) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function submit() {
    if (disabled || saving) return;
    const nextValue = inputType === "number" ? Number(draft) : draft;
    if (inputType === "number" && (!Number.isFinite(Number(nextValue)) || Number(nextValue) < 0)) {
      setEditing(false);
      return;
    }
    setEditing(false);
    await onSave(nextValue);
  }

  return (
    <div className="app-value-row">
      <span>{label}</span>
      {editing && !disabled ? (
        <form
          className="app-value-edit-form"
          onSubmit={async event => {
            event.preventDefault();
            await submit();
          }}
        >
          <input
            className={["app-value-input", toneClass(tone)].filter(Boolean).join(" ")}
            type={inputType}
            min={inputType === "number" ? "0" : undefined}
            step={inputType === "number" ? "1" : undefined}
            autoFocus
            value={draft}
            disabled={saving}
            onBlur={() => setEditing(false)}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Escape") setEditing(false);
            }}
          />
        </form>
      ) : (
        <button
          className={["app-value-pill app-value-button", toneClass(tone), value ? "" : "is-empty"].filter(Boolean).join(" ")}
          type="button"
          disabled={disabled || saving}
          onClick={() => {
            if (!disabled && !saving) setEditing(true);
          }}
          title={disabled ? "This field is read-only for your role." : "Click to edit"}
        >
          {saving ? "Saving..." : (displayValue ?? value)}
        </button>
      )}
    </div>
  );
}

function InlineNotesField({
  title,
  value,
  disabled,
  saving,
  onSave
}: {
  title: string;
  value: string;
  disabled: boolean;
  saving: boolean;
  onSave: (value: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function submit() {
    if (disabled || saving) return;
    setEditing(false);
    await onSave(draft);
  }

  return (
    <div className="app-notes-section">
      <div className="app-notes-heading">{title}</div>
      {editing && !disabled ? (
        <div className="app-notes-editor">
          <textarea
            className="app-notes-textarea"
            autoFocus
            value={draft}
            disabled={saving}
            placeholder="Add note here..."
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="app-notes-actions">
            <button type="button" onClick={() => { setDraft(value); setEditing(false); }} disabled={saving}>Cancel</button>
            <button type="button" onClick={() => { void submit(); }} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      ) : (
        <button
          className={["app-notes-display", value ? "" : "is-empty"].filter(Boolean).join(" ")}
          type="button"
          disabled={disabled || saving}
          onClick={() => {
            if (!disabled && !saving) setEditing(true);
          }}
          title={disabled ? "This field is read-only for your role." : "Click to edit"}
        >
          {saving ? "Saving..." : (value || "Add note here...")}
        </button>
      )}
    </div>
  );
}

function InlineSelectRow({
  label,
  value,
  options,
  disabled,
  saving,
  onSave,
  statusColor = false
}: {
  label: string;
  value: string;
  options: string[];
  disabled: boolean;
  saving: boolean;
  onSave: (value: string) => Promise<void> | void;
  statusColor?: boolean;
}) {
  const selectOptions = useMemo(() => {
    const cleanedValue = value.trim();
    const merged = cleanedValue ? [cleanedValue, ...options] : options;
    return Array.from(new Set(merged.map(option => option.trim()).filter(Boolean)));
  }, [options, value]);

  return (
    <div className="app-value-row">
      <span>{label}</span>
      <select
        className={[
          "app-value-pill app-inline-select",
          statusColor ? "app-inline-select-status" : "",
          statusColor ? `status-${dynamicStatusTone(value)}` : ""
        ].filter(Boolean).join(" ")}
        value={value}
        disabled={disabled || saving}
        onChange={event => {
          void onSave(event.target.value);
        }}
        title={disabled ? "This field is read-only for your role." : "Select a value"}
      >
        {selectOptions.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  );
}

function InlineYesNoRow({
  label,
  value,
  disabled,
  saving,
  onSave
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  saving: boolean;
  onSave: (value: boolean) => Promise<void> | void;
}) {
  return (
    <div className="app-value-row">
      <span>{label}</span>
      <div className="finance-binary-row">
        <button
          className={value ? "is-selected" : ""}
          type="button"
          disabled={disabled || saving || value}
          onClick={() => {
            void onSave(true);
          }}
          title={disabled ? "This field is read-only for your role." : "Set to Yes"}
        >
          {saving ? "Saving..." : "Yes"}
        </button>
        <button
          className={!value ? "is-selected is-no" : ""}
          type="button"
          disabled={disabled || saving || !value}
          onClick={() => {
            void onSave(false);
          }}
          title={disabled ? "This field is read-only for your role." : "Set to No"}
        >
          No
        </button>
      </div>
    </div>
  );
}

function SoftMetricCard({
  label,
  value,
  icon,
  tone
}: {
  label: string;
  value: string;
  icon: string;
  tone: ValueTone;
}) {
  return (
    <div className={["app-soft-metric-card", toneClass(tone)].join(" ")}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: ValueTone }) {
  return (
    <div className={["app-todo-stat-card", toneClass(tone)].join(" ")}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FinanceInlineRow({
  label,
  displayValue,
  value,
  tone,
  mode = "number",
  options = [],
  disabled,
  saving,
  onSave
}: {
  label: string;
  displayValue: string;
  value: string | number;
  tone?: ValueTone;
  mode?: "number" | "select";
  options?: string[];
  disabled: boolean;
  saving: boolean;
  onSave: (value: string | number) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    if (!editing) setDraft(String(value ?? ""));
  }, [editing, value]);

  async function submit() {
    if (disabled || saving) return;
    const nextValue = mode === "number" ? Number(draft) : draft;
    if (mode === "number" && (!Number.isFinite(Number(nextValue)) || Number(nextValue) < 0)) {
      setEditing(false);
      return;
    }
    setEditing(false);
    await onSave(nextValue);
  }

  return (
    <div className="detail-row finance-inline-row">
      <span>{label}</span>
      {editing && !disabled ? (
        mode === "select" ? (
          <select
            className={["finance-inline-input", toneClass(tone)].filter(Boolean).join(" ")}
            autoFocus
            value={draft}
            disabled={saving}
            onBlur={() => setEditing(false)}
            onChange={async event => {
              setDraft(event.target.value);
              setEditing(false);
              await onSave(event.target.value);
            }}
            onKeyDown={event => {
              if (event.key === "Escape") setEditing(false);
            }}
          >
            {options.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <form
            className="finance-inline-form"
            onSubmit={async event => {
              event.preventDefault();
              await submit();
            }}
          >
            <input
              className={["finance-inline-input", toneClass(tone)].filter(Boolean).join(" ")}
              type="number"
              min="0"
              step="0.01"
              autoFocus
              value={draft}
              disabled={saving}
              onBlur={() => setEditing(false)}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Escape") setEditing(false);
              }}
            />
          </form>
        )
      ) : (
        <button
          className={["finance-value-pill", toneClass(tone)].filter(Boolean).join(" ")}
          type="button"
          disabled={disabled || saving}
          onClick={() => {
            if (!disabled && !saving) setEditing(true);
          }}
          title={disabled ? "This field is read-only for your role or plan." : "Click to edit"}
        >
          {saving ? "Saving..." : displayValue}
        </button>
      )}
    </div>
  );
}

function FinancePaymentReceivedRow({
  remainingAmount,
  disabled,
  saving,
  onSave
}: {
  remainingAmount: number;
  disabled: boolean;
  saving: boolean;
  onSave: () => Promise<void> | void;
}) {
  const paidInFull = remainingAmount <= 0;
  return (
    <div className="detail-row finance-inline-row">
      <span>Full Payment Received?</span>
      <div className="finance-binary-row">
        <button className={paidInFull ? "is-selected" : ""} type="button" disabled={disabled || saving || paidInFull} onClick={onSave}>
          {saving ? "Saving..." : "Yes"}
        </button>
        <button className={!paidInFull ? "is-selected is-no" : ""} type="button" disabled>
          No
        </button>
      </div>
    </div>
  );
}

function UnavailableInline({ note }: { note: string }) {
  return (
    <div className="mini-panel compact-mini-panel">
      <p className="muted-copy" style={{ margin: 0 }}>{note}</p>
    </div>
  );
}

type ClientFileActionIconName = "download" | "preview" | "rename" | "delete";

function ClientFileActionIcon({ name }: { name: ClientFileActionIconName }) {
  if (name === "download") {
    return (
      <svg className="client-file-action-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 4v10" />
        <path d="M8 10l4 4 4-4" />
        <path d="M5 19h14" />
      </svg>
    );
  }

  if (name === "preview") {
    return (
      <svg className="client-file-action-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 5h14v14H5z" />
        <path d="M8 16l3-3 2 2 3-4 3 5" />
        <path d="M9 9h.01" />
      </svg>
    );
  }

  if (name === "rename") {
    return (
      <svg className="client-file-action-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 20h4l11-11a2.2 2.2 0 0 0-3-3L5 17z" />
        <path d="M14 7l3 3" />
      </svg>
    );
  }

  return (
    <svg className="client-file-action-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M8 10v9h8v-9" />
      <path d="M10.5 12.5v4" />
      <path d="M13.5 12.5v4" />
    </svg>
  );
}

function ClientFileCard({
  file,
  canUseClientFiles,
  canManageClientFiles,
  actioning,
  actionDisabled,
  onPreview,
  onRename,
  onDelete,
  onUseAsPreview
}: {
  file: ClientFileDetail;
  canUseClientFiles: boolean;
  canManageClientFiles: boolean;
  actioning: boolean;
  actionDisabled: boolean;
  onPreview: () => void;
  onRename: () => void;
  onDelete: () => void;
  onUseAsPreview: () => void;
}) {
  const canPreviewImage = canUseClientFiles && Boolean(file.downloadURL) && isClientFileImage(file);
  const canUseAsPreview = canManageClientFiles && canPreviewImage;
  const canOpenPreview = canUseClientFiles && Boolean(file.downloadURL);
  const byline = clientFileByline(file);

  return (
    <article className="client-file-list-row">
      <button
        className="client-file-preview-trigger"
        type="button"
        disabled={!canOpenPreview}
        onClick={onPreview}
        title={canOpenPreview ? "Preview file" : "Preview is locked for this plan."}
      >
        {canPreviewImage ? (
          <img src={file.downloadURL} alt={file.fileName} className="file-preview compact-file-preview" />
        ) : (
          <div className="file-token compact-file-preview">
            {fileBadge(file)}
          </div>
        )}

        <div className="client-file-main">
          <strong>{file.fileName}</strong>
          <p className="muted-copy">
            {clientFileSizeLabel(file.fileSize)} · Uploaded {formatDate(file.uploadedAt)}
          </p>
          {byline ? <p className="muted-copy">{byline}</p> : null}
        </div>
      </button>

      <div className="client-file-icon-actions">
        {canUseClientFiles ? (
          file.downloadURL ? (
            <a className="client-file-icon-button is-primary" href={file.downloadURL} target="_blank" rel="noreferrer" title="Open / Download" aria-label="Open or download file">
              <ClientFileActionIcon name="download" />
            </a>
          ) : (
            <span className="client-file-locked-pill">No URL</span>
          )
        ) : (
          <span className="client-file-locked-pill">Locked</span>
        )}

        {canUseAsPreview ? (
          <button className="client-file-icon-button" type="button" onClick={onUseAsPreview} disabled={actionDisabled} title="Use in Preview" aria-label="Use file in Preview card">
            {actioning ? <span className="client-file-action-loading">...</span> : <ClientFileActionIcon name="preview" />}
          </button>
        ) : null}
        {canManageClientFiles ? (
          <>
            <button className="client-file-icon-button" type="button" onClick={onRename} disabled={actionDisabled} title="Rename" aria-label="Rename file">
              {actioning ? <span className="client-file-action-loading">...</span> : <ClientFileActionIcon name="rename" />}
            </button>
            <button
              className="client-file-icon-button is-danger"
              type="button"
              onClick={onDelete}
              disabled={actionDisabled}
              title="Delete"
              aria-label="Delete file"
            >
              <ClientFileActionIcon name="delete" />
            </button>
          </>
        ) : canUseClientFiles ? (
          <span className="client-file-locked-pill">Edit locked</span>
        ) : null}
      </div>
    </article>
  );
}

function ClientFilePreviewModal({
  files,
  activeFile,
  canManageClientFiles,
  actionDisabled,
  actioning,
  onClose,
  onSelect,
  onUseAsPreview
}: {
  files: ClientFileDetail[];
  activeFile: ClientFileDetail;
  canManageClientFiles: boolean;
  actionDisabled: boolean;
  actioning: boolean;
  onClose: () => void;
  onSelect: (fileId: string) => void;
  onUseAsPreview: () => void;
}) {
  const currentIndex = Math.max(0, files.findIndex(file => file.id === activeFile.id));
  const isImage = isClientFileImage(activeFile);
  const isPdf = isClientFilePdf(activeFile);
  const canUseAsPreview = canManageClientFiles && isImage && Boolean(activeFile.downloadURL);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && currentIndex > 0) onSelect(files[currentIndex - 1].id);
      if (event.key === "ArrowRight" && currentIndex < files.length - 1) onSelect(files[currentIndex + 1].id);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, files, onClose, onSelect]);

  return (
    <div className="modal-backdrop client-file-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="client-file-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Client file preview"
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="client-file-preview-header">
          <div>
            <h2>{activeFile.fileName}</h2>
            <p>{currentIndex + 1} / {files.length} · {clientFileSizeLabel(activeFile.fileSize)}</p>
          </div>
          <button className="workspace-blocks-close" type="button" onClick={onClose} aria-label="Close file preview">
            ×
          </button>
        </header>

        <div className="client-file-preview-stage">
          {isImage ? (
            <img src={activeFile.downloadURL} alt={activeFile.fileName} />
          ) : isPdf ? (
            <iframe src={activeFile.downloadURL} title={activeFile.fileName} />
          ) : (
            <div className="client-file-preview-unavailable">
              <span>{fileBadge(activeFile)}</span>
              <strong>Preview is not available for this file type.</strong>
              <p>Use Open or Download to view this file in another app.</p>
            </div>
          )}
        </div>

        <footer className="client-file-preview-actions">
          <button
            className="button secondary"
            type="button"
            disabled={currentIndex <= 0}
            onClick={() => onSelect(files[currentIndex - 1].id)}
          >
            Previous
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={currentIndex >= files.length - 1}
            onClick={() => onSelect(files[currentIndex + 1].id)}
          >
            Next
          </button>
          <span className="client-file-preview-spacer" />
          {canUseAsPreview ? (
            <button className="button secondary" type="button" disabled={actionDisabled} onClick={onUseAsPreview}>
              {actioning ? "Working..." : "Use in Preview"}
            </button>
          ) : null}
          <a className="button secondary" href={activeFile.downloadURL} target="_blank" rel="noreferrer">Open</a>
          <a className="button" href={activeFile.downloadURL} download={activeFile.fileName}>Download</a>
        </footer>
      </section>
    </div>
  );
}

function LockedInline({ title, note }: { title: string; note: string }) {
  return (
    <div className="mini-panel locked-panel compact-mini-panel">
      <CardTitle icon="lock" eyebrow="Locked" title={title} />
      <p className="muted-copy">{note}</p>
      <Link className="button secondary" href="/dashboard" style={{ display: "inline-flex", marginTop: 10 }}>View plan</Link>
    </div>
  );
}
