var chess = require('chess.js')
  , db = require('./db')

var variants = { lovenheim:1, classic:2, rochester:3};
var states   = { active:1, inactive:0, finished:-1};
var colors   = { 'w':'white', 'b':'black'};
var colorx   = { 'white':'black', 'black':'white'};
var spiels   = {};

Spiel = module.exports = {};

var unwind = function(obj) {return function(x){ if(!isNaN(parseInt(x))) { for(var i in obj) {if(obj[i]==x) return i;} return null; } else { return obj[x]; } }};
var state = Spiel.state = unwind(states);
var variant = Spiel.variant = unwind(variants);

//Gets a game, either from memory or the database.
var find = Spiel.find = function(gameid,callback) {

	if(spiels[gameid]) {
		//Game is in memory
		callback(spiels[gameid]);
	} else {
		//Game is not in memory, find in DB
		db.findGameById(gameid,function(err,record){
			//Create the game
			var game = spiels[gameid] = new kriegspiel(gameid);
			if(!err && record) game.deserialize(record);
			callback(game);
		});
	}
	
}

//Method for a player to join a game
var join = Spiel.join = function(gameid,player) {
	find(gameid,function(game) {
		//Join the game
		game.join(player,'white',function(err,save,color){
			if(!err && save) game.save(function(err,success,gid){
				if (!err && typeof gid === "string") game.gid = gid;
			});
			if (!err && game.white.username && game.white.socket) game.start('white');
			if (!err && game.black.username && game.black.socket) game.start('black');
		});
	});
}

//Method for a player to make a move
var move = Spiel.move = function(gameid,source,target,scratch,player) {
	find(gameid,function(game) {
		game.move(source,target,scratch);
		game.save();
	});
}
//
// Kriegspiel Object
// Manages moves and boards
//
var ranks = '1,2,3,4,5,6,7,8'.split(',');
var files = 'a,b,c,d,e,f,g,h'.split(',');

var kriegspiel = function(gameid,variant) {
	this.gameid = gameid;	
	this.board  = new chess.Chess();
	this.state  = states.active;	
	this.variant = variant||variants.lovenheim;
	this.messages = [];
	
	//Each color has their own board to test illegality
	this.white = { board:new chess.Chess(),scratch:'rnbqkbnr/pppppppp/8/8/8/8/8/8' };
	this.black = { board:new chess.Chess(),scratch:'8/8/8/8/8/8/PPPPPPPP/RNBQKBNR' };
	
	//Remove all opposing pieces on own boards.  These boards are used to test impossible moves.
	this.clear('white');
	this.clear('black');
};

//Clears all opposing pieces from a player's impossible checking board.
kriegspiel.prototype.clear = function(color) {
	var self = this;
	var player = self[color];
	var board = player.board;
	var oppos = colorx[color].charAt(0);
	var square,piece;
	for(var f=0;f<8;f++) {
		for(var r=0;r<8;r++) {
			square = files[f] + ranks[r];
			piece = board.get(square);
			if(piece && piece.color===oppos && piece.type!=='k') board.remove(square);
		}
	}
}

//Joins a game
kriegspiel.prototype.join = function(player,color,callback) {
	var self = this;
	var oppos = color==='white'?'black':'white';
	if(player.session.username === self.white.username) {
		//Welcome back to the game as white!
		self.white.socket = player.socket;
		callback(null,false,'white');
	} else if(player.session.username === self.black.username) {
		//Welcome back to the game as black!
		self.black.socket = player.socket;
		callback(null,false,'black');
	} else if(!self[color].username) {
		//Preferred color is free
		self[color].username=player.session.username;
		self[color].socket=player.socket;
		callback(null,true,color);
	} else if(!self[oppos].username) {
		//Preferred color was taken, opposing color is free
		self[oppos].username=player.session.username;
		self[oppos].socket=player.socket;
		callback(null,true,oppos);
	} else {
		//Player tried to join a full match!
		callback('gamefull');
	}
};

//Saves the full game information to the database
kriegspiel.prototype.save = function(callback) {
	db.saveGame(this.serialize(),callback||function(){});
};

