/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*
* Server Side Side Game Logic
*
*******************************************/

var chess = require('chess.js')
  , db = require('./db')
  , variants = require('./variants').load();
  
var states   = { active:1, inactive:0, finished:-1};
var colors   = { 'w':'white', 'b':'black'};
var colorx   = { 'white':'black', 'black':'white'};
var spiels   = {};

var unwind = function(obj) {return function(x){ if(!isNaN(parseInt(x))) { for(var i in obj) {if(obj[i]==x) return i;} return null; } else { return obj[x]; } }};


Spiel = module.exports = {};

// =============================================================
// Spiel Module API
//

var state = Spiel.state = unwind(states);

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
		//game.move(source,target,scratch);
		if(game.move(source,target,scratch)) game.save();
	});
}

//Request if there are any pawn captures available
var pawncaptures = Spiel.pawncaptures = function(gameid,player) {
	find(gameid,function(game) {
		if(game.pawncaptures()) game.save();
	});
}

//Request if the square is occupied
var occupies = Spiel.occupies = function(gameid,target,player) {
	find(gameid,function(game) {
		if(game.occupies(target)) game.save();
	});
}

//Offers a draw to the opponent
var offerdraw = Spiel.offerdraw = function(gameid,player) {
	find(gameid,function(game) {
		if(game.offerdraw(player.session.username)) game.save();
	});
}

//Accepts a draw offer
var acceptdraw = Spiel.acceptdraw = function(gameid,player) {
	find(gameid,function(game) {
		if(game.acceptdraw(player.session.username)) game.save();
	});
}

//Accepts a draw offer
var declinedraw = Spiel.declinedraw = function(gameid,player) {
	find(gameid,function(game) {
		if(game.declinedraw(player.session.username)) game.save();
	});
}

//Call it quits
var resign = Spiel.resign = function(gameid,player) {
	find(gameid,function(game) {
		if(game.resign(player.session.username)) game.save();
	});
}

// =============================================================
// Kriegspiel Object
// Manages moves and boards
//
var ranks	= '1,2,3,4,5,6,7,8'.split(',');
var files	= 'a,b,c,d,e,f,g,h'.split(',');
var getFile	= function(f){ return f.toLowerCase().charCodeAt(0)-97; }  //returns array index of file letter
var getRank	= function(r){ return parseInt(r)-1; } //returns array index of rank number

var getBlankMovestate = function(){ return {occupies:-1,drawoffer:-1,pawncaptures:-1} };

// --------------------------------------------------------------
// Constructor:
var kriegspiel = function(gameid,type) {
	this.gameid = gameid;	
	this.board  = new chess.Chess();
	this.state  = states.inactive;
	this.type = type||'lovenheim';
	this.variant = variants[this.type];
	this.drawoffered = false;
	this.messages = [];
	this.startdate = 0;
	this.enddate = 0;
	this.result = {};
	
	//Each color has their own board to test illegality
	this.white = { board:new chess.Chess(),scratch:'rnbqkbnr/pppppppp/8/8/8/8/8/8',movestate:getBlankMovestate() };
	this.black = { board:new chess.Chess(),scratch:'8/8/8/8/8/8/PPPPPPPP/RNBQKBNR',movestate:getBlankMovestate() };
	
	//Remove all opposing pieces on own boards.  These boards are used to test impossible moves.
	this.clear('white');
	this.clear('black');
};

// --------------------------------------------------------------
// Prototypes:

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
	if (!color || self.state === states.finished) {
		return {
			gid:self.gid,
			gameid:self.gameid,
			type:self.type,
			state:self.state,
			turn:self.state===1?self.board.turn():'',
			whiteusername:self.white.username,
			blackusername:self.black.username,
			messages:self.messages,
			startdate:self.startdate,
			enddate:self.enddate,
			history:self.board.history({verbose:true}),
			result:self.result,
			drawoffered:self.drawoffered,
			boards:{
				pgn:self.board.pgn(),
				white:self.white.board.fen(),
				black:self.black.board.fen(),
				whitescratch:self.white.scratch,
				blackscratch:self.black.scratch,
				whitestate:self.white.movestate,
				blackstate:self.black.movestate
			}
		};
	} else {	
		return {
			gid:self.gid,
			gameid:self.gameid,
			type:self.type,
			state:self.state,
			turn:self.state===1?self.board.turn():'',
			drawoffered:self.drawoffered,
			whiteusername:self.white.username,
			blackusername:self.black.username,
			whitestate:self.white.movestate||getBlankMovestate(),
			blackstate:self.black.movestate||getBlankMovestate(),
			messages:self.messages,
			position:self[color].board.fen(),
			scratch:self[color].scratch,
			startdate:self.startdate,
			enddate:self.enddate
		};
	}	

};

