import { useState } from "react";
import {
  Clock, FileCheck2, CircleCheck, CircleAlert,
  Send, Cpu, ChevronDown, Copy, Download,
} from "lucide-react";
import type { ProveResponse } from "../lib/proof-client";

interface Witness {
  pkX: string;
  pkY: string;
  msgHash: string;
  txHash: string;
}

interface Props {
  status: "idle" | "sending" | "proving" | "done" | "error";
  result?: ProveResponse | null;
  error?: string | null;
  contractDeployed?: boolean;
  witness?: Witness;
  explorerBase?: string;
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "n/a";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  return `${(b / 1024).toFixed(2)} KB`;
}

function estimateGas(proofBytes: number): number {
  return 21_000 + proofBytes * 16 + 60_000;
}

function truncate(hex: string, chars = 40): string {
  if (hex.length <= chars + 5) return hex;
  return `${hex.slice(0, chars)}...${hex.slice(-4)}`;
}

// ── Step bar ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: "sending", label: "Send",   icon: Send        },
  { id: "proving", label: "Prove",  icon: Cpu         },
  { id: "done",    label: "Verify", icon: CircleCheck  },
] as const;

type StepId = typeof STEPS[number]["id"];

function stepState(stepId: StepId, current: Props["status"]): "done" | "active" | "pending" {
  const order: Props["status"][] = ["sending", "proving", "done"];
  const si = order.indexOf(stepId);
  const ci = order.indexOf(current as any);
  if (ci === -1) return "pending";
  if (si < ci) return "done";
  if (si === ci) return "active";
  return "pending";
}