//Serializes the game for save or response
kriegspiel.prototype.serialize = function(color) {
	var self = this;
	if (!color) {
		return {
			gid:self.gid,
			gameid:self.gameid,
			state:self.state,
			turn:self.state===1?self.board.turn():'',
			whiteusername:self.white.username,
			blackusername:self.black.username,
			history:self.board.history(),
			messages:self.messages,
			boards:{
				both:self.board.fen(),
				white:self.white.board.fen(),
				black:self.black.board.fen(),
				whitescratch:self.white.scratch,
				blackscratch:self.black.scratch
			}
		};
	} else {	
		return {
			gid:self.gid,
			gameid:self.gameid,
			state:self.state,
			turn:self.state===1?self.board.turn():'',
			whiteusername:self.white.username,
			blackusername:self.black.username,
			messages:self.messages,
			position:self[color].board.fen(),
			scratch:self[color].scratch
		};
	}	

};

//Deserializes the game from the database game document
kriegspiel.prototype.deserialize = function(game) {
	var self = this;
	self.gid = game.gid;
	self.gameid = game.gameid;
	self.state = game.state;
	self.turn = game.turn;
	self.white.username = game.whiteusername;
	self.black.username = game.blackusername;
	self.board.load(game.boards.both);
	self.white.board.load(game.boards.white);
	self.black.board.load(game.boards.black);
	self.white.scratch = game.boards.whitescratch;
	self.black.scratch = game.boards.blackscratch;
	self.messages = game.messages;
};

//Starts the game
kriegspiel.prototype.start = function(color) {
	var self = this;
	var player = self[color];
	var isactive = color;
	var inactive = color==='white'?'black':'white';
	if (player.socket && player.socket.emit) {
		player.socket.emit('kriegspiel', { color: color, game:self.serialize(color) });
		var welcome = player.username + " has joined as " + color + "!";
		self.message({type:'welcome',isactive:isactive,inactive:inactive,username:player.username,color:color,message:welcome},{},{});
	}
};

//Finishes the game
kriegspiel.prototype.finish = function() {
	var self = this;
	var white = self.white;
	var black = self.black;

	self.state = states.finished;

	var game = self.serialize();
	
	if (white.socket && white.socket.emit) {
		white.socket.emit('finished', { game:game });
	}
	
	if (black.socket && black.socket.emit) {
		black.socket.emit('finished', { game:game });
	}

};

//Tests the impossibility of a move (moving a bishop like a knight
kriegspiel.prototype.impossible = function(color,move) {
	var self = this;
	var player = self[color];
	var board = player.board;
	var temp  = new chess.Chess();
	var fen   = board.fen();
	temp.load(fen);
	return temp.move(move)===null?true:false;
};

//Hack a FEN to setup a blank opposition board, that can test for impossible moves.
kriegspiel.prototype.position = function(color,move) {	
	var self = this;

	//Color shortcuts;
	var oppos = colorx[color];
	var c = color.charAt(0);
	var o = oppos.charAt(0);
	
	var player   = self[color];
	var opponent = self[oppos];
	var master = self.board;
	var board  = player.board;
	var oppon  = opponent.board;
	
	//Manually move the piece on the player's board
	var piece = board.get(move.from);
	if (piece){ board.remove(move.from); board.put(piece,move.to); }

	//Reset necessary FEN params based on the master board.
	var mfen    = master.fen().split(' ');
	var pfen    = board.fen().split(' ');
	var ofen    = oppon.fen().split(' ');
	
	//reset color to player's color	
	pfen[1]=c; 
	ofen[1]=o;

	//set en-pessant
	pfen[2]='-';     
	ofen[2]=mfen[2];
	
	//set castle possibilities
	var pcastle = c==='w'?['k','q']:['K','Q'];
	var ocastle = o==='w'?['k','q']:['K','Q'];
	pfen[3]=mfen[3].replace(pcastle[0],'').replace(pcastle[1],''); 
	ofen[3]=mfen[3].replace(ocastle[0],'').replace(ocastle[1],'');

	//Load FEN's and clear opposing pieces
	board.load(pfen.join(' '));
	oppon.load(ofen.join(' '));
	self.clear(color);
	self.clear(oppos);
	
	console.log(self.white.board.ascii());
	console.log(self.black.board.ascii());
};

//Removes a piece from the opponents board due to capture
kriegspiel.prototype.capture = function(inactive,target) {
	var self = this;
	var board = self[inactive].board;
	var square = board.get(target);
	if (square) board.remove(target);
};

//Tests if a player is in check
kriegspiel.prototype.check = function() {
	if (this.board.in_check()) {
		//TODO: rank|file|long_diagonal|short_diagonal|knight
		return 'check'
	}
	return null;
};


