const express = require("express");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

console.log('Servidor com re-sorteio de papéis INICIADO.');

const app = express();
const PORT = process.env.PORT || 9090;
const server = app.listen(PORT, () => {
    console.log("Server listening on port: " + PORT);
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

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
            return;
        }

        const room = rooms.get(socket.roomId);
        if (!room && !["create_room", "join_room"].includes(data.cmd)) {
            return;
        }

        if (room && ["position", "action", "chat"].includes(data.cmd)) {
            room.players.forEach(client => {
                if (client !== socket && client.readyState === WebSocket.OPEN) {
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

        switch (data.cmd) {
            case "create_room": {
                const newRoomId = generateRoomCode();
                rooms.set(newRoomId, {
                    players: [socket],
                    playersInPortal: new Set()
                });
                socket.roomId = newRoomId;
                socket.send(JSON.stringify({
                    cmd: "room_created",
                    content: { code: newRoomId, uuid: uuid }
                }));
                break;
            }

            case "join_room": {
                const roomId = data.content.code.toUpperCase();
                const roomToJoin = rooms.get(roomId);
                if (!roomToJoin || roomToJoin.players.length >= 2) { 
                    // Lógica de erro simplificada
                    socket.send(JSON.stringify({ cmd: "error", content: { msg: "Sala não encontrada ou cheia." } }));
                    return;
                }
                socket.roomId = roomId;
                roomToJoin.players.push(socket);

                const [player1_socket, player2_socket] = roomToJoin.players;
                const roles = ["prisioneiro", "ajudante"];
                const isPlayer1Prisoner = Math.random() < 0.5;
                const player1_role = isPlayer1Prisoner ? roles[0] : roles[1];
                const player2_role = isPlayer1Prisoner ? roles[1] : roles[0];
                const player1_data = { uuid: player1_socket.uuid, role: player1_role, x: 0, y: 0 };
                const player2_data = { uuid: player2_socket.uuid, role: player2_role, x: 0, y: 0 };

                player1_socket.send(JSON.stringify({ cmd: "game_started", content: { your_data: player1_data, other_player_data: player2_data } }));
                player2_socket.send(JSON.stringify({ cmd: "game_started", content: { your_data: player2_data, other_player_data: player1_data } }));
                break;
            }

            case "enter_portal": {
                if (room) {
                    room.playersInPortal.add(socket.uuid);
                    if (room.playersInPortal.size === 2) {
                        console.log(`Ambos no portal! Sorteando novos papéis para o nível ${data.content.next_level}`);
                        
                        // --- LÓGICA DE RE-SORTEIO ADICIONADA AQUI ---
                        const [player1_socket, player2_socket] = room.players;
                        const roles = ["prisioneiro", "ajudante"];
                        const isPlayer1Prisoner = Math.random() < 0.5;
                        const player1_role = isPlayer1Prisoner ? roles[0] : roles[1];
                        const player2_role = isPlayer1Prisoner ? roles[1] : roles[0];
                        // --- FIM DA LÓGICA DE RE-SORTEIO ---

                        const command = {
                            cmd: "change_level",
                            content: {
                                level_path: data.content.next_level,
                                // Enviamos os novos papéis junto com o caminho do nível
                                new_roles: {
                                    [player1_socket.uuid]: player1_role,
                                    [player2_socket.uuid]: player2_role
                                }
                            }
                        };
                        
                        room.players.forEach(client => {
                            client.send(JSON.stringify(command));
});
                        room.playersInPortal.clear();
                    }
                }
                break;
            }

            case "leave_portal": {
                if (room) {
                    room.playersInPortal.delete(socket.uuid);
                }
                break;
            }
        }
    });

    socket.on("close", () => {
        // ... (sua lógica de desconexão continua a mesma) ...
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