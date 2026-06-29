import type { Metadata } from "next";
import { CustomOrderLanding } from "@/components/CustomOrderLanding";

const TITLE = "Order management software for small custom-order businesses | NivaDesk";
const DESCRIPTION =
  "Stop losing client orders in WhatsApp, spreadsheets and folders. NivaDesk keeps clients, orders, files, payments and team tasks in one calm workspace. Start your free trial.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/custom-order-management" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/custom-order-management",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION
  }
};

export default function CustomOrderManagementPage() {
  return <CustomOrderLanding />;
}