function StepBar({ status }: { status: Props["status"] }) {
  if (status === "idle" || status === "error") return null;
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
      {STEPS.map((step, i) => {
        const state = stepState(step.id, status);
        const Icon = step.icon;
        return (
          <div key={step.id} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: state === "done"   ? "rgba(29,168,90,.12)"
                          : state === "active" ? "rgba(232,160,32,.12)"
                          : "var(--panel)",
                border: `1.5px solid ${
                  state === "done"   ? "var(--green)"
                : state === "active" ? "var(--gold)"
                : "var(--border)"
                }`,
                transition: "all 300ms ease",
              }}>
                {state === "active"
                  ? <span className="spin" style={{ display: "flex" }}><Icon size={12} color="var(--gold)" /></span>
                  : <Icon size={12} color={state === "done" ? "var(--green)" : "var(--border-hi)"}
                      className={state === "done" ? "step-check" : undefined} />
                }
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.04em",
                color: state === "done"   ? "var(--green)"
                     : state === "active" ? "var(--gold)"
                     : "var(--dim)",
              }}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 1, margin: "0 4px", marginBottom: 16,
                background: state === "done" ? "var(--green-dim)" : "var(--border)",
                transition: "background 300ms ease",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Metric row ──────────────────────────────────────────────────────────────

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "6px 0", borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: 12, color: "var(--dim)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 12, color: accent ?? "var(--text)", fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

// ── Detail row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value, note, copyValue }: {
  label: string;
  value: string;
  note?: string;
  copyValue?: string;
}) {
  const [copied, setCopied] = useState(false);
  const doCopy = () => {
    navigator.clipboard.writeText(copyValue ?? value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </span>
        {copyValue !== undefined && (
          <button onClick={doCopy} style={{
            background: "none", border: "none", cursor: "pointer", padding: "1px 4px",
            color: copied ? "var(--green)" : "var(--dim)", fontSize: 10,
            display: "flex", alignItems: "center", gap: 3, fontFamily: "inherit",
          }}>
            <Copy size={9} /> {copied ? "copied" : "copy"}
          </button>
        )}
      </div>
      <span className="mono" style={{ fontSize: 10, color: "var(--text)", wordBreak: "break-all", lineHeight: 1.6, display: "block" }}>
        {value}
      </span>
      {note && <span style={{ fontSize: 10, color: "var(--dim)", marginTop: 2, display: "block", lineHeight: 1.5 }}>{note}</span>}
    </div>
  );
}

// ── Details panel ───────────────────────────────────────────────────────────

function DetailsPanel({ result, witness, contractDeployed, explorerBase }: {
  result: ProveResponse;
  witness?: Witness;
  contractDeployed?: boolean;
  explorerBase?: string;
}) {
  const downloadProof = () => {
    const payload = JSON.stringify({
      circuit: "hidden-pk-keccak",
      proofSystem: "Ligero / Longfellow-ZK",
      ethAddr: result.ethAddr,
      msgHash: witness?.msgHash,
      txHash: witness?.txHash,
      proofHex: result.proofHex,
      proofSizeBytes: result.proofSizeBytes,
      proveMs: result.proveMs,
      verifyMs: result.verifyMs,
      timestamp: new Date().toISOString(),
    }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hidden_pk_proof_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const txLink = explorerBase && witness?.txHash ? `${explorerBase}/tx/${witness.txHash}` : null;
  const addrLink = explorerBase && result.ethAddr ? `${explorerBase}/address/${result.ethAddr}` : null;

  return (
    <div style={{
      marginTop: 14, padding: "14px 14px 10px",
      background: "var(--panel)", borderRadius: "var(--radius-sm)",
      border: "1px solid var(--border)",
    }} className="fade-in">

      {/* Circuit relation */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
          Circuit relation
        </div>
        <div className="mono" style={{
          fontSize: 10, color: "var(--dim)", lineHeight: 1.8,
          padding: "8px 10px", background: "var(--surface)",
          borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
        }}>
          <span style={{ color: "var(--green)" }}>R</span>{" = { ("}
          <span style={{ color: "var(--gold)" }}>eth_addr</span>
          {", e) ; (pk, sig) :"}<br />
          {"  keccak256(pk.x || pk.y)[12:] == "}
          <span style={{ color: "var(--gold)" }}>eth_addr</span><br />
          {"  AND ECDSA_verify(pk, sig, e) == true }"}
        </div>
      </div>

      {/* Proof system */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
          Proof system
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
          {([
            ["system",   "Ligero (Longfellow-ZK)"],
            ["setup",    "transparent - no trusted setup"],
            ["field",    "secp256k1 base field"],
            ["rate",     "7 (Reed-Solomon)"],
            ["queries",  "132 random queries"],
            ["circuit",  "8,110 inputs, 162 public"],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block" }}>{k}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--text)" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction */}
      {witness?.txHash && (
        <DetailRow
          label="transaction"
          value={truncate(witness.txHash, 20)}
          copyValue={witness.txHash}
          note={txLink ? undefined : "transaction hash onchain"}
        />
      )}
      {txLink && (
        <div style={{ marginTop: -7, marginBottom: 11 }}>
          <a href={txLink} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: "var(--gold)", textDecoration: "none" }}>
            view transaction on explorer
          </a>
        </div>
      )}

      {/* Message hash */}
      {witness?.msgHash && (
        <DetailRow
          label="signing hash (e)"
          value={witness.msgHash}
          copyValue={witness.msgHash}
          note="keccak256 of the unsigned RLP-encoded transaction; the exact digest signed by the private key"
        />
      )}

      {/* Public key */}
      {witness?.pkX && (
        <DetailRow
          label="pk.x"
          value={truncate(witness.pkX, 32)}
          copyValue={witness.pkX}
          note="secp256k1 X coordinate; private witness, never revealed onchain"
        />
      )}
      {witness?.pkY && (
        <DetailRow
          label="pk.y"
          value={truncate(witness.pkY, 32)}
          copyValue={witness.pkY}
          note="secp256k1 Y coordinate; private witness, never revealed onchain"
        />
      )}

      {/* Ethereum address */}
      <DetailRow
        label="eth address (public statement)"
        value={result.ethAddr}
        copyValue={result.ethAddr}
        note="keccak256(pk.x || pk.y)[12:32] - the only pk-derived value the verifier sees"
      />
      {addrLink && (
        <div style={{ marginTop: -7, marginBottom: 11 }}>
          <a href={addrLink} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: "var(--gold)", textDecoration: "none" }}>
            view address on explorer
          </a>
        </div>
      )}

      {/* Proof bytes */}
      <div style={{ marginBottom: 11 }}>
        <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
          proof bytes ({fmtBytes(result.proofSizeBytes)})
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--dim)", wordBreak: "break-all", display: "block", marginBottom: 6 }}>
          {truncate(result.proofHex, 40)}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => navigator.clipboard.writeText(result.proofHex)}
            style={{
              background: "none", border: "1px solid var(--border)", cursor: "pointer",
              padding: "3px 8px", borderRadius: 4, color: "var(--dim)", fontSize: 10,
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Copy size={9} /> copy proof hex
          </button>
          <button
            onClick={downloadProof}
            style={{
              background: "none", border: "1px solid var(--border)", cursor: "pointer",
              padding: "3px 8px", borderRadius: 4, color: "var(--dim)", fontSize: 10,
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Download size={9} /> download proof (.json)
          </button>
        </div>
      </div>

      {/* Gas estimate */}
      <div style={{ marginBottom: 11 }}>
        <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
          onchain gas estimate
        </div>
        <span className="mono" style={{ fontSize: 10, color: "var(--dim)" }}>
          {">="} {estimateGas(result.proofSizeBytes).toLocaleString()} gas (calldata only) + onchain verifier cost unknown
        </span>
      </div>

      {/* Status note */}
      <div style={{
        fontSize: 10, color: "var(--dim)", lineHeight: 1.6,
        padding: "8px 10px", background: "var(--surface)",
        borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
      }}>
        The ETH transfer was submitted onchain. This proof shows that the sender knows the
        private key for <span className="mono" style={{ color: "var(--gold)", fontSize: 10 }}>{result.ethAddr}</span> without
        revealing it.{" "}
        {contractDeployed
          ? "onchain proof submission via HiddenPKWallet is available."
          : "onchain proof submission is pending (HiddenPKWallet not yet deployed)."}
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function ProofGenerator({ status, result, error, contractDeployed, witness, explorerBase }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (status === "idle") return null;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: 18, marginTop: 14,
    }} className="fade-in">

      {/* Status header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
        fontSize: 13, fontWeight: 600,
      }}>
        {status === "sending" && (
          <><Send size={14} color="var(--gold)" />
            <span style={{ color: "var(--gold)" }}>Confirm the transfer in MetaMask...</span></>
        )}
        {status === "proving" && (
          <><Clock size={14} color="var(--gold)" />
            <span style={{ color: "var(--gold)" }}>Generating ZK proof locally...</span>
            <span className="spin" style={{ marginLeft: "auto", display: "flex" }}>
              <Clock size={13} color="var(--gold)" />
            </span></>
        )}
        {status === "done" && (
          <><CircleCheck size={14} color="var(--green)" className="step-check" />
            <span style={{ color: "var(--green)" }}>Proof verified</span></>
        )}
        {status === "error" && (
          <><CircleAlert size={14} color="var(--red)" />
            <span style={{ color: "var(--red)" }}>Error</span></>
        )}
      </div>

      <StepBar status={status} />

      {/* Error */}
      {status === "error" && error && (
        <div className="mono" style={{
          color: "var(--red)", fontSize: 11, whiteSpace: "pre-wrap",
          padding: "10px 12px", background: "rgba(200,64,64,.07)",
          border: "1px solid rgba(200,64,64,.2)", borderRadius: "var(--radius-sm)",
        }}>
          {error}
        </div>
      )}

      {/* Metrics */}
      {status === "done" && result && (
        <>
          <Metric label="prove time" value={fmtMs(result.proveMs)} accent="var(--gold)" />
          <Metric label="verify time" value={fmtMs(result.verifyMs)} accent="var(--green)" />
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "6px 0", borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--dim)" }}>
              <FileCheck2 size={12} /> proof size
            </span>
            <span className="mono" style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>
              {fmtBytes(result.proofSizeBytes)}
            </span>
          </div>

          {/* Ethereum address */}
          {result.ethAddr && (
            <div style={{
              marginTop: 12, padding: "9px 11px",
              background: "var(--panel)", border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
            }}>
              <div style={{
                fontSize: 10, color: "var(--dim)", marginBottom: 4,
                fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                eth address - public statement
              </div>
              <span className="mono" style={{ fontSize: 11, color: "var(--gold)", wordBreak: "break-all" }}>
                {result.ethAddr}
              </span>
            </div>
          )}

          {/* Details toggle */}
          <button
            onClick={() => setShowDetails((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              marginTop: 12, background: "none", border: "none",
              cursor: "pointer", padding: 0,
              color: "var(--dim)", fontSize: 11, fontFamily: "inherit",
            }}
          >
            <ChevronDown
              size={13}
              style={{ transform: showDetails ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}
            />
            {showDetails ? "hide details" : "show details"}
          </button>

          {showDetails && (
            <DetailsPanel
              result={result}
              witness={witness}
              contractDeployed={contractDeployed}
              explorerBase={explorerBase}
            />
          )}
        </>
      )}
    </div>
  );
}
