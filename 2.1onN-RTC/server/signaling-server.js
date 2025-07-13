// server/signaling-server.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
console.log("✅ 시그널링 서버 실행 중 (ws://192.168.0.63:8080)");

// rooms: Map<roomId, { sender: WebSocket, viewers: Map<viewerId, WebSocket> }>
const rooms = new Map();

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📨 메시지 수신:", data);

      if (data.role === "sender") {
        const roomId = data.roomId || "defaultRoom"; // Senders specify a room
        if (!rooms.has(roomId)) {
          rooms.set(roomId, { sender: null, viewers: new Map() });
        }
        const room = rooms.get(roomId);
        room.sender = ws;
        ws.role = "sender";
        ws.roomId = roomId;
        console.log(`🎥 송신자 연결됨 (방: ${roomId})`);

        // Notify existing viewers in the room that the sender is available
        room.viewers.forEach((viewerWs, viewerId) => {
          if (viewerWs.readyState === WebSocket.OPEN) {
            viewerWs.send(JSON.stringify({ type: "sender-available", roomId: roomId }));
            // Also send existing viewers' info to the new sender
            if (room.sender && room.sender.readyState === WebSocket.OPEN) {
              room.sender.send(JSON.stringify({ type: "viewer-joined", viewerId: viewerId }));
            }
          }
        });

        // Send initial room member list to the sender
        sendRoomMembersToSender(roomId);

      } else if (data.type === "enterRoom") {
        const roomId = data.roomId;
        if (!rooms.has(roomId)) {
          // If room doesn't exist, create it but without a sender initially
          rooms.set(roomId, { sender: null, viewers: new Map() });
        }
        const room = rooms.get(roomId);

        ws.role = "viewer";
        ws.viewerId = data.viewerId;
        ws.roomId = roomId;
        room.viewers.set(data.viewerId, ws);
        console.log(`👀 수신자 연결됨 (ID: ${data.viewerId}, 방: ${roomId})`);

        // Notify the sender in that room about the new viewer
        if (room.sender && room.sender.readyState === WebSocket.OPEN) {
          room.sender.send(JSON.stringify({ type: "viewer-joined", viewerId: data.viewerId }));
        } else {
          // If no sender in the room, notify viewer
          ws.send(JSON.stringify({ type: "no-sender-available", roomId: roomId }));
        }

        // Broadcast updated room members to all in the room
        broadcastRoomMembers(roomId);

      } else if (data.type === "offer") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        // 송신자 -> 특정 수신자
        const target = room.viewers.get(data.to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
          console.log(`📤 offer 전달: ${data.from} -> ${data.to} (방: ${ws.roomId})`);
        }

      } else if (data.type === "answer") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        // 수신자 -> 송신자
        if (room.sender && room.sender.readyState === WebSocket.OPEN) {
          room.sender.send(JSON.stringify(data));
          console.log(`📤 answer 전달: ${data.from} -> sender (방: ${ws.roomId})`);
        }

      } else if (data.type === "candidate") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        // ICE candidate 교환
        let target = null;
        if (ws.role === "sender") {
          target = room.viewers.get(data.to);
        } else if (ws.role === "viewer") {
          target = room.sender;
        }

        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
          console.log(`📤 candidate 전달: ${data.from} -> ${data.to || 'sender'} (방: ${ws.roomId})`);
        }

      } else if (data.type === "chat") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        // 채팅 메시지 처리
        if (ws.role === "sender") {
          // 송신자 -> 모든 수신자
          room.viewers.forEach((viewerWs) => {
            if (viewerWs.readyState === WebSocket.OPEN) {
              viewerWs.send(JSON.stringify({
                type: "chat",
                message: data.message,
                from: "송신자"
              }));
            }
          });
          console.log(`💬 송신자 채팅 브로드캐스트 (방: ${ws.roomId}): ${data.message}`);

        } else if (ws.role === "viewer") {
          const senderName = data.from || ws.viewerId;

          // 수신자 -> 송신자
          if (room.sender && room.sender.readyState === WebSocket.OPEN) {
            room.sender.send(JSON.stringify({
              type: "chat",
              message: data.message,
              from: senderName
            }));
          }

          // 수신자 -> 다른 수신자들
          room.viewers.forEach((viewerWs) => {
            if (viewerWs !== ws && viewerWs.readyState === WebSocket.OPEN) {
              viewerWs.send(JSON.stringify({
                type: "chat",
                message: data.message,
                from: senderName
              }));
            }
          });
          console.log(`💬 수신자 채팅 전달 (방: ${ws.roomId}): ${senderName}: ${data.message}`);
        }
      } else if (data.type === "like" || data.type === "star-balloon" || data.type === "nickname-change") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        // Forward likes, star-balloons, and nickname changes to sender and other viewers
        if (room.sender && room.sender.readyState === WebSocket.OPEN) {
          room.sender.send(JSON.stringify(data));
        }
        room.viewers.forEach((viewerWs) => {
          if (viewerWs.readyState === WebSocket.OPEN && viewerWs !== ws) { // Don't send back to self
            viewerWs.send(JSON.stringify(data));
          }
        });
      }

    } catch (error) {
      console.error("❌ 메시지 처리 오류:", error);
    }
  });

  ws.on("close", () => {
    if (ws.role === "viewer" && ws.roomId && ws.viewerId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        room.viewers.delete(ws.viewerId);
        if (room.sender && room.sender.readyState === WebSocket.OPEN) {
          room.sender.send(JSON.stringify({ type: "viewer-left", viewerId: ws.viewerId }));
        }
        console.log(`👋 수신자 연결 종료: ${ws.viewerId} (방: ${ws.roomId})`);
        broadcastRoomMembers(ws.roomId); // Update room members list
      }
    } else if (ws.role === "sender" && ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room && room.sender === ws) {
        room.sender = null; // Clear sender from the room
        console.log(`❌ 송신자 연결 종료 (방: ${ws.roomId})`);

        // Notify all viewers in the room that the sender has disconnected
        room.viewers.forEach((viewerWs) => {
          if (viewerWs.readyState === WebSocket.OPEN) {
            viewerWs.send(JSON.stringify({ type: "sender-disconnected", roomId: ws.roomId }));
            viewerWs.close(); // Optionally close viewer connections as well
          }
        });
        room.viewers.clear(); // Clear viewers for this room as sender is gone
        rooms.delete(ws.roomId); // Remove the room if sender is gone
      }
    }
  });

  ws.on("error", (error) => {
    console.error("🚨 WebSocket 오류:", error);
  });
});

// Helper function to broadcast room members
function broadcastRoomMembers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const viewerIds = Array.from(room.viewers.keys());
  const memberList = {
    type: "room-members",
    roomId: roomId,
    members: viewerIds,
    senderAvailable: !!room.sender
  };

  // Send to sender if available
  if (room.sender && room.sender.readyState === WebSocket.OPEN) {
    room.sender.send(JSON.stringify(memberList));
  }
  // Send to all viewers in the room
  room.viewers.forEach((viewerWs) => {
    if (viewerWs.readyState === WebSocket.OPEN) {
      viewerWs.send(JSON.stringify(memberList));
    }
  });
  console.log(`👥 방 (${roomId}) 멤버 목록 브로드캐스트:`, viewerIds.length, "명");
}

// Helper function to send room members to a specific sender
function sendRoomMembersToSender(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.sender || room.sender.readyState !== WebSocket.OPEN) return;

    const viewerIds = Array.from(room.viewers.keys());
    const memberList = {
        type: "room-members",
        roomId: roomId,
        members: viewerIds,
        senderAvailable: !!room.sender
    };
    room.sender.send(JSON.stringify(memberList));
    console.log(`👥 방 (${roomId}) 멤버 목록 송신자에게 전송:`, viewerIds.length, "명");
}