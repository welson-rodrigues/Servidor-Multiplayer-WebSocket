// server.js - O servidor autoritativo que gerencia o estado do jogo.

const express = require("express");
const WebSocket = require("ws");
const { v4 } = require("uuid");
const playerlist = require("./playerlist.js");

// ---> ADIÇÃO: Lista de níveis e estado do jogo
const levelOrder = [
    "res://levels/level_01.tscn",
    "res://levels/level_02.tscn",
    "res://levels/level_03.tscn", // Adicione mais níveis aqui
];
let currentLevelIndex = 0;

const app = express();
// ---> MUDANÇA: Para funcionar em serviços como o Render
const PORT = process.env.PORT || 9090;
const server = app.listen(PORT, () => {
    console.log("Server listening on port: " + PORT);
});

const wss = new WebSocket.Server({ server });

wss.on("connection", async (socket) => {
    const uuid = v4();
    // ---> MUDANÇA: Passamos o estado "pronto" inicial (false)
    await playerlist.add(uuid, false);
    const newPlayer = await playerlist.get(uuid);

    // O código de envio de "joined_server", "spawn_local_player", etc. continua o mesmo...
    socket.send(JSON.stringify({ cmd: "joined_server", content: { uuid } }));
    socket.send(JSON.stringify({ cmd: "spawn_local_player", content: { player: newPlayer } }));
    const spawnNewPlayerMsg = JSON.stringify({ cmd: "spawn_new_player", content: { player: newPlayer } });
    wss.clients.forEach((client) => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
            client.send(spawnNewPlayerMsg);
        }
    });
    socket.send(JSON.stringify({ cmd: "spawn_network_players", content: { players: await playerlist.getAll() } }));


    socket.on("message", async (message) => {
        let data;
        try { data = JSON.parse(message.toString()); } 
        catch (err) { console.error("Erro JSON:", err); return; }

        if (data.cmd === "position") {
            playerlist.update(uuid, data.content.x, data.content.y);
            const update = { cmd: "update_position", content: { uuid, x: data.content.x, y: data.content.y } };
            wss.clients.forEach((client) => {
                if (client !== socket && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(update));
                }
            });
        }

        if (data.cmd === "action") {
            const actionUpdate = { cmd: "update_action", content: { uuid, name: data.content.name } };
            wss.clients.forEach((client) => {
                if (client !== socket && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(actionUpdate));
                }
            });
        }
        
        // ---> ADIÇÃO: Bloco de lógica para o botão cooperativo
        if (data.cmd === "player_ready") {
            await playerlist.setReady(uuid, true);
            const allPlayers = await playerlist.getAll();
            // Condição: Precisa ter 2 jogadores e ambos precisam estar prontos
            const allReady = allPlayers.length > 1 && allPlayers.every(p => p.ready);

            if (allReady) {
                console.log("Todos prontos! Mudando de nível...");
                currentLevelIndex++;
                if (currentLevelIndex >= levelOrder.length) {
                    currentLevelIndex = 0; // Reinicia do primeiro nível
                }
                const nextLevelPath = levelOrder[currentLevelIndex];
                const nextLevelMessage = { cmd: "change_level", content: { path: nextLevelPath } };
                
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(nextLevelMessage));
                    }
                });

                // Reseta o estado de "pronto" de todos para a próxima fase
                allPlayers.forEach(p => playerlist.setReady(p.uuid, false));
            }
        }

        if (data.cmd === "chat") {
            // Lógica do chat continua a mesma
        }
    });

    socket.on("close", () => {
        playerlist.remove(uuid);
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ cmd: "player_disconnected", content: { uuid } }));
            }
        });
    });
});