//Tests if the game has ended due to checkmate, stalemate, or draw
kriegspiel.prototype.gameover = function() {
	var board = this.board;
	if (board.in_checkmate()) return 'checkmate';
	if (board.in_stalemate()) return 'stalemate';
	if (board.in_draw()) return 'draw';
	if (board.in_threefold_repetition()) return 'draw_by_repetition';
	return null;
};

//Logs a game message and sends it to open sockets 
kriegspiel.prototype.message = function(data,playermessage,opponentmessage) {

	var self = this;
	var player = self[data.isactive]; 
	var opponent = self[data.inactive];

	var send = function(color,msg,obj) {
		if(color && color.socket && color.socket.emit) {
			//Clone the object and send it!
			for(var p in obj) { if(obj.hasOwnProperty(p)) msg[p]=obj[p]; }
			color.socket.emit(obj.type,msg)
		}
	};

	if(data.isactive) data.who = data.isactive;
	self.messages.push(data);
	send(player,playermessage,data);
	send(opponent,opponentmessage,data);
};

//Verifies a move on the board, makes it if legal, and cancels otherwise
kriegspiel.prototype.move = function(source,target,scratch) {
	var self = this;
	var move = {from:source,to:target};
	var turn = self.board.turn();
	var isactive = colors[turn];
	var inactive = turn==='w'?colors['b']:colors['w'];
	var player = self[isactive];
	var opponent = self[inactive];
	
	//Keep player's scratch board:
	player.scratch = scratch;

	//Attempt the move
	var result = self.board.move(move);
	if (result === null) {
		//Move rejected
		if (self.impossible(isactive,move)) {
			//Move was impossible!
			var message = isactive + " has attempted an impossible move";
			self.message({type:'impossible',isactive:isactive,inactive:inactive,message:message,square:target},{action:'start'},{action:'stop'});
		} else {
			//Move illegal
			var message = isactive + " has attempted an illegal move to " + target;
			self.message({type:'illegal',isactive:isactive,inactive:inactive,message:message,square:target},{action:'start'},{action:'stop'});
		}
	} else {
		
		//Move was successful, send the appropriate announcements
		if (result.captured && result.captured.length) {
			self.capture(inactive,target);
			var message = isactive + " has moved and captured on " + target;
			self.message({type:'capture',isactive:isactive,inactive:inactive,message:message,square:target},{action:'stop'},{action:'start'});
		} else {
			var message = isactive + " has moved";
			self.message({type:'move',isactive:isactive,inactive:inactive,message:message,square:target},{action:'stop'},{action:'start'});
		}
		
		//See if there is a check or checkmate or draw
		var check = self.check();
		var gameover = self.gameover();
		if (gameover!==null) {
			var message = inactive + " is in " + gameover;
			self.message({type:'gameover',isactive:isactive,inactive:inactive,message:message},{action:'stop'},{action:'stop'});
			self.finish();
		} else if (check!==null) {
			var message = inactive + " is in " + check + "!";
			self.message({type:'check',isactive:isactive,inactive:inactive,message:message},{action:'stop'},{action:'start'});
		}
		
		//Save the player's positions	
		self.position(isactive,move);
	}
};

//Tests to see if there are any pawn captures available for the active player
kriegspiel.prototype.pawncaptures = function() {
	var self = this;
	var moves = self.board.moves();
	var possible = 0;
	var turn = self.board.turn();
	var isactive = colors[turn];
	var inactive = turn==='w'?colors['b']:colors['w'];
	var player = self[isactive];
	var opponent = self[inactive];
	for(var i=0,l=moves.length;i<l;i++) {
		//Todo: make this work!
		if(moves[i].piece === 'p' && moves[i].rank !== 'changed') possible++;
	}
	if(possible>0) {
		var message = isactive + " has at least one pawn capture";
		self.message({type:'pawncaptures',isactive:isactive,inactive:inactive,message:message},{action:'start'},{action:'stop'});
	} else {
		var message = isactive + " does not have any pawn captures";
		self.message({type:'pawncaptures',isactive:isactive,inactive:inactive,message:message},{action:'start'},{action:'stop'});
	}
};


//Tests to see if a square is occupied
kriegspiel.prototype.occupies = function(square) {
	var self = this;
	var piece = self.board.get(square);
	if (piece) {
		var message = inactive + " occupies " + square;
		self.message({type:'occupies',isactive:isactive,inactive:inactive,message:message},{action:'start'},{action:'stop'});
	} else {
		var message = inactive + " does not occupy " + square;
		self.message({type:'occupies',isactive:isactive,inactive:inactive,message:message},{action:'start'},{action:'stop'});
	}
};