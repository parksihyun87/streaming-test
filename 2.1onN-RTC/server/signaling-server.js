// server/signaling-server.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
console.log("✅ 시그널링 서버 실행 중 (ws://192.168.0.238:8080)");

// rooms: Map<roomId, { sender: { ws: WebSocket, nickname: string }, viewers: Map<viewerId, { ws: WebSocket, nickname: string, isFan: boolean }> }>
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
        room.sender = { ws: ws, nickname: data.nickname || "송신자" }; // Store sender's WebSocket and nickname
        ws.role = "sender";
        ws.roomId = roomId;
        ws.nickname = data.nickname || "송신자"; // Attach nickname to ws object
        console.log(`🎥 송신자 연결됨 (방: ${roomId}, 닉네임: ${ws.nickname})`);

        // Notify existing viewers in the room that the sender is available
        room.viewers.forEach((viewer) => {
          if (viewer.ws.readyState === WebSocket.OPEN) {
            viewer.ws.send(JSON.stringify({ type: "sender-available", roomId: roomId, senderNickname: ws.nickname }));
          }
        });

        // Send initial room member list to the sender
        sendRoomMembersToSender(roomId);

      } else if (data.type === "enterRoom") {
        const roomId = data.roomId;
        const viewerId = data.viewerId;
        const nickname = data.nickname || "익명";
        const isFan = data.isFan || false; // New: Receive isFan status from viewer

        if (!rooms.has(roomId)) {
          rooms.set(roomId, { sender: null, viewers: new Map() });
        }
        const room = rooms.get(roomId);

        ws.role = "viewer";
        ws.viewerId = viewerId;
        ws.roomId = roomId;
        ws.nickname = nickname; // Attach nickname to ws object
        ws.isFan = isFan; // Attach isFan status to ws object

        room.viewers.set(viewerId, { ws: ws, nickname: nickname, isFan: isFan }); // Store viewer's WebSocket, nickname, and isFan status
        console.log(`👀 수신자 연결됨 (ID: ${viewerId}, 방: ${roomId}, 닉네임: ${nickname}, 팬: ${isFan})`);

        // Notify the sender in that room about the new viewer
        if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
          room.sender.ws.send(JSON.stringify({ type: "viewer-joined", viewerId: viewerId, nickname: nickname, isFan: isFan }));
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
        const targetViewer = room.viewers.get(data.to);
        if (targetViewer && targetViewer.ws.readyState === WebSocket.OPEN) {
          targetViewer.ws.send(JSON.stringify(data));
          console.log(`📤 offer 전달: ${data.from} -> ${data.to} (방: ${ws.roomId})`);
        }

      } else if (data.type === "answer") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        // 수신자 -> 송신자
        if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
          room.sender.ws.send(JSON.stringify(data));
          console.log(`📤 answer 전달: ${data.from} -> sender (방: ${ws.roomId})`);
        }

      } else if (data.type === "candidate") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        // ICE candidate 교환
        let target = null;
        if (ws.role === "sender") {
          target = room.viewers.get(data.to);
          if (target) target = target.ws; // Get the WebSocket object
        } else if (ws.role === "viewer") {
          target = room.sender ? room.sender.ws : null; // Get the WebSocket object
        }
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
          console.log(`📤 candidate 전달: ${data.from} -> ${data.to || 'sender'} (방: ${ws.roomId})`);
        }

      } else if (data.type === "chat") {
        const room = rooms.get(ws.roomId);
        if (!room) return;

        let senderNickname = ws.nickname;
        let isSenderFan = ws.isFan || false; // Senders generally aren't "fans" of themselves, but for consistency

        // 채팅 메시지 처리
        if (ws.role === "sender") {
          // 송신자 -> 모든 수신자
          room.viewers.forEach((viewer) => {
            if (viewer.ws.readyState === WebSocket.OPEN) {
              viewer.ws.send(JSON.stringify({
                type: "chat",
                message: data.message,
                from: senderNickname, // Use sender's nickname
                fromId: ws.viewerId || 'sender', // Use a consistent ID
                isFan: false // Sender is not a fan
              }));
            }
          });
          // Send to sender's own chat log as well for consistency
          ws.send(JSON.stringify({
            type: "chat",
            message: data.message,
            from: senderNickname,
            fromId: 'sender',
            isFan: false
          }));
          console.log(`💬 송신자 채팅 브로드캐스트 (방: ${ws.roomId}, 닉네임: ${senderNickname}): ${data.message}`);
        } else if (ws.role === "viewer") {
          const viewerInfo = room.viewers.get(ws.viewerId);
          senderNickname = viewerInfo ? viewerInfo.nickname : ws.viewerId; // Use viewer's nickname
          isSenderFan = viewerInfo ? viewerInfo.isFan : false; // Use viewer's fan status

          // 수신자 -> 송신자 및 다른 수신자
          if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
            room.sender.ws.send(JSON.stringify({
              type: "chat",
              message: data.message,
              from: senderNickname,
              fromId: ws.viewerId,
              isFan: isSenderFan
            }));
          }
          room.viewers.forEach((viewer) => {
            if (viewer.ws !== ws && viewer.ws.readyState === WebSocket.OPEN) { // Exclude sender
              viewer.ws.send(JSON.stringify({
                type: "chat",
                message: data.message,
                from: senderNickname,
                fromId: ws.viewerId,
                isFan: isSenderFan
              }));
            }
          });
          // Send to sender's own chat log
          ws.send(JSON.stringify({
            type: "chat",
            message: data.message,
            from: senderNickname,
            fromId: ws.viewerId,
            isFan: isSenderFan
          }));
          console.log(`💬 수신자 채팅 브로드캐스트 (방: ${ws.roomId}, ID: ${ws.viewerId}, 닉네임: ${senderNickname}, 팬: ${isSenderFan}): ${data.message}`);
        }

      } else if (data.type === "like") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        const likerNickname = ws.nickname || ws.viewerId;
        const likerIsFan = ws.isFan || false;
        // Broadcast to sender
        if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
          room.sender.ws.send(JSON.stringify({ type: "like", from: likerNickname, fromId: ws.viewerId, isFan: likerIsFan }));
        }
        // Broadcast to other viewers
        room.viewers.forEach((viewer) => {
          if (viewer.ws !== ws && viewer.ws.readyState === WebSocket.OPEN) {
            viewer.ws.send(JSON.stringify({ type: "like", from: likerNickname, fromId: ws.viewerId, isFan: likerIsFan }));
          }
        });
        console.log(`❤️ 좋아요 수신 및 브로드캐스트 (방: ${ws.roomId}, From: ${likerNickname})`);

      } else if (data.type === "star-balloon") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        const giverNickname = ws.nickname || ws.viewerId;
        const giverIsFan = ws.isFan || false;
        // Broadcast to sender
        if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
          room.sender.ws.send(JSON.stringify({ type: "star-balloon", from: giverNickname, count: data.count, fromId: ws.viewerId, isFan: giverIsFan }));
        }
        // Broadcast to other viewers
        room.viewers.forEach((viewer) => {
          if (viewer.ws !== ws && viewer.ws.readyState === WebSocket.OPEN) {
            viewer.ws.send(JSON.stringify({ type: "star-balloon", from: giverNickname, count: data.count, fromId: ws.viewerId, isFan: giverIsFan }));
          }
          console.log(`⭐ 별풍선 수신 및 브로드캐스트 (방: ${ws.roomId}, From: ${giverNickname}, Count: ${data.count})`);
        });

      } else if (data.type === "nickname-change") {
        const room = rooms.get(ws.roomId);
        if (!room) return;
        const oldNickname = ws.nickname;
        const newNickname = data.newNickname;
        ws.nickname = newNickname; // Update nickname on ws object

        if (ws.role === "viewer") {
          const viewerInfo = room.viewers.get(ws.viewerId);
          if (viewerInfo) viewerInfo.nickname = newNickname; // Update nickname in room data
        } else if (ws.role === "sender") {
          if (room.sender) room.sender.nickname = newNickname; // Update sender's nickname in room data
        }

        // Broadcast nickname change to all in the room
        if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
          room.sender.ws.send(JSON.stringify({ type: "nickname-change", viewerId: ws.viewerId, oldNickname: oldNickname, newNickname: newNickname, isFan: ws.isFan || false }));
        }
        room.viewers.forEach((viewer) => {
          if (viewer.ws.readyState === WebSocket.OPEN) {
            viewer.ws.send(JSON.stringify({ type: "nickname-change", viewerId: ws.viewerId, oldNickname: oldNickname, newNickname: newNickname, isFan: ws.isFan || false }));
          }
        });
        console.log(`📝 닉네임 변경 브로드캐스트 (방: ${ws.roomId}, ID: ${ws.viewerId || 'sender'}, Old: ${oldNickname}, New: ${newNickname})`);
        // After nickname change, broadcast updated room members
        broadcastRoomMembers(ws.roomId);

      } else if (data.type === "fan-membership") { // New: Handle fan membership
        const room = rooms.get(ws.roomId);
        if (!room) return;

        if (ws.role === "viewer") {
          const viewerInfo = room.viewers.get(ws.viewerId);
          if (viewerInfo) {
            viewerInfo.isFan = data.isFan; // Update fan status in room data
            ws.isFan = data.isFan; // Update fan status on ws object
            console.log(`💖 팬 가입 상태 변경 (방: ${ws.roomId}, ID: ${ws.viewerId}, 닉네임: ${ws.nickname}, 팬: ${ws.isFan})`);

            // Broadcast fan status change to all in the room
            if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
              room.sender.ws.send(JSON.stringify({
                type: "fan-status-update",
                viewerId: ws.viewerId,
                nickname: ws.nickname,
                isFan: ws.isFan
              }));
            }
            room.viewers.forEach((viewer) => {
              if (viewer.ws.readyState === WebSocket.OPEN) {
                viewer.ws.send(JSON.stringify({
                  type: "fan-status-update",
                  viewerId: ws.viewerId,
                  nickname: ws.nickname,
                  isFan: ws.isFan
                }));
              }
            });
            // After fan status change, broadcast updated room members
            broadcastRoomMembers(ws.roomId);
          }
        }
      } else if (data.type === "sender-nickname-change") { // New: Handle sender nickname change
        const room = rooms.get(ws.roomId);
        if (!room || ws.role !== "sender") return;

        const oldNickname = room.sender.nickname;
        const newNickname = data.newNickname;
        room.sender.nickname = newNickname; // Update sender's nickname in room data
        ws.nickname = newNickname; // Update nickname on ws object

        // Broadcast sender nickname change to all viewers
        room.viewers.forEach((viewer) => {
          if (viewer.ws.readyState === WebSocket.OPEN) {
            viewer.ws.send(JSON.stringify({ type: "sender-nickname-change", oldNickname: oldNickname, newNickname: newNickname }));
          }
        });
        console.log(`📝 송신자 닉네임 변경 브로드캐스트 (방: ${ws.roomId}, Old: ${oldNickname}, New: ${newNickname})`);
        // After nickname change, broadcast updated room members (including sender's new nickname)
        broadcastRoomMembers(ws.roomId);
      }

      else {
        console.warn("⚠️ 알 수 없는 메시지 타입:", data.type);
      }
    } catch (error) {
      console.error("❌ 메시지 처리 오류:", error);
    }
  });

  ws.on("close", () => {
    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        if (ws.role === "sender") {
          console.log(`📤 송신자 연결 해제 (방: ${ws.roomId})`);
          room.sender = null;
          // Notify all viewers in the room that the sender has left
          room.viewers.forEach((viewer) => {
            if (viewer.ws.readyState === WebSocket.OPEN) {
              viewer.ws.send(JSON.stringify({ type: "sender-unavailable", roomId: ws.roomId }));
            }
          });
          // Remove the room if sender is gone
          if (room.viewers.size === 0) {
            rooms.delete(ws.roomId);
            console.log(`🗑️ 빈 방 삭제됨: ${ws.roomId}`);
          }
        } else if (ws.role === "viewer" && ws.viewerId) {
          console.log(`🏃 수신자 연결 해제 (ID: ${ws.viewerId}, 방: ${ws.roomId})`);
          room.viewers.delete(ws.viewerId);
          // Notify the sender in that room about the viewer leaving
          if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
            room.sender.ws.send(JSON.stringify({ type: "viewer-left", viewerId: ws.viewerId }));
          }
          // Remove the room if sender is gone and no viewers left
          if (room.sender === null && room.viewers.size === 0) {
            rooms.delete(ws.roomId);
            console.log(`🗑️ 빈 방 삭제됨: ${ws.roomId}`);
          } else {
            // Broadcast updated room members
            broadcastRoomMembers(ws.roomId);
          }
        }
      } else {
        console.log(`ℹ️ 연결 해제된 클라이언트의 방 (${ws.roomId})을 찾을 수 없음.`);
      }
    } else {
      console.log("ℹ️ 연결 해제된 클라이언트 (방 정보 없음)");
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

  const viewerList = Array.from(room.viewers.entries()).map(([viewerId, viewerInfo]) => ({
    viewerId: viewerId,
    nickname: viewerInfo.nickname,
    isFan: viewerInfo.isFan
  }));

  const memberList = {
    type: "room-members",
    roomId: roomId,
    members: viewerList, // Send rich viewer info
    senderAvailable: !!room.sender,
    senderNickname: room.sender ? room.sender.nickname : null // Send sender's nickname
  };

  // Send to sender if available
  if (room.sender && room.sender.ws.readyState === WebSocket.OPEN) {
    room.sender.ws.send(JSON.stringify(memberList));
  }
  // Send to all viewers in the room
  room.viewers.forEach((viewer) => {
    if (viewer.ws.readyState === WebSocket.OPEN) {
      viewer.ws.send(JSON.stringify(memberList));
    }
  });
  console.log(`👥 방 (${roomId}) 멤버 목록 브로드캐스트:`, viewerList.length, "명", "송신자:", room.sender ? room.sender.nickname : "없음");
}

// Helper function to send room members to a specific sender
function sendRoomMembersToSender(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.sender || room.sender.ws.readyState !== WebSocket.OPEN) return;

  const viewerList = Array.from(room.viewers.entries()).map(([viewerId, viewerInfo]) => ({
    viewerId: viewerId,
    nickname: viewerInfo.nickname,
    isFan: viewerInfo.isFan
  }));

  const memberList = {
    type: "room-members",
    roomId: roomId,
    members: viewerList,
    senderAvailable: true,
    senderNickname: room.sender.nickname // Send sender's nickname
  };
  room.sender.ws.send(JSON.stringify(memberList));
  console.log(`👥 방 (${roomId}) 멤버 목록을 송신자에게 전송:`, viewerList.length, "명");
}