//Deserializes the game from the database game document
kriegspiel.prototype.deserialize = function(game) {
	var self = this;
	self.gid = game.gid;
	self.gameid = game.gameid;
	self.type = game.type;
	self.variant = variants[self.type];
	self.state = game.state;
	self.startdate = game.startdate;
	self.enddate = game.enddate;
	self.drawoffered = game.drawoffered;
	self.turn = game.turn;
	self.white.username = game.whiteusername;
	self.black.username = game.blackusername;
	self.board.load_pgn(game.boards.pgn);
	self.white.board.load(game.boards.white);
	self.black.board.load(game.boards.black);
	self.white.scratch = game.boards.whitescratch;
	self.black.scratch = game.boards.blackscratch;
	self.white.movestate = game.boards.whitestate;
	self.black.movestate = game.boards.blackstate;
	self.messages = game.messages;
	self.result = game.result;
};

//Starts the game
kriegspiel.prototype.start = function(color) {
	var self = this;
	var isactive = color;
	var inactive = color==='white'?'black':'white';
	var player = self[isactive];
	var opponent = self[inactive];

	self.startdate = self.startdate || Date.now();
	var date = (new Date(self.startdate)).toUTCString();

	if (player && player.username && opponent && opponent.username) {
		self.board.header('White',self.white.username,'Black',self.black.username,'Date',date);
		self.state = states.active;
	} 

	if (player.socket && player.socket.emit) {
		player.socket.emit('kriegspiel', { color: color, game:self.serialize(color) });
		self.message({type:'welcome',isactive:isactive,inactive:inactive,username:player.username,startdate:date,color:color},{},{});
	}
};

//Checks to see if gameplay is active
kriegspiel.prototype.okplay = function() {
	if (self.state === states.inactive) { self.message({type:'inactive'},{},{}); return false; }
	if (self.state === states.finished) { self.message({type:'finished'},{},{}); return false; }
	return true;
}

