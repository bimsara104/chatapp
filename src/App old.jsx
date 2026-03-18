import { useState, useEffect } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ChatApp from "./pages/ChatApp";

export default function App() {
  const [page, setPage] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("token"));

  useEffect(() => {
    if (token) setPage("chat");
  }, [token]);

  const handleAuth = (tokenData) => {
    localStorage.setItem("token", tokenData.access_token);
    localStorage.setItem("user", JSON.stringify({
      id: tokenData.user_id,
      username: tokenData.username,
      display_name: tokenData.display_name,
    }));
    setToken(tokenData.access_token);
    setPage("chat");
  };

  const handleLogout = () => {
    localStorage.clear();
    setToken(null);
    setPage("login");
  };

  if (page === "chat" && token) return <ChatApp token={token} onLogout={handleLogout} />;
  if (page === "register") return <Register onAuth={handleAuth} onSwitch={() => setPage("login")} />;
  return <Login onAuth={handleAuth} onSwitch={() => setPage("register")} />;
}
