// server/signaling-server.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 8080 });
console.log("✅ 시그널링 서버 실행 중 (ws://localhost:8080)");

let sender = null;
const viewers = new Map(); // key: viewerId, value: ws

wss.on("connection", (ws) => {
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📨 메시지 수신:", data);

      if (data.role === "sender") {
        sender = ws;
        ws.role = "sender";
        console.log("🎥 송신자 연결됨");

      } else if (data.role === "viewer") {
        ws.role = "viewer";
        ws.viewerId = data.viewerId;
        viewers.set(data.viewerId, ws);
        console.log(`👀 수신자 연결됨: ${data.viewerId}`);

        // 송신자에게 viewer 접속 알림
        if (sender && sender.readyState === WebSocket.OPEN) {
          sender.send(JSON.stringify({ type: "viewer-joined", viewerId: data.viewerId }));
        }

      } else if (data.type === "offer") {
        // 송신자 -> 특정 수신자
        const target = viewers.get(data.to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
          console.log(`📤 offer 전달: ${data.from} -> ${data.to}`);
        }

      } else if (data.type === "answer") {
        // 수신자 -> 송신자
        if (sender && sender.readyState === WebSocket.OPEN) {
          sender.send(JSON.stringify(data));
          console.log(`📤 answer 전달: ${data.from} -> sender`);
        }

      } else if (data.type === "candidate") {
        // ICE candidate 교환
        let target = null;
        if (ws.role === "sender") {
          target = viewers.get(data.to);
        } else if (ws.role === "viewer") {
          target = sender;
        }

        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify(data));
          console.log(`📤 candidate 전달: ${data.from} -> ${data.to || 'sender'}`);
        }

      } else if (data.type === "chat") {
        // 채팅 메시지 처리
        if (ws.role === "sender") {
          // 송신자 -> 모든 수신자
          viewers.forEach((viewerWs) => {
            if (viewerWs.readyState === WebSocket.OPEN) {
              viewerWs.send(JSON.stringify({ 
                type: "chat", 
                message: data.message, 
                from: "송신자" 
              }));
            }
          });
          console.log(`💬 송신자 채팅 브로드캐스트: ${data.message}`);

        } else if (ws.role === "viewer") {
          // 수신자 -> 송신자 + 다른 수신자들
          const senderName = data.from || ws.viewerId;
          
          if (sender && sender.readyState === WebSocket.OPEN) {
            sender.send(JSON.stringify({ 
              type: "chat", 
              message: data.message, 
              from: senderName 
            }));
          }
          
          viewers.forEach((viewerWs) => {
            if (viewerWs !== ws && viewerWs.readyState === WebSocket.OPEN) {
              viewerWs.send(JSON.stringify({ 
                type: "chat", 
                message: data.message, 
                from: senderName 
              }));
            }
          });
          console.log(`💬 수신자 채팅 전달: ${senderName}: ${data.message}`);
        }
      }

    } catch (error) {
      console.error("❌ 메시지 처리 오류:", error);
    }
  });

  ws.on("close", () => {
    if (ws.role === "viewer" && ws.viewerId) {
      viewers.delete(ws.viewerId);
      if (sender && sender.readyState === WebSocket.OPEN) {
        sender.send(JSON.stringify({ type: "viewer-left", viewerId: ws.viewerId }));
      }
      console.log(`👋 수신자 연결 종료: ${ws.viewerId}`);
      
    } else if (ws.role === "sender") {
      sender = null;
      console.log("❌ 송신자 연결 종료");
      
      // 모든 수신자에게 송신자 종료 알림 후 연결 해제
      viewers.forEach((viewerWs) => {
        if (viewerWs.readyState === WebSocket.OPEN) {
          viewerWs.close();
        }
      });
      viewers.clear();
    }
  });

  ws.on("error", (error) => {
    console.error("🚨 WebSocket 오류:", error);
  });
});