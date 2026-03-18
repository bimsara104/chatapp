import { useState, useEffect } from "react";
import Login from "./pages/Login";
import ChatApp from "./pages/ChatApp";
import MeetingRoom from "./pages/MeetingRoom";

export default function App() {
  const [page, setPage] = useState("login");
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [meetingId, setMeetingId] = useState(null);

  useEffect(() => {
    // Check if URL is a meeting link: /meet/:id
    const path = window.location.pathname;
    const meetMatch = path.match(/^\/meet\/([a-zA-Z0-9_-]+)/);
    if (meetMatch) {
      setMeetingId(meetMatch[1]);
      setPage("meeting");
      return;
    }
    if (token) setPage("chat");
  }, []);

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

  if (page === "meeting") return <MeetingRoom meetingId={meetingId} token={token} />;
  if (page === "chat" && token) return <ChatApp token={token} onLogout={handleLogout} />;
  return <Login onAuth={handleAuth} />;
}
