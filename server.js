const express = require("express");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

console.log('O arquivo playerlist.js não é mais necessário para esta implementação.');

const app = express();
const PORT = process.env.PORT || 9090;
const server = app.listen(PORT, () => {
    console.log("Server listening on port: " + PORT);
});

const wss = new WebSocket.Server({ server });

// Gerenciador de salas
const rooms = new Map();

// Função para gerar um código de sala simples
function generateRoomCode(length = 5) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

wss.on("connection", (socket) => {
    const uuid = uuidv4();
    socket.uuid = uuid;
    console.log(`Cliente ${uuid} estabeleceu conexão.`);

    socket.on("message", (message) => {
        let data;
        try {
            data = JSON.parse(message.toString());
        } catch (err) {
            console.error("Erro no JSON:", err);
            return;
        }

        const room = rooms.get(socket.roomId);

        // Lógica de comunicação DENTRO de uma partida
        if (room && ["position", "action", "chat"].includes(data.cmd)) {
            // Reenvia a mensagem para o outro jogador na mesma sala
            room.players.forEach(client => {
                if (client !== socket && client.readyState === WebSocket.OPEN) {
                    // Adiciona o UUID do remetente para o cliente saber quem enviou
                    const originalContent = data.content || {};
                    const newContent = { ...originalContent, uuid: socket.uuid };
                    const relayedMessage = { cmd: data.cmd, content: newContent };
                    
                    // Se for chat, o formato é um pouco diferente
                    if (data.cmd === "chat") {
                         client.send(JSON.stringify({ cmd: "new_chat_message", content: { msg: data.content.msg } }));
                    } else if(data.cmd === "position") {
                         client.send(JSON.stringify({ cmd: "update_position", content: { uuid: socket.uuid, x: data.content.x, y: data.content.y } }));
                    } else if(data.cmd === "action") {
                         client.send(JSON.stringify({ cmd: "update_action", content: { uuid: socket.uuid, name: data.content.name } }));
                    }
                }
            });
            return;
        }

        // Lógica de GERENCIAMENTO DE SALA (criar/entrar)
        switch (data.cmd) {
            case "create_room": {
                const newRoomId = generateRoomCode();
                rooms.set(newRoomId, { players: [socket] });
                socket.roomId = newRoomId;
                console.log(`Jogador ${uuid} criou a sala ${newRoomId}.`);
                socket.send(JSON.stringify({
                    cmd: "room_created",
                    content: { code: newRoomId, uuid: uuid }
                }));
                break;
            }

            case "join_room": {
                const roomId = data.content.code.toUpperCase();
                const roomToJoin = rooms.get(roomId);

                if (!roomToJoin) {
                    socket.send(JSON.stringify({ cmd: "error", content: { msg: "Sala não encontrada." } }));
                    return;
                }
                if (roomToJoin.players.length >= 2) {
                    socket.send(JSON.stringify({ cmd: "error", content: { msg: "A sala está cheia." } }));
                    return;
                }

                socket.roomId = roomId;
                roomToJoin.players.push(socket);
                console.log(`Jogador ${uuid} entrou na sala ${roomId}. Iniciando jogo.`);

                const [player1_socket, player2_socket] = roomToJoin.players;
                const roles = ["prisioneiro", "ajudante"];
                const isPlayer1Prisoner = Math.random() < 0.5;
                const player1_role = isPlayer1Prisoner ? roles[0] : roles[1];
                const player2_role = isPlayer1Prisoner ? roles[1] : roles[0];
                //const prisoner_pos = { x: 150, y: 525 };
                //const helper_pos = { x: 450, y: 525 };
                const player1_start_pos = { x: 0, y: 0 }; 
                const player2_start_pos = { x: 0, y: 0 };
                const player1_data = { uuid: player1_socket.uuid, role: player1_role, x: player1_start_pos.x, y: player1_start_pos.y };
                const player2_data = { uuid: player2_socket.uuid, role: player2_role, x: player2_start_pos.x, y: player2_start_pos.y };

                player1_socket.send(JSON.stringify({ cmd: "game_started", content: { your_data: player1_data, other_player_data: player2_data } }));
                player2_socket.send(JSON.stringify({ cmd: "game_started", content: { your_data: player2_data, other_player_data: player1_data } }));
                break;
            }
        }
    });

    socket.on("close", () => {
        console.log(`Cliente ${uuid} desconectado.`);
        const room = rooms.get(socket.roomId);
        if (room) {
            room.players.forEach(client => {
                if (client !== socket && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ cmd: "partner_disconnected", content: { uuid: socket.uuid } }));
                }
            });
            rooms.delete(socket.roomId);
            console.log(`Sala ${socket.roomId} removida.`);
        }
    });
});