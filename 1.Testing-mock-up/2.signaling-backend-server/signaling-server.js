
// signaling-server.js
const WebSocket = require('ws');// ws라는 웹소켓 생성모듈 가져옴
const wss = new WebSocket.Server({ port: 8080 });// wss 서버 생성

let peers = [];//peer담는 그릇

wss.on('connection', ws => {// ws라는 연결자 객체가 연결되면 푸시함
  peers.push(ws);

  ws.on('message', message => {
    // 받은 메시지를 JSON 파싱, js 객체로 가져옴
    const data = JSON.parse(message);

    // 모든 피어에게 전달 (본인 제외)
    peers.forEach(peer => {
      if (peer !== ws && peer.readyState === WebSocket.OPEN) {
        peer.send(JSON.stringify(data));// js객체를 json문자열 형태로 전송
      }
    });
  });

  ws.on('close', () => {
    peers = peers.filter(p => p !== ws);// p종료시 제거
  });
});

console.log('Signaling server running on ws://localhost:8080');

