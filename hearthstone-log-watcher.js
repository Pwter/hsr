var EventEmitter = require('events').EventEmitter;
var util = require('util');
var fs = require('fs');
var path = require('path');
var os = require('os');
var extend = require('extend');

var defaultOptions = {
  endOfLineChar: os.EOL
};

var debug = require('debug');
// Define some debug logging functions for easy and readable debug messages.
var log = {
  main: debug('HLW'),
  gameStart: debug('HLW:game-start'),
  zoneChange: debug('HLW:zone-change'),
  gameOver: debug('HLW:game-over')
};

// Determine the default location of the config and log files.
if (/^win/.test(os.platform())) {
  log.main('Windows platform detected.');
  var programFiles = 'Program Files';
  if (/64/.test(os.arch())) {
    programFiles += ' (x86)';
  }
  defaultOptions.logFile = path.join('C:', 'Games', 'Hearthstone', 'Hearthstone_Data', 'output_log.txt');
  defaultOptions.configFile = path.join(process.env.LOCALAPPDATA, 'Blizzard', 'Hearthstone', 'log.config');
} else {
  log.main('OS X platform detected.');
  defaultOptions.logFile = path.join(process.env.HOME, 'Library', 'Logs', 'Unity', 'Player.log');
  defaultOptions.configFile = path.join(process.env.HOME, 'Library', 'Preferences', 'Blizzard', 'Hearthstone', 'log.config');
}

// The watcher is an event emitter so we can emit events based on what we parse in the log.
function LogWatcher(options) {
    this.options = extend({}, defaultOptions, options);

    log.main('config file path: %s', this.options.configFile);
    log.main('log file path: %s', this.options.logFile);

    // Copy local config file to the correct location.
    // We're just gonna do this every time.
    var localConfigFile = path.join(__dirname, 'log.config');
    fs.createReadStream(localConfigFile).pipe(fs.createWriteStream(this.options.configFile));
    log.main('Copied log.config file to force Hearthstone to write to its log file.');
}
util.inherits(LogWatcher, EventEmitter);

LogWatcher.prototype.start = function () {
  var self = this;

  var parserState = new ParserState;

  log.main('Log watcher started.');
  // Begin watching the Hearthstone log file.
  var fileSize = fs.statSync(self.options.logFile).size;
  fs.watchFile(self.options.logFile, function (current, previous) {
    if (current.mtime <= previous.mtime) { return; }

    // We're only going to read the portion of the file that we have not read so far.
    var newFileSize = fs.statSync(self.options.logFile).size;
    var sizeDiff = newFileSize - fileSize;
    if (sizeDiff < 0) {
      fileSize = 0;
      sizeDiff = newFileSize;
    }
    var buffer = new Buffer(sizeDiff);
    var fileDescriptor = fs.openSync(self.options.logFile, 'r');
    fs.readSync(fileDescriptor, buffer, 0, sizeDiff, fileSize);
    fs.closeSync(fileDescriptor);
    fileSize = newFileSize;

    self.parseBuffer(buffer, parserState);
  });

  self.stop = function () {
    fs.unwatchFile(self.options.logFile);
    delete self.stop;
  };
};

LogWatcher.prototype.stop = function () {};

