import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NivaDesk ChatGPT App Review Demo",
  description: "Demo video for the NivaDesk ChatGPT App review."
};

export default function ReviewDemoPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #f7f7f9 0%, #ececf1 100%)",
      color: "#1d1d1f",
      padding: "40px 18px",
      display: "flex",
      justifyContent: "center"
    }}>
      <section style={{
        width: "100%",
        maxWidth: "980px",
        background: "rgba(255,255,255,0.96)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: "28px",
        boxShadow: "0 24px 80px rgba(15, 23, 42, 0.14)",
        padding: "28px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
          <img
            src="/brand/nivadesk-logo.png"
            alt="NivaDesk"
            style={{ width: "44px", height: "44px", objectFit: "contain" }}
          />
          <div>
            <div style={{
              fontSize: "13px",
              fontWeight: 800,
              color: "#6e6e73",
              letterSpacing: "0.5px",
              textTransform: "uppercase"
            }}>
              ChatGPT App Review
            </div>
            <h1 style={{ margin: 0, fontSize: "32px", lineHeight: 1.08 }}>
              NivaDesk Demo Video
            </h1>
          </div>
        </div>

        <p style={{
          color: "#6e6e73",
          lineHeight: 1.6,
          marginTop: 0,
          maxWidth: "760px"
        }}>
          This demo shows the NivaDesk ChatGPT App connected to a Team plan review workspace.
          It demonstrates using ChatGPT to view dashboard information, search orders, read financial
          summaries, add order notes, create personal notes and update order status.
        </p>

        <video
          controls
          playsInline
          preload="metadata"
          style={{
            width: "100%",
            borderRadius: "20px",
            border: "1px solid rgba(0,0,0,0.1)",
            background: "#000",
            marginTop: "18px"
          }}
        >
          <source src="/demo/nivadesk-chatgpt-demo.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>

        <div style={{
          marginTop: "18px",
          padding: "16px",
          borderRadius: "16px",
          background: "#f5f5f7",
          color: "#424245",
          lineHeight: 1.55,
          fontSize: "14px"
        }}>
          Review account: review@nivadesk.app. The account uses a Team plan demo workspace
          with sample orders and data for review. No MFA, SMS verification or extra email
          verification is required.
        </div>
      </section>
    </main>
  );
}