//Finishes the game
kriegspiel.prototype.finish = function() {
	var self   = this;
	var white  = self.white;
	var black  = self.black;
	var result = self.result;
	var score  = result.white.toString() + '-' + result.black.toString();

	self.enddate = new Date();
	self.state = states.finished;

	self.message({type:'finish',result:result,score:score},{action:'stop'},{action:'stop'});

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
kriegspiel.prototype.position = function(color,move,result) {	
	var self = this;

	var castle = function(castleType) {
		var square = board.get(castleType.source); 
		if (square.type === castleType.piece) {
			board.remove(castleType.source);
			board.put(castleType.piece,castleType.target);
		}
	};

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
	var castle = (result.flags.indexOf('k')>-1)?'k':((result.flags.indexOf('q')>-1)?'q':false);
	if (piece) {
		board.remove(move.from);
		board.put(piece,move.to);
		if (castle) {
			//Manually castle the rook
			var rook = {type:'r',color:c};
			var rank = color==='white'?'1':'8';
			if (castle==='k') { board.remove('h'+rank); board.put(rook,'f'+rank); }
			if (castle==='q') { board.remove('a'+rank); board.put(rook,'d'+rank); }
		}
	}

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
kriegspiel.prototype.gameover = function(isactive,inactive) {
	var self = this;
	var result = null;
	var board = self.board;
	if (board.in_checkmate()) result = {type:'checkmate',message:'checkmate',white:(isactive==='white'?1:0),black:(inactive==='white'?1:0)};
	if (board.in_stalemate()) result = {type:'draw',message:'stalemate',white:0.5,black:0.5};
	if (board.insufficient_material()) result = {type:'draw',message:'a draw due to insufficient material',white:0.5,black:0.5};
	if (board.in_threefold_repetition()) result = {type:'draw',message:'a draw by repetition',white:0.5,black:0.5};
	if (board.in_draw()) result = {type:'draw',message:'a draw',white:0.5,black:0.5};
	if (result) self.result = result;
	return result;
};

//Logs a game message and sends it to open sockets 
kriegspiel.prototype.message = function(data,playermessage,opponentmessage) {

	var self = this;
	if(!data.isactive || !data.inactive) {
		var turn = self.board.turn();
		data.isactive = colors[turn];
		data.inactive = turn==='w'?colors['b']:colors['w'];
	}
	var player = self[data.isactive]; 
	var opponent = self[data.inactive];
	data.message = self.variant.message(data.template||data.type,data);

	var send = function(color,msg,obj) {
		if(color && color.socket && color.socket.emit) {
			//Clone the object and send it!
			for(var p in obj) { if(obj.hasOwnProperty(p)) msg[p]=obj[p]; }
			color.socket.emit(obj.type,msg)
		}
	};

	data.who = data.who||data.isactive||'both';
	data.movenumber = self.board.history().length;
	data.epoch = Date.now();
	self.messages.push(data);
	send(player,playermessage,data);
	send(opponent,opponentmessage,data);
};

//Verifies a move on the board, makes it if legal, and cancels otherwise
kriegspiel.prototype.move = function(source,target,scratch) {
	var self = this;

	if(!self.okplay) return false;

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
		if (self.ispawncapture(isactive,move)) {
			//Illegal pawn capture
			self.message({type:'illegal',isactive:isactive,inactive:inactive,square:target},{action:'start'},{action:'stop'});			
		} else if (self.impossible(isactive,move)) {
			//Move was impossible!
			self.message({type:'impossible',isactive:isactive,inactive:inactive,square:target},{action:'start'},{action:'stop'});
		} else {
			//Move illegal
			self.message({type:'illegal',isactive:isactive,inactive:inactive,square:target},{action:'start'},{action:'stop'});
		}
	} else {
		
		//Move was successful, send the appropriate announcements
		if (result.captured && result.captured.length) {
			self.capture(inactive,target);
			self.message({type:'capture',isactive:isactive,inactive:inactive,square:target},{action:'stop'},{action:'start'});
		} else {
			self.message({type:'move',isactive:isactive,inactive:inactive,square:target},{action:'stop'},{action:'start'});
		}
		
		//See if there is a check or checkmate or draw
		var check = self.check();
		var gameover = self.gameover(isactive,inactive);
		if (gameover!==null) {
			//Game over!
			self.message({type:'gameover',isactive:isactive,inactive:inactive,gameover:gameover.message},{action:'stop'},{action:'stop'});
			self.finish();
		} else if (check!==null) {
			self.message({type:'check',isactive:isactive,inactive:inactive,check:check},{action:'stop'},{action:'start'});
		}
		
		//Reset the movestate for the player
		player.movestate = getBlankMovestate();
		
		//Save the player's positions	
		self.position(isactive,move,result);
	}
	
	return true;
};

//Checks if a move is an attempted pawn capture
kriegspiel.prototype.ispawncapture = function(color,move) {
	var self = this;
	var source = move.from;
	var target = move.to;
	var square = self.board.get(source);

	if(!square || square.type!=='p') return false;

	//Piece is a pawn, continue
	var turn = self.board.turn();

	var rdiff = color==='white'?1:-1;
	var sfile = getFile(source.charAt(0));
	var srank = getRank(source.charAt(1));
	var tfile = getFile(target.charAt(0));
	var trank = getRank(target.charAt(1));
	return (
		((srank + rdiff) === trank) && //one rank forward
		(Math.abs(sfile-tfile) === 1) //one file left or right
	) ? true:false;
};

//Tests to see if there are any pawn captures available for the active player
kriegspiel.prototype.pawncaptures = function() {
	var self = this;
	if(!self.okplay) return false;
	var turn = self.board.turn();
	var isactive = colors[turn];
	var inactive = turn==='w'?colors['b']:colors['w'];
	var player = self[isactive];
	var opponent = self[inactive];	
	var possible = self.allpawncaptures();
	player.movestate.pawncaptures=1;
	if(possible.length>0) {
		self.message({type:'pawncaptures',isactive:isactive,inactive:inactive,template:'pawncapturesyes'},{action:'start'},{action:'stop'});
	} else {
		self.message({type:'pawncaptures',isactive:isactive,inactive:inactive,template:'pawncapturesno'},{action:'start'},{action:'stop'});
	}
	
	return true;
};

//Tests to see if there are any pawn captures available for the active player
kriegspiel.prototype.allpawncaptures = function() {
	var self = this;
	var moves = self.board.moves({verbose:true});
	var captures = [];
	var turn = self.board.turn();
	var isactive = colors[turn];
	var inactive = turn==='w'?colors['b']:colors['w'];
	var player = self[isactive];
	var opponent = self[inactive];	
	for(var i=0,l=moves.length;i<l;i++) {
		var move = moves[i];
		if (move.piece==='p' && (move.flags.indexOf('e')>-1 || move.flags.indexOf('c')>-1)) captures.push(move);
	}
	return captures;
};

//Tests to see if a square is occupied
kriegspiel.prototype.occupies = function(square) {
	var self = this;
	if(!self.okplay) return false;
	var turn = self.board.turn();
	var isactive = colors[turn];
	var inactive = turn==='w'?colors['b']:colors['w'];
	self[isactive].movestate.occupies=1;
	var piece = self.board.get(square);
	if (piece) {
		self.message({type:'occupies',isactive:isactive,inactive:inactive,square:square,template:'occupiesyes'},{action:'start'},{action:'stop'});
	} else {
		self.message({type:'occupies',isactive:isactive,inactive:inactive,square:square,template:'occupiesno'},{action:'start'},{action:'stop'});
	}
	
	return true;
};

//Player offers draw
kriegspiel.prototype.offerdraw = function(username){
	var self = this;
	if(!self.okplay || self.drawoffered) return false;
	var isactive = self.white.username===username?'white':'black';
	var inactive = self.black.username===username?'white':'black';
	self.drawoffered = username;
	self[isactive].movestate.drawoffer=1;
	self.message({type:'offerdraw',isactive:isactive,inactive:inactive},{},{});

	return true;
};

//Opponent accepts draw
kriegspiel.prototype.acceptdraw = function(username){
	var self = this;
	if(!self.okplay || !self.drawoffered || self.drawoffered===username) return false;
	var isactive = self.white.username===username?'white':'black';
	var inactive = self.black.username===username?'white':'black';
	self.drawoffered = false;
	self.result = {type:'draw',message:'an agreed draw',white:0.5,black:0.5};
	self.message({type:'acceptdraw',isactive:isactive,inactive:inactive,username:username},{action:'stop'},{action:'stop'});
	self.message({type:'gameover',isactive:isactive,inactive:inactive,gameover:self.result.message},{action:'stop'},{action:'stop'});
	self.finish();

	return true;
};

//Opponent declines draw
kriegspiel.prototype.declinedraw = function(username){
	var self = this;
	if(!self.okplay || !self.drawoffered || self.drawoffered===username) return false;
	var isactive = self.white.username===username?'white':'black';
	var inactive = self.black.username===username?'white':'black';
	self.drawoffered = false;
	self.message({type:'declinedraw',isactive:isactive,inactive:inactive,username:username},{},{});

	return true;
};


//Player Resignation
kriegspiel.prototype.resign = function(username){
	var self = this;
	if(!self.okplay) return false;
	var isactive = self.white.username===username?'white':'black';
	var inactive = self.black.username===username?'white':'black';
	self.drawoffered = false;
	self.result = {type:'resigned',message:isactive+'_resigned',white:(isactive==='white'?0:1),black:(inactive==='white'?0:1)};
	self.message({type:'gameover',isactive:isactive,inactive:inactive,username:username,template:"resigned"},{action:'stop'},{action:'stop'});
	self.finish();

	return true; 	
};