LogWatcher.prototype.parseBuffer = function (buffer, parserState) {
  var self = this;

  if (!parserState) {
    parserState = new ParserState;
  }

  // Iterate over each line in the buffer.
  buffer.toString().split(this.options.endOfLineChar).forEach(function (line) {
      // If it's a card movement
      // Check if a card is changing zones.
      var zoneChangeRegex = /^\[Zone\] ZoneChangeList.ProcessChanges\(\) - id=\d* local=.* \[name=(.*) id=(\d*) zone=.* zonePos=\d* cardId=(.*) player=(\d)\] zone from ?(FRIENDLY|OPPOSING)? ?(.*)? -> ?(FRIENDLY|OPPOSING)? ?(.*)?$/
      if (zoneChangeRegex.test(line)) {
        var parts = zoneChangeRegex.exec(line);
        var data = {
          cardName: parts[1],
          entityId: parseInt(parts[2]),
          cardId: parts[3],
          playerId: parseInt(parts[4]),
          fromTeam: parts[5],
          fromZone: parts[6],
          toTeam: parts[7],
          toZone: parts[8]
        };

        self.emit('zone-change', data);
    }
      // player joins
      //var playerNameRegex = /\[Power\] GameState.DebugPrintPower\(\) -     FULL_ENTITY - Updating \[name=(.*) id=(.*) zone=(.*) zonePos=0 cardId=(.*) player=(.*)\] CardID/;
      var playerNameRegex = /\[Power\] GameState.DebugPrintEntityChoices\(\) - id=(.) Player=(.*) TaskList=(.*) ChoiceType=MULLIGAN CountMin=0 CountMax=(.)/;
      if (playerNameRegex.test(line)) {
          var parts = playerNameRegex.exec(line);
          var data = {
              name: parts[2],
              id: parts[1],
              isFirst: parseInt(parts[4]) === 3 ? true : false
          }

          self.emit('player-join', data);
      }

      // set who is first
      var whoIsFirstRegex = /\[Power\] GameState.DebugPrintPower\(\) - TAG_CHANGE Entity=(.*) tag=FIRST_PLAYER value=1/;
      if (whoIsFirstRegex.test(line)) {
          var player = whoIsFirstRegex.exec(line);
          self.emit('going-first', player[1]);
      }

      // set friendly
      var whoIsFriendlyRegex = /\[Power\] GameState.DebugPrintPower\(\) - TAG_CHANGE Entity=(.*) tag=HERO_ENTITY value=66/;
      if (whoIsFriendlyRegex.test(line)) {
          var player = whoIsFriendlyRegex.exec(line);
          self.emit('playing-as', player[1]);
      }

      // mulligan starting
      var substrMulligan = '[Power] GameState.DebugPrintPower() -         tag=NEXT_STEP value=BEGIN_MULLIGAN';
      if (line.indexOf(substrMulligan) !== -1) {
          self.emit('mulligan-start', data);
      }

      substrMulligan = '[Power] PowerProcessor.PrepareHistoryForCurrentTaskList() - m_currentTaskList=13';
      if (line === substrMulligan) {
          self.emit('mulligan-end', data);
      }

      // end turn
      var substrEndTurn = '[Power] GameState.DebugPrintPower() -     TAG_CHANGE Entity=GameEntity tag=TURN value=';
      if (line.indexOf(substrEndTurn) !== -1) {
          self.emit('end-turn', data);
      }
      // game finished
      var resultRegex = /\[Power\] GameState.DebugPrintPower\(\) - TAG_CHANGE Entity=(.*) tag=PLAYSTATE value=(LOST|WON)/;
      if (resultRegex.test(line)) {
          var player = resultRegex.exec(line);
          var isWinner = player[2] === 'WON' ? true : false;
          var data = {
              playerName: player[1],
              isWinner: isWinner
          }

          self.emit('result', data);
      }

      // someone gives up
      var concedeRegex = /\[Power\] GameState.DebugPrintPower\(\) - TAG_CHANGE Entity=(.*) tag=PLAYSTATE value=CONCEDED/;
      if (concedeRegex.test(line)) {
          var player = concedeRegex.exec(line);
          self.emit('concede', player[1]);
      }

      // game ended

      var substrFinished = '[Power] GameState.DebugPrintPower() - TAG_CHANGE Entity=GameEntity tag=STEP value=FINAL_GAMEOVER';
      if (line.indexOf(substrFinished) !== -1) {
          self.emit('game-finished');
      }

  });
      //var transitionRegex = /^\[Zone\] ZoneChangeList\.ProcessChanges\(\) - TRANSITIONING card \[(name=(.* ))?id=(\d*) (zone=(.*) zonePos=(\d*) )?cardId=(.*) (player=(\d))] to (FRIENDLY|OPPOSING) (HAND|PLAY)(.*)$/;
      /*if (transitioneRegex.test(line)) {
          var parts = transitionRegex.exec(line);
          if (line.indexOf('INVALID') === -1) {
              var data = {
                  cardName: parts[1],
                  entityId: parseInt(parts[3]),
                  playerId: parseInt(parts[9]),
                  toTeam: parts[10],
                  toZone: parts[11]
              };
          }
          else {
              var data = {
                  cardName: 'invalid!',
                  entityId: 'invalid!',
                  playerId: 'invalid!',
                  toTeam: 'invalid!',
                  toZone: 'invalid!'
              };
          }
        //log.zoneChange('%s moved from %s %s to %s %s.', data.cardName, data.fromTeam, data.fromZone, data.toTeam, data.toZone);
        self.emit('transition', data);

    }

  });
    // Check if a card is changing zones.
    var zoneChangeRegex = /^\[Zone\] ZoneChangeList.ProcessChanges\(\) - id=\d* local=.* \[name=(.*) id=(\d*) zone=.* zonePos=\d* cardId=(.*) player=(\d)\] zone from ?(FRIENDLY|OPPOSING)? ?(.*)? -> ?(FRIENDLY|OPPOSING)? ?(.*)?$/
    if (zoneChangeRegex.test(line)) {
      var parts = zoneChangeRegex.exec(line);
      var data = {
        cardName: parts[1],
        entityId: parseInt(parts[2]),
        cardId: parts[3],
        playerId: parseInt(parts[4]),
        fromTeam: parts[5],
        fromZone: parts[6],
        toTeam: parts[7],
        toZone: parts[8]
      };
      log.zoneChange('%s moved from %s %s to %s %s.', data.cardName, data.fromTeam, data.fromZone, data.toTeam, data.toZone);
      self.emit('zone-change', data);

      // Only zone transitions show both the player ID and the friendly or opposing zone type. By tracking entities going into
      // the "PLAY (Hero)" zone we can then set the player's team to FRIENDLY or OPPOSING. Once both players are associated with
      // a team we can emite the game-start event.
      if (data.toZone === 'PLAY (Hero)') {
        parserState.players.forEach(function (player) {
          if (player.id === data.playerId) {
            player.team = data.toTeam;
            parserState.playerCount++;
            if (parserState.playerCount === 2) {
              log.gameStart('A game has started.');
              self.emit('game-start', parserState.players);
            }
        }
      });
      }
    }

    // Check for players entering play and track their team IDs.
    var newPlayerRegex = /\[Power\] GameState\.DebugPrintPower\(\) - TAG_CHANGE Entity=(.*) tag=PLAYER_ID value=(.)$/;
    if (newPlayerRegex.test(line)) {
      var parts = newPlayerRegex.exec(line);
      parserState.players.push({
        name: parts[1],
        id: parseInt(parts[2])
      });
    }

    // Check if the game is over.
    var gameOverRegex = /\[Power\] GameState\.DebugPrintPower\(\) - TAG_CHANGE Entity=(.*) tag=PLAYSTATE value=(LOST|WON|TIED)$/;
    if (gameOverRegex.test(line)) {
      var parts = gameOverRegex.exec(line);
      // Set the status for the appropriate player.
      parserState.players.forEach(function (player) {
        if (player.name === parts[1]) {
          player.status = parts[2];
        }
      });
      parserState.gameOverCount++;
      // When both players have lost, emit a game-over event.
      if (parserState.gameOverCount === 2) {
        log.gameOver('The current game has ended.');
        self.emit('game-over', parserState.players);
        parserState.reset();
    }*/

};

function ParserState() {
  this.reset();
}

ParserState.prototype.reset = function () {
  this.players = [];
  this.playerCount = 0;
  this.gameOverCount = 0;
};


// Set the entire module to our emitter.
module.exports = LogWatcher;
