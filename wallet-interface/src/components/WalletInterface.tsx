import { useEffect, useRef, useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import {
  Wallet, ChevronDown, Send, LogOut, Copy, Shield, ShieldOff, RefreshCw,
} from "lucide-react";
import { ethers } from "ethers";

import {
  connect as mmConnect, switchChain, getBalance, sendEth,
  type Eip1193Provider,
} from "../lib/metamask";
import {
  NETWORKS, DEFAULT_NETWORK, findNetworkByChainId, type EthNetwork,
} from "../lib/networks";
import { sendAndExtractWitness } from "../lib/hidden-pk-wallet";
import { generateProof, proverHealth, type ProveResponse } from "../lib/proof-client";
import { ProofGenerator } from "./ProofGenerator";

const shortAddr = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

// ── Network selector ────────────────────────────────────────────────────────

function NetworkSelect({
  value, onChange,
}: { value: EthNetwork; onChange: (n: EthNetwork) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 13 }}
        onClick={() => setOpen(!open)}>
        {value.shortName} <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20,
          background: "var(--panel-hi)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", padding: 4, minWidth: 160,
        }} className="fade-in">
          {Object.values(NETWORKS).map((n) => (
            <div
              key={n.chainId}
              className={`net-item${n.chainId === value.chainId ? " active" : ""}`}
              onClick={() => { onChange(n); setOpen(false); }}
            >
              {n.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Server status dot ───────────────────────────────────────────────────────

function ServerDot({ up }: { up: boolean | null }) {
  const color = up === null ? "var(--dim)" : up ? "var(--green)" : "var(--red)";
  const label = up === null ? "checking…" : up ? "prover online" : "prover offline";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--dim)" }}>
      <span style={{
        display: "inline-block", width: 7, height: 7, borderRadius: "50%",
        background: color, flexShrink: 0,
        boxShadow: up ? `0 0 6px ${color}` : "none",
      }} />
      {label}
    </div>
  );
}

// ── Toggle ──────────────────────────────────────────────────────────────────

function HiddenPkToggle({
  checked, onChange,
}: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "11px 14px", borderRadius: "var(--radius-sm)",
        background: checked ? "rgba(34,197,94,.08)" : "var(--panel-hi)",
        border: `1px solid ${checked ? "rgba(34,197,94,.3)" : "var(--border)"}`,
        cursor: "pointer", userSelect: "none",
        transition: "background 200ms ease, border-color 200ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {checked
          ? <Shield size={16} color="var(--green)" />
          : <ShieldOff size={16} color="var(--dim)" />}
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Hidden-PK {checked ? "ON" : "OFF"}
          </div>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 1 }}>
            {checked ? "ZK proof → HiddenPKWallet.execute" : "Direct eth_sendTransaction"}
          </div>
        </div>
      </div>
      {/* pill toggle */}
      <div style={{
        position: "relative", width: 40, height: 22, borderRadius: 11,
        background: checked ? "var(--green)" : "var(--border-hi)",
        transition: "background 200ms ease", flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff", transition: "left 200ms ease",
          boxShadow: "0 1px 3px rgba(0,0,0,.4)",
        }} />
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function WalletInterface() {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<string>("");
  const [network, setNetwork] = useState<EthNetwork>(NETWORKS[DEFAULT_NETWORK]);
  const [balance, setBalance] = useState<bigint>(0n);

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [hiddenPk, setHiddenPk] = useState(false);
  const [serverUp, setServerUp] = useState<boolean | null>(null);

  const [busy, setBusy] = useState(false);
  const [proofStatus, setProofStatus] = useState<"idle" | "sending" | "proving" | "done" | "error">("idle");
  const [proofResult, setProofResult] = useState<ProveResponse | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofWitness, setProofWitness] = useState<{ pkX: string; pkY: string; msgHash: string; txHash: string } | null>(null);

  useEffect(() => { proverHealth().then(setServerUp); }, []);

  useEffect(() => {
    if (!provider || !account) return;
    getBalance(provider, account).then(setBalance).catch(() => {});
  }, [provider, account, network]);

  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (accs: string[]) => setAccount(accs[0] ?? "");
    const onChain = (hex: string) => {
      const n = findNetworkByChainId(parseInt(hex, 16));
      if (n) setNetwork(n);
    };
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [provider]);

  async function handleConnect() {
    try {
      const { provider: p, account: a, chainId } = await mmConnect();
      setProvider(p);
      setAccount(a);
      const matched = findNetworkByChainId(chainId);
      if (matched) setNetwork(matched);
      else await switchChain(p, network);
      toast.success(`Connected ${shortAddr(a)}`);
    } catch (e: any) {
      toast.error(e.message || "Connection failed");
    }
  }

  function handleDisconnect() {
    setProvider(null);
    setAccount("");
    setBalance(0n);
    setProofStatus("idle");
    setProofResult(null);
  }

  async function handleSwitchNet(n: EthNetwork) {
    if (!provider) { setNetwork(n); return; }
    try {
      await switchChain(provider, n);
      setNetwork(n);
    } catch (e: any) {
      toast.error(e.message || "Network switch failed");
    }
  }

  async function handleSend() {
    if (!provider || !account) { toast.error("Connect MetaMask first"); return; }
    if (!ethers.isAddress(to)) { toast.error("Invalid recipient"); return; }
    let valueWei: bigint;
    try { valueWei = ethers.parseEther(amount); }
    catch { toast.error("Invalid amount"); return; }

    setBusy(true);
    try {
      if (!hiddenPk) {
        const h = await sendEth(provider, account, to, valueWei);
        toast.success(`Sent: ${shortAddr(h)}`);
        getBalance(provider, account).then(setBalance).catch(() => {});
      } else {
        if (!serverUp) throw new Error("Local prover server unreachable — run: npm run server");

        setProofStatus("idle");
        setProofResult(null);
        setProofError(null);
        setProofWitness(null);

        // Step 1: Send real ETH via MetaMask (normal transfer UI) and extract the
        // signature from the submitted transaction.
        toast.loading("Confirm the transfer in MetaMask…", { id: "hpk" });
        setProofStatus("sending");
        const { txHash, pkX, pkY, r, s, msgHash } = await sendAndExtractWitness(
          provider, account, to, valueWei,
        );
        setProofWitness({ pkX, pkY, msgHash, txHash });

        // Refresh balance now that ETH has moved.
        getBalance(provider, account).then(setBalance).catch(() => {});

        // Step 2: Generate ZK proof over the extracted witness.
        toast.loading("Generating ZK proof…", { id: "hpk" });
        setProofStatus("proving");
        const proof = await generateProof({ pkX, pkY, r, s, msgHash });
        setProofResult(proof);
        setProofStatus("done");

        toast.success(
          `Proof ready — ${proof.proveMs} ms prove / ${proof.verifyMs} ms verify`,
          { id: "hpk", duration: 5000 },
        );
      }
    } catch (e: any) {
      const msg = e.message || String(e);
      toast.error(msg, { id: "hpk" });
      if (hiddenPk) { setProofStatus("error"); setProofError(msg); }
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !account;

  return (
    <div style={{ minHeight: "100vh", padding: "28px 20px" }}>
      <Toaster position="top-right" toastOptions={{
        style: {
          background: "var(--panel)", color: "var(--text)",
          border: "1px solid var(--border)", fontFamily: "inherit", fontSize: 13,
        },
      }} />

      <div style={{ maxWidth: 460, margin: "0 auto" }}>

        {/* Header */}
        <header style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 22,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Wallet size={20} color="var(--gold)" />
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px" }}>
              Hidden-PK Wallet
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ServerDot up={serverUp} />
            <NetworkSelect value={network} onChange={handleSwitchNet} />
          </div>
        </header>

        {/* Account card */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: 20,
        }}>
          {!account ? (
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
              onClick={handleConnect}>
              <Wallet size={16} /> Connect MetaMask
            </button>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{
                  fontSize: 12, color: "var(--dim)",
                  background: "var(--panel)", padding: "4px 10px",
                  borderRadius: "var(--radius-sm)", border: "1px solid var(--border)",
                }}>
                  {shortAddr(account)}
                </span>
                <div style={{ display: "flex", gap: 5 }}>
                  <button className="btn-icon" title="Copy address"
                    onClick={() => { navigator.clipboard.writeText(account); toast.success("Copied"); }}>
                    <Copy size={13} />
                  </button>
                  <button className="btn-icon" title="Refresh balance"
                    onClick={() => provider && getBalance(provider, account).then(setBalance)}>
                    <RefreshCw size={13} />
                  </button>
                  <button className="btn-icon" title="Disconnect" onClick={handleDisconnect}>
                    <LogOut size={13} />
                  </button>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <span style={{
                  fontSize: 30, fontWeight: 700, letterSpacing: "-1px",
                  fontFamily: "var(--mono)",
                }}>
                  {parseFloat(ethers.formatEther(balance)).toFixed(4)}
                </span>
                <span style={{ fontSize: 13, color: "var(--dim)", marginLeft: 6 }}>ETH</span>
              </div>
            </>
          )}
        </div>

        {/* Send form */}
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", padding: 20, marginTop: 14,
        }}>
          <div style={{ marginBottom: 14 }}>
            <HiddenPkToggle checked={hiddenPk} onChange={setHiddenPk} />
          </div>

          <label style={{ display: "block", fontSize: 11, color: "var(--dim)", marginBottom: 5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Recipient
          </label>
          <input
            style={{
              width: "100%", padding: "9px 12px",
              background: "var(--panel)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              fontSize: 13, fontFamily: "var(--mono)",
            }}
            placeholder="0x…"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />

          <label style={{ display: "block", fontSize: 11, color: "var(--dim)", margin: "12px 0 5px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Amount (ETH)
          </label>
          <input
            style={{
              width: "100%", padding: "9px 12px",
              background: "var(--panel)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              fontSize: 14, fontFamily: "var(--mono)",
            }}
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <button
            className="btn btn-primary"
            style={{ width: "100%", justifyContent: "center", marginTop: 16 }}
            disabled={disabled}
            onClick={handleSend}
          >
            <Send size={15} />
            {busy ? "Working…" : hiddenPk ? "Send & Prove" : "Send"}
          </button>

          {hiddenPk && serverUp === false && (
            <div style={{
              marginTop: 10, padding: "8px 11px", fontSize: 12,
              color: "var(--red)", background: "rgba(200,64,64,.07)",
              border: "1px solid rgba(200,64,64,.2)", borderRadius: "var(--radius-sm)",
            }}>
              Prover server not reachable on :3001 — run <code>npm run server</code>
            </div>
          )}
        </div>

        {hiddenPk && proofStatus !== "idle" && (
          <ProofGenerator
            status={proofStatus}
            result={proofResult}
            error={proofError}
            contractDeployed={!!network.hiddenPkWallet}
            witness={proofWitness ?? undefined}
            explorerBase={network.explorer || undefined}
          />
        )}
      </div>
    </div>
  );
}
