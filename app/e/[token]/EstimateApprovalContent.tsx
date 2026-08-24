"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatEstimateDateTime,
  formatEstimateMoney,
  loadEstimateForVisitor,
  postEstimateDecision,
  type PublicEstimate
} from "@/lib/publicSite/estimateApproval";

// The page a customer lands on from a link their jeweller sent. It is a
// standalone public surface: no app shell, no sign-in, no workspace data beyond
// the estimate itself. Everything it shows was chosen server-side.

type Phase = "loading" | "ready" | "decided" | "error";

export function EstimateApprovalContent({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(false);
  const [outcome, setOutcome] = useState<{ decision: string; at: number; by: string } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadEstimateForVisitor(token)
      .then(loaded => {
        if (cancelled) return;
        setEstimate(loaded);
        if (loaded.alreadyDecided) {
          setOutcome({ decision: loaded.decision, at: loaded.decidedAtMs, by: loaded.decidedByName });
          setPhase("decided");
        } else {
          setName(loaded.customerFirstName || "");
          setPhase("ready");
        }
      })
      .catch(failure => {
        if (cancelled) return;
        setMessage(failure instanceof Error ? failure.message : "This estimate could not be opened.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // A signature pad that works with a finger as well as a mouse: most people
  // open this on the phone the jeweller messaged them on.
  const positionOf = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height
    };
  }, []);

  function startStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const { x, y } = positionOf(event);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#171923";
    context.beginPath();
    context.moveTo(x, y);
  }

  function continueStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = positionOf(event);
    context.lineTo(x, y);
    context.stroke();
    if (!signed) setSigned(true);
  }

  function endStroke() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setSigned(false);
  }

  async function decide(decision: "approved" | "declined") {
    if (!estimate) return;
    const typedName = name.trim();
    if (!typedName) {
      setMessage("Please type your name.");
      return;
    }
    if (decision === "approved" && !signed) {
      setMessage("Please sign in the box before approving.");
      return;
    }
    setMessage("");
    setBusy(true);
    try {
      const signaturePngBase64 = decision === "approved" ? canvasRef.current?.toDataURL("image/png") : undefined;
      const result = await postEstimateDecision({
        token,
        decision,
        approvedByName: typedName,
        approvedByEmail: email.trim() || undefined,
        declineReason: decision === "declined" ? declineReason.trim() || undefined : undefined,
        signaturePngBase64
      });
      setOutcome({
        decision: result.decision || decision,
        at: result.decidedAtMs || Date.now(),
        by: result.decidedByName || typedName
      });
      setPhase("decided");
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : "That could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") {
    return <p className="estimate-note">Loading your estimate…</p>;
  }

  if (phase === "error") {
    return (
      <div className="estimate-panel">
        <h1>Estimate unavailable</h1>
        <p className="estimate-note">{message}</p>
      </div>
    );
  }

  if (phase === "decided" && outcome) {
    const approved = outcome.decision === "approved";
    return (
      <div className="estimate-panel">
        <span className={approved ? "estimate-chip is-approved" : "estimate-chip is-declined"}>
          {approved ? "Approved" : "Declined"}
        </span>
        <h1>{approved ? "Thank you — that's approved" : "Thank you — that's recorded"}</h1>
        <p className="estimate-note">
          {approved
            ? "Your jeweller has been told and can start the work."
            : "Your jeweller has been told and will be in touch."}
        </p>
        <dl className="estimate-rows">
          <div>
            <dt>Recorded for</dt>
            <dd>{outcome.by}</dd>
          </div>
          <div>
            <dt>Recorded at</dt>
            <dd>{formatEstimateDateTime(outcome.at)}</dd>
          </div>
          {estimate ? (
            <div>
              <dt>Estimate</dt>
              <dd>{estimate.number}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    );
  }

  if (!estimate) return null;

  const marginScheme = estimate.taxType === "Profit";
  const showVat = !marginScheme && estimate.taxRate > 0.0001;

  return (
    <div className="estimate-panel">
      <header className="estimate-head">
        {estimate.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={estimate.logoUrl} alt={estimate.businessName} className="estimate-logo" />
        ) : null}
        <div>
          <strong>{estimate.businessName}</strong>
          <span className="estimate-note">Repair estimate {estimate.number}</span>
        </div>
      </header>

      {estimate.replacesNumber ? (
        <p className="estimate-note">
          This replaces estimate {estimate.replacesNumber}. Only this one is current.
        </p>
      ) : null}

      <table className="estimate-lines">
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {estimate.lineItems.map((line, index) => (
            <tr key={`${line.name}-${index}`}>
              <td>
                {line.name}
                {line.quantity > 1 ? <span className="estimate-note"> × {line.quantity}</span> : null}
              </td>
              <td>{formatEstimateMoney(line.lineTotal, estimate.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="estimate-rows estimate-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatEstimateMoney(estimate.subtotal, estimate.currency)}</dd>
        </div>
        {showVat ? (
          <div>
            <dt>VAT ({estimate.taxRate}%)</dt>
            <dd>{formatEstimateMoney(estimate.taxAmount, estimate.currency)}</dd>
          </div>
        ) : null}
        <div className="estimate-total-row">
          <dt>Total</dt>
          <dd>{formatEstimateMoney(estimate.total, estimate.currency)}</dd>
        </div>
      </dl>

      {estimate.notes ? <p className="estimate-note">{estimate.notes}</p> : null}
      {estimate.terms ? <p className="estimate-terms">{estimate.terms}</p> : null}

      <div className="estimate-form">
        <label>
          <span>Your name</span>
          <input value={name} onChange={event => setName(event.target.value)} autoComplete="name" />
        </label>
        <label>
          <span>Email (optional)</span>
          <input value={email} onChange={event => setEmail(event.target.value)} inputMode="email" autoComplete="email" />
        </label>

        {declining ? (
          <label>
            <span>Anything you would like to say? (optional)</span>
            <textarea rows={3} value={declineReason} onChange={event => setDeclineReason(event.target.value)} />
          </label>
        ) : (
          <div className="estimate-signature">
            <div className="estimate-signature-head">
              <span>Sign here</span>
              <button type="button" onClick={clearSignature}>Clear</button>
            </div>
            <canvas
              ref={canvasRef}
              width={640}
              height={220}
              onPointerDown={startStroke}
              onPointerMove={continueStroke}
              onPointerUp={endStroke}
              onPointerLeave={endStroke}
            />
          </div>
        )}

        <p className="estimate-consent">
          By approving you confirm the work and the total above. Your name, the time and your signature are recorded
          with the estimate.
        </p>

        {message ? <p className="estimate-error">{message}</p> : null}

        <div className="estimate-actions">
          {declining ? (
            <>
              <button type="button" className="estimate-secondary" onClick={() => setDeclining(false)} disabled={busy}>
                Back
              </button>
              <button type="button" className="estimate-decline" onClick={() => void decide("declined")} disabled={busy}>
                {busy ? "Sending…" : "Confirm decline"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="estimate-secondary" onClick={() => setDeclining(true)} disabled={busy}>
                Decline
              </button>
              <button type="button" className="estimate-approve" onClick={() => void decide("approved")} disabled={busy}>
                {busy ? "Recording…" : `Approve ${formatEstimateMoney(estimate.total, estimate.currency)}`}
              </button>
            </>
          )}
        </div>
      </div>

      {estimate.footerNote ? <p className="estimate-note">{estimate.footerNote}</p> : null}
    </div>
  );
}
