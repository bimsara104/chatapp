export default function Register({ onAuth, onSwitch }) {
  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0d1117"}}>
      <div style={{background:"#161b22",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"16px",padding:"40px 36px",width:"100%",maxWidth:"400px",textAlign:"center"}}>
        <h1 style={{color:"#e6edf3",fontSize:"24px",marginBottom:"8px"}}>💬 ChatApp</h1>
        <p style={{color:"#8b949e",fontSize:"14px",marginBottom:"32px"}}>Register with your WhatsApp number</p>
        <p style={{color:"#3fb950",fontSize:"14px"}}>Use your phone number to login — no separate registration needed!</p>
        <button onClick={onSwitch} style={{marginTop:"24px",background:"#238636",color:"#fff",border:"none",borderRadius:"10px",padding:"12px 24px",fontSize:"14px",cursor:"pointer",width:"100%"}}>
          Go to Login →
        </button>
      </div>
    </div>
  );
}
