var LogWatcher = require('./hearthstone-log-watcher');
var fs = require('fs');

var lw = new LogWatcher();
//lw.on('game-start', console.log.bind(console, 'game-start:'));

//lw.on('game-over', console.log.bind(console, 'game-over:'));

function HSR() {
    this.data = { players: [ { "id": 1 }, { "id": 2 } ], turns: [] };
    this.actions = [];
    this.currTurn = 0;

}

HSR.prototype.playerJoin = function(player, id, isFirst) {
    if (this.data.players[0].id === parseInt(id)) {
        this.data.players[0].name = player;
        this.data.players[0].isFirst = isFirst;
    }
    else {
        this.data.players[1].name = player;
        this.data.players[1].isFirst = isFirst;
    }
}

HSR.prototype.setHero = function(hero, id) {
    if (this.data.players[0].id === parseInt(id))
        this.data.players[0].hero = hero;
    else
        this.data.players[1].hero = hero;
}

HSR.prototype.setFirst = function(player) {
    /*
    this.data.players[0].isFirst = true;
    */
}

HSR.prototype.setFriendly = function(player) {
    /*if (this.data.players[0].name===player)
        this.data.players[0].isFriendly = true;
    else
        this.data.players[1].isFriendly = true;
        */
}

HSR.prototype.getNameFromId = function(id) {
    if (this.data.players[0].id===id)
        return this.data.players[0].name;
    else
        return this.data.players[1].name;
}

HSR.prototype.addAction = function(action) {
    this.actions.push(action);
}

HSR.prototype.endTurn = function() {
    this.data.turns[this.currTurn] = this.actions;
    this.actions = [];
    this.currTurn++;
}

HSR.prototype.getWinner = function() {
    if (this.data.players[0].isWinner===true)
        return this.data.players[0].name;
    else
        return this.data.players[1].name;
}

HSR.prototype.getLoser = function() {
    if (this.data.players[0].isWinner===false)
        return this.data.players[0].name;
    else
        return this.data.players[1].name;
}

HSR.prototype.setWinner = function(playerName) {
    if (this.data.players[0].name===playerName) {
        this.data.players[0].isWinner = true;
        this.data.players[1].isWinner = false;
    }
    else {
        this.data.players[1].isWinner = true;
        this.data.players[0].isWinner = false;
    }
}

HSR.prototype.print = function() {
    //console.log(JSON.stringify(this.data,null,4));
    function fixZero(n) {
        if (n < 10) n = "0" + n;
        return n;
    };
    var d = new Date();
    var t = d.getFullYear()+"-"+fixZero(d.getMonth()+1)+"-"+fixZero(d.getDate())
        + " " + fixZero(d.getHours()) + "-" + fixZero(d.getMinutes());
    var fileName = __dirname + "/replays/" + t + " " + this.getWinner() + " vs "
        + this.getLoser() + ".hsrep";

    fs.writeFile(fileName, JSON.stringify(this.data,null,4), { flags: 'wx' }, function(err) {
        if(err) throw(err);

        console.log("Replay saved succesfully");
    });
}

HSR.prototype.reset = function() {
    this.data = { players: [ { "id": 1 }, { "id": 2 } ], turns: [] };
}

var hsr = new HSR();

lw.on('player-join', function(data) {
    console.log('[' + data.id + '] '+ data.name + ' has joined.');
    hsr.playerJoin(data.name, data.id, data.isFirst);

});

lw.on('going-first', function(player) {
    console.log(player + ' is going first.');
    //hsr.setFirst(player);

});

lw.on('playing-as', function(player) {
    hsr.setFriendly(player);
    console.log('Playing as: ' + player + '.');
});

lw.on('mulligan-start', function() {
    console.log('Mulligan started.')
});

lw.on('mulligan-end', function() {
    hsr.endTurn();
    console.log('Mulligan ended.')
});

lw.on('end-turn', function() {
    hsr.endTurn();
    console.log('Turn ended.')
});

lw.on('zone-change', function(data) {
    if (data.toZone==="PLAY (Hero)") {
        hsr.setHero(data.cardName, data.playerId);
        hsr.addAction({"transition": data.cardName + ";"+data.fromZone+";"+data.toZone});
        console.log(data.cardName + " is played by player" + data.playerId);
    }
    else if (data.toZone==="PLAY (Hero Power)") {
        console.log("  " + data.cardName + " is the Hero Power for player" + data.playerId);
    }
    else {
    hsr.addAction({"transition": data.cardName + ";"+data.fromZone+";"+data.toZone});
    //console.log('  ' + hsr.getNameFromId(data.cardId) + '\'s ' + data.cardName +' goes from ' + data.cardName + ' ('+ data.cardId +')');
    console.log('  %s moved from %s %s to %s %s.', data.cardName, data.fromTeam, data.fromZone, data.toTeam, data.toZone);
    }
});

lw.on('concede', function(player) {
    console.log(player + ' conceded.');

});

lw.on('result', function(data) {
    var res = data.isWinner===true? 'won.' : 'lost.';
    hsr.setWinner(data.playerName);
    console.log(data.playerName + ' ' + res);

});

lw.on('game-finished', function() {
    hsr.print();

    hsr.reset();// = { players: [], turns: [] };

    console.log('Game finished. \n\nWaiting for new game to start...');

});

console.log('Waiting for game to start...');

lw.start();
