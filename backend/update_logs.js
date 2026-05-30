const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/this\.addLog\(`\$\{player\.name\} instantly received \+\$\{received\} Coins from \$\{target \? target\.name : 'player'\} for \$\{reason\}!`\);/g, 
  "this.addLog({ key: 'log.receivedCoins', params: { name: player.name, coins: received, target: target ? target.name : 'player', reason } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} instantly received \+\$\{received\} Coins from other players for \$\{reason\}!`\);/g, 
  "this.addLog({ key: 'log.receivedCoins', params: { name: player.name, coins: received, target: 'other players', reason } });");

code = code.replace(/this\.addLog\(`\$\{name\} joined the room\.`\);/g, 
  "this.addLog({ key: 'log.joined', params: { name } });");

code = code.replace(/this\.addLog\(`\$\{p\.name\} left the room\.`\);/g, 
  "this.addLog({ key: 'log.left', params: { name: p.name } });");

code = code.replace(/this\.addLog\(`Game started! Round \$\{this\.roundNumber\}\. Dealing cards\.\.\.`\);/g, 
  "this.addLog({ key: 'log.gameStarted', params: { round: this.roundNumber } });");

code = code.replace(/this\.addLog\(`Dealer \$\{this\.players\[this\.dealerIndex\]\.name\}'s turn\.`\);/g, 
  "this.addLog({ key: 'log.dealerTurn', params: { name: this.players[this.dealerIndex].name } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} draws a card\.`\);/g, 
  "this.addLog({ key: 'log.draws', params: { name: player.name } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} got flower\/animal \$\{tile\.display\}! Compensating\.\.\.`\);/g, 
  "this.addLog({ key: 'log.flower', params: { name: player.name, tile: tile.display } });");

code = code.replace(/this\.addLog\(`\$\{p\.name\} discards \$\{tile\.display\}\.`\);/g, 
  "this.addLog({ key: 'log.discards', params: { name: p.name, tile: tile.display } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} successfully upgrades Pong to Kong with \$\{matchingTile\.display\}!`\);/g, 
  "this.addLog({ key: 'log.upgradeKong', params: { name: player.name, tile: matchingTile.display } });");

code = code.replace(/this\.addLog\(`\$\{claimer\.name\} Pongs \$\{tile\.display\}!`\);/g, 
  "this.addLog({ key: 'log.pongs', params: { name: claimer.name, tile: tile.display } });");

code = code.replace(/this\.addLog\(`\$\{claimer\.name\} Chows to form sequence \[\$\{meldTiles\.map\(t => t\.display\)\.join\(', '\)\}\]!`\);/g, 
  "this.addLog({ key: 'log.chows', params: { name: claimer.name, tiles: meldTiles.map(t => t.display).join(', ') } });");

code = code.replace(/this\.addLog\(`\$\{claimer\.name\} declares Kong with \$\{tile\.display\}!`\);/g, 
  "this.addLog({ key: 'log.declaresKong', params: { name: claimer.name, tile: tile.display } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} rescued a 飞 \\(Joker\\) by substituting a \$\{realTile\.display\}!`\);/g, 
  "this.addLog({ key: 'log.rescuedJoker', params: { name: player.name, tile: realTile.display } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} attempts to upgrade Pong to Kong with \$\{matchingTile\.display\}\.\.\.`\);/g, 
  "this.addLog({ key: 'log.attemptsUpgrade', params: { name: player.name, tile: matchingTile.display } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} declares Dark Kong with \$\{option\.value\}\$\{option\.type === TILE_TYPES\.CIRCLE \? '筒' : ''\}!`\);/g, 
  "this.addLog({ key: 'log.darkKong', params: { name: player.name, tile: option.value + (option.type === TILE_TYPES.CIRCLE ? '筒' : '') } });");

code = code.replace(/this\.addLog\(`\$\{player\.name\} exposes Joker \\(炖飞\\)!`\);/g, 
  "this.addLog({ key: 'log.exposesJoker', params: { name: player.name } });");

code = code.replace(/this\.addLog\(`\$\{winner\.name\} HU! wins with \$\{scoreResult\.totalFan\} Fan!`\);/g, 
  "this.addLog({ key: 'log.hu', params: { name: winner.name, fan: scoreResult.totalFan } });");

code = code.replace(/this\.addLog\('Deck empty\. Game is a Draw \\(流局\\)!'\);/g, 
  "this.addLog({ key: 'log.draw' });");

code = code.replace(/room\.addLog\(`\$\{p\.name\} is \$\{p\.isReady \? 'READY' : 'NOT READY'\}\.`\);/g, 
  "room.addLog({ key: 'log.ready', params: { name: p.name, status: p.isReady ? 'READY' : 'NOT READY' } });");

code = code.replace(/room\.addLog\(`\$\{room\.players\.find\\(p => p\.id === playerId\\)\?\\.name\} exposes Joker \\(炖飞\\)!`\);/g, 
  "room.addLog({ key: 'log.exposesJoker', params: { name: room.players.find(p => p.id === playerId)?.name } });");

code = code.replace(/room\.addLog\('Room reset\. Waiting for players to get ready\.'\);/g, 
  "room.addLog({ key: 'log.roomReset' });");

fs.writeFileSync('server.js', code);
console.log('Logs updated in server.js');
