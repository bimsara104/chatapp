import { useState } from "react";
import { api } from "../api";

const STEPS = { PHONE: "phone", OTP: "otp", USERNAME: "username" };
const PREFIX = "+94";

export default function Login({ onAuth }) {
  const [step, setStep]       = useState(STEPS.PHONE);
  const [phoneInput, setPhoneInput] = useState("");   // "771234567"
  const [otp, setOtp]         = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // Full phone with prefix — backend එකට යන්නේ මේකයි
  const fullPhone = PREFIX + phoneInput.replace(/^0+/, ""); // leading zero remove

  async function handleSendOTP() {
    if (phoneInput.length < 7) return;
    setLoading(true); setError("");
    try {
      await api.sendOTP(fullPhone);
      setStep(STEPS.OTP);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (otp.length !== 6) return;
    setLoading(true); setError("");
    try {
      const res = await api.verifyOTP({ phone: fullPhone, otp });
      onAuth(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetUsername() {
    if (!username) return;
    setLoading(true); setError("");
    try {
      const res = await api.verifyOTP({ phone: fullPhone, otp, username });
      onAuth(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Styles ──────────────────────────────────────────────────
  const S = {
    page:   { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#0d1117", padding:"20px" },
    card:   { background:"#161b22", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"16px", padding:"40px 36px", width:"100%", maxWidth:"400px" },
    label:  { fontSize:"13px", fontWeight:"500", color:"#e6edf3" },
    input:  { background:"#0d1117", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"10px", padding:"10px 14px", color:"#e6edf3", fontSize:"15px", outline:"none", width:"100%", boxSizing:"border-box" },
    btn:    { background:"#238636", color:"#fff", border:"none", borderRadius:"10px", padding:"12px", fontSize:"14px", fontWeight:"500", cursor:"pointer", width:"100%" },
    btnGray:{ background:"none", border:"none", color:"#8b949e", fontSize:"13px", cursor:"pointer", textAlign:"center", padding:"4px", width:"100%" },
    error:  { fontSize:"13px", color:"#f85149", background:"rgba(248,81,73,0.1)", padding:"8px 12px", borderRadius:"8px", margin:0 },
    col:    { display:"flex", flexDirection:"column", gap:"12px" },
  };

  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* Header */}
        <div style={{textAlign:"center", marginBottom:"32px"}}>
          <div style={{fontSize:"40px", marginBottom:"8px"}}>💬</div>
          <h1 style={{fontSize:"24px", fontWeight:"600", color:"#e6edf3", margin:"0 0 6px"}}>ChatApp</h1>
          <p style={{fontSize:"14px", color:"#8b949e", margin:0}}>Login with your WhatsApp number</p>
        </div>

        {/* Step 1 — Phone */}
        {step === STEPS.PHONE && (
          <div style={S.col}>
            <label style={S.label}>WhatsApp Number</label>
            <div style={{display:"flex", alignItems:"center", background:"#0d1117", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"10px", overflow:"hidden"}}>
              <span style={{padding:"10px 12px", fontSize:"13px", color:"#8b949e", borderRight:"1px solid rgba(255,255,255,0.08)", whiteSpace:"nowrap"}}>
                🇱🇰 +94
              </span>
              <input
                style={{background:"transparent", border:"none", padding:"10px 14px", color:"#e6edf3", fontSize:"15px", outline:"none", flex:1}}
                placeholder="771234567"
                value={phoneInput}
                onChange={e => setPhoneInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
                onKeyDown={e => e.key === "Enter" && handleSendOTP()}
                type="tel"
              />
            </div>
            <p style={{fontSize:"12px", color:"#8b949e", margin:0}}>
              We'll send a 6-digit OTP to <b style={{color:"#e6edf3"}}>{fullPhone}</b>
            </p>
            {error && <p style={S.error}>{error}</p>}
            <button style={{...S.btn, opacity: (loading || phoneInput.length < 7) ? 0.6 : 1}}
              onClick={handleSendOTP} disabled={loading || phoneInput.length < 7}>
              {loading ? "Sending..." : "Send OTP via WhatsApp"}
            </button>
          </div>
        )}

        {/* Step 2 — OTP */}
        {step === STEPS.OTP && (
          <div style={S.col}>
            <label style={S.label}>Enter OTP</label>
            <p style={{fontSize:"12px", color:"#8b949e", margin:0}}>
              Sent to <b style={{color:"#25D366"}}>{fullPhone}</b> on WhatsApp
            </p>
            <input
              style={{...S.input, fontSize:"28px", textAlign:"center", letterSpacing:"14px"}}
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={e => e.key === "Enter" && handleVerifyOTP()}
              type="tel"
              maxLength={6}
            />
            {error && <p style={S.error}>{error}</p>}
            <button style={{...S.btn, opacity: (loading || otp.length !== 6) ? 0.6 : 1}}
              onClick={handleVerifyOTP} disabled={loading || otp.length !== 6}>
              {loading ? "Verifying..." : "Verify OTP"}
            </button>
            <button style={S.btnGray} onClick={() => { setStep(STEPS.PHONE); setOtp(""); setError(""); }}>
              ← Change number
            </button>
          </div>
        )}

        {/* Step 3 — New user username */}
        {step === STEPS.USERNAME && (
          <div style={S.col}>
            <div style={{background:"rgba(35,134,54,0.1)", color:"#3fb950", border:"1px solid rgba(63,185,80,0.3)", borderRadius:"8px", padding:"8px 12px", fontSize:"13px", textAlign:"center"}}>
              🎉 Welcome! First time here
            </div>
            <label style={S.label}>Choose a Username</label>
            <input
              style={S.input}
              placeholder="your_username"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, "_"))}
              onKeyDown={e => e.key === "Enter" && handleSetUsername()}
              maxLength={30}
            />
            {error && <p style={S.error}>{error}</p>}
            <button style={{...S.btn, opacity: (loading || !username) ? 0.6 : 1}}
              onClick={handleSetUsername} disabled={loading || !username}>
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{display:"flex", alignItems:"center", justifyContent:"center", gap:"6px", marginTop:"24px"}}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#25D366">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <span style={{fontSize:"12px", color:"#8b949e"}}>Secured with WhatsApp</span>
        </div>

      </div>
    </div>
  );
}
