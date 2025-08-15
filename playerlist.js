// playerlist.js - Um pequeno "banco de dados" para guardar os jogadores no servidor.

let players = [];

const getAll = () => new Promise(resolve => resolve(players));

const get = (uuid) => new Promise(resolve => {
    // ---> MUDANÇA: .find() é mais eficiente que .map() para encontrar um item
    resolve(players.find(p => p.uuid === uuid));
});

// ---> MUDANÇA: A função 'add' agora aceita o estado 'isReady'
const add = (uuid, isReady) => new Promise(resolve => {
    const player = {
        uuid,
        x: 252.08,
        y: 524.92,
        ready: isReady // Propriedade para saber se o jogador está pronto
    };
    players.push(player);
    resolve(true);
});

const update = (uuid, newX, newY) => {
    const player = players.find(p => p.uuid === uuid);
    if (player) {
        player.x = newX;
        player.y = newY;
    }
};

const remove = (uuid) => {
    players = players.filter(player => player.uuid !== uuid);
};

// ---> ADIÇÃO: Nova função para atualizar o estado 'ready'
const setReady = (uuid, isReady) => new Promise(resolve => {
    const player = players.find(p => p.uuid === uuid);
    if (player) {
        player.ready = isReady;
    }
    resolve(true);
});

module.exports = {
    getAll,
    get,
    add,
    update,
    remove,
    setReady, // ---> MUDANÇA: Exportamos a nova função
};