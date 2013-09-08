var chess = require('chess.js')
  , db = require('./db')

var variants = {lovenheim:1,classic:2,rochester:3};
var states = {active:1,inactive:0,finished:-1};
var colors = {'w':'white','b':'black'};
var colorx = {'white':'black','black':'white'};
var spiels = {};

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
	this.white = { board:new chess.Chess(),scratch:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' };
	this.black = { board:new chess.Chess(),scratch:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' };
	
	//Remove all opposing pieces on own boards.  These boards are used to test impossible moves.
	this.clear('white');
	this.clear('black');
};

//Clears all opposing pieces from a player's board.
kriegspiel.prototype.clear = function(color) {
	var self = this;
	var player = self[color];
	var board = player.board;
	var oppos = colorx[color].charAt(0);
	var square;
	for(var f=0;f<8;f++) {
		for(var r=0;r<8;r++) {
			square = board.get(files[f] + ranks[r]);
			if(square && square.color===oppos && square.type!=='k') board.remove(square);
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

kriegspiel.prototype.save = function(callback) {
	db.saveGame(this.serialize(),callback||function(){});
};

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

kriegspiel.prototype.start = function(color) {
	var self = this;
	var player = self[color];
	var isactive = color;
	var inactive = color==='white'?'black':'white';
	if (player.socket && player.socket.emit) {
		player.socket.emit('kriegspiel', { color: color, game:self.serialize(color) });
		var welcome = player.username + " has joined as " + color + "!";
		self.message({type:'welcome',isactive:isactive,inactive:inactive,message:welcome},{},{});
	}
};

kriegspiel.prototype.impossible = function(color,move) {
	var self = this;
	var player = self[color];
	var board = player.board;
	var temp  = new chess.Chess();
	var fen   = board.fen();
	temp.load(fen);
	return temp.move(move)===null?true:false;
};

kriegspiel.prototype.position = function(color,move) {
	//Hack the FEN to setup a blank opposition board, that can test for impossible moves.
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
	board.move(move);

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

kriegspiel.prototype.check = function() {
	if (this.board.in_check()) {
		//TODO: rank|file|long_diagonal|short_diagonal|knight
		return 'check'
	}
	return null;
};

kriegspiel.prototype.gameover = function() {
	var board = this.board;
	if (board.in_checkmate()) return 'checkmate';
	if (board.in_stalemate()) return 'stalemate';
	if (board.in_draw()) return 'draw';
	if (board.in_threefold_repetition()) return 'draw_by_repetition';
	return null;
};

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
		//Move was successful, set the positions and send the appropriate announcements
		self.position(isactive,move);
		if (result.captured && result.captured.length) {
			var message = isactive + " has moved and captured on " + target;
			self.message({type:'capture',isactive:isactive,inactive:inactive,message:message,square:target},{action:'stop'},{action:'start'});
		} else {
			var message = isactive + " has moved";
			self.message({type:'move',isactive:isactive,inactive:inactive,message:message,square:target},{action:'stop'},{action:'start'});
		}
		var gameover = self.gameover();
		if (gameover!==null) {
			var message = inactive + " is in " + gameover;
			self.message({type:'gameover',isactive:isactive,inactive:inactive,message:message},{action:'stop'},{action:'stop'});
		}
	}
};

kriegspiel.prototype.pawncaptures = function() {
	var moves = this.board.moves();
	var possible = 0;
	var turn = this.board.turn();
	var isactive = colors[turn];
	var inactive = turn==='w'?colors['b']:colors['w'];
	var player = this[isactive];
	var opponent = this[inactive];
	for(var i=0,l=moves.length;i<l;i++) {
		if(moves[i].piece === 'p' && moves[i].rank !== 'changed') possible++;
	}
	if(possible>0) {
		player.socket.emit('captures', { type: 'yes', who: isactive });
		opponent.socket.emit('captures', { type: 'yes', who: isactive });		
	} else {
	}
};



/*


API
Constructor: Chess([ fen ])

The Chess() constructor takes a optional parameter which specifies the board configuration in Forsyth-Edwards Notation.

// board defaults to the starting position when called with no parameters
var chess = new Chess();

// pass in a FEN string to load a particular position
var chess = new Chess('r1k4r/p2nb1p1/2b4p/1p1n1p2/2PP4/3Q1NB1/1P3PPP/R5K1 b - c3 0 19');

.ascii()

Returns a string containing an ASCII diagram of the current position.

var chess = new Chess();

// make some moves
chess.move('e4');
chess.move('e5');
chess.move('f4');

chess.ascii();
// -> '   +------------------------+
//      8 | r  n  b  q  k  b  n  r |
//      7 | p  p  p  p  .  p  p  p |
//      6 | .  .  .  .  .  .  .  . |
//      5 | .  .  .  .  p  .  .  . |
//      4 | .  .  .  .  P  P  .  . |
//      3 | .  .  .  .  .  .  .  . |
//      2 | P  P  P  P  .  .  P  P |
//      1 | R  N  B  Q  K  B  N  R |
//        +------------------------+
//          a  b  c  d  e  f  g  h'

.clear()

Clears the board.

chess.clear();
chess.fen();
// -> '8/8/8/8/8/8/8/8 w - - 0 1' <- empty board

.fen()

Returns the FEN string for the current position.

var chess = new Chess();

// make some moves
chess.move('e4');
chess.move('e5');
chess.move('f4');

chess.fen();
// -> 'rnbqkbnr/pppp1ppp/8/4p3/4PP2/8/PPPP2PP/RNBQKBNR b KQkq f3 0 2'

.game_over()

Returns true or false if the game has ended via checkmate, stalemate, or draw.

var chess = new Chess();
chess.game_over();
// -> false

chess.load('4k3/4P3/4K3/8/8/8/8/8 b - - 0 78');
chess.game_over();
// -> true (stalemate)

chess.load('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
chess.game_over();
// -> true (checkmate)

.get(square)

Returns the piece on the square:

chess.clear();
chess.put({ type: chess.PAWN, color: chess.BLACK }, 'a5') // put a black pawn on a5

chess.get('a5');
// -> { type: 'p', color: 'b' },
chess.get('a6');
// -> null

.history([ options ])

Returns a list containing the moves of the current game. Options is an optional parameter which may contain a 'verbose' flag. See .moves() for a description of the verbose move fields.

var chess = new Chess();
chess.move('e4');
chess.move('e5');
chess.move('f4');
chess.move('exf4');

chess.history();
// -> ['e4', 'e5', 'f4', 'exf4']

chess.history({ verbose: true });
// -> [{ color: 'w', from: 'e2', to: 'e4', flags: 'b', piece: 'p', san: 'e4' },
//     { color: 'b', from: 'e7', to: 'e5', flags: 'b', piece: 'p', san: 'e5' },
//     { color: 'w', from: 'f2', to: 'f4', flags: 'b', piece: 'p', san: 'f4' },
//     { color: 'b', from: 'e5', to: 'f4', flags: 'c', piece: 'p', captured: 'p', san: 'exf4' }]

.in_check()

Returns true or false if the side to move is in check.

var chess = new Chess('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
chess.in_check();
// -> true

.in_checkmate()

Returns true or false if the side to move has been checkmated.

var chess = new Chess('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
chess.in_checkmate();
// -> true

.in_draw()

Returns true or false if the game is drawn (50-move rule or insufficient material).

var chess = new Chess('4k3/4P3/4K3/8/8/8/8/8 b - - 0 78');
chess.in_draw();
// -> true

.in_stalemate()

Returns true or false if the side to move has been stalemated.

var chess = new Chess('4k3/4P3/4K3/8/8/8/8/8 b - - 0 78');
chess.in_stalemate();
// -> true

.in_threefold_repetition()

Returns true or false if the current board position has occurred three or more times.

var chess = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
// -> true
// rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq occurs 1st time
chess.in_threefold_repetition();
// -> false

chess.move('Nf3'); chess.move('Nf6') chess.move('Ng1'); chess.move('Ng8');
// rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq occurs 2nd time
chess.in_threefold_repetition();
// -> false

chess.move('Nf3'); chess.move('Nf6') chess.move('Ng1'); chess.move('Ng8');
// rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq occurs 3rd time
chess.in_threefold_repetition();
// -> true

.header()

Allows header information to be added to PGN output. Any number of key/value pairs can be passed to .header().

chess.header('White', 'Robert James Fischer');
chess.header('Black', 'Mikhail Tal');

// or

chess.header('White', 'Morphy', 'Black', 'Anderssen', 'Date', '1858-??-??');

.insufficient_material()

Returns true if the game is drawn due to insufficient material (K vs. K, K vs. KB, or K vs. KN); otherwise false.

var chess = new Chess('k7/8/n7/8/8/8/8/7K b - - 0 1');
chess.insufficient_material()
// -> true

.load(fen)

The board is cleared and the FEN string is loaded. Returns true if position was successfully loaded, otherwise false.

var chess = new Chess();
chess.load('4r3/8/2p2PPk/1p6/pP2p1R1/P1B5/2P2K2/3r4 w - - 1 45');
// -> true

chess.load('4r3/8/X12XPk/1p6/pP2p1R1/P1B5/2P2K2/3r4 w - - 1 45');
// -> false, bad piece X

.load_pgn(pgn, [ options ])

Load the moves of a game stored in Portable Game Notation. Options is a optional parameter that contains a 'newline_char' denoting the line delimiter (the default delimiter is '\r?\n', optional carriage return with newline). Returns true if the PGN was parsed successfully, otherwise false.

var chess = new Chess();
pgn = ['[Event "Casual Game"]',
       '[Site "Berlin GER"]',
       '[Date "1852.??.??"]',
       '[EventDate "?"]',
       '[Round "?"]',
       '[Result "1-0"]',
       '[White "Adolf Anderssen"]',
       '[Black "Jean Dufresne"]',
       '[ECO "C52"]',
       '[WhiteElo "?"]',
       '[BlackElo "?"]',
       '[PlyCount "47"]',
       '',
       '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.b4 Bxb4 5.c3 Ba5 6.d4 exd4 7.O-O',
       'd3 8.Qb3 Qf6 9.e5 Qg6 10.Re1 Nge7 11.Ba3 b5 12.Qxb5 Rb8 13.Qa4',
       'Bb6 14.Nbd2 Bb7 15.Ne4 Qf5 16.Bxd3 Qh5 17.Nf6+ gxf6 18.exf6',
       'Rg8 19.Rad1 Qxf3 20.Rxe7+ Nxe7 21.Qxd7+ Kxd7 22.Bf5+ Ke8',
       '23.Bd7+ Kf8 24.Bxe7# 1-0'];

chess.load_pgn(pgn.join('\n'));
// -> true

chess.fen()
// -> 1r3kr1/pbpBBp1p/1b3P2/8/8/2P2q2/P4PPP/3R2K1 b - - 0 24

chess.ascii()
// -> '  +------------------------+
//     8 | .  r  .  .  .  k  r  . |
//     7 | p  b  p  B  B  p  .  p |
//     6 | .  b  .  .  .  P  .  . |
//     5 | .  .  .  .  .  .  .  . |
//     4 | .  .  .  .  .  .  .  . |
//     3 | .  .  P  .  .  q  .  . |
//     2 | P  .  .  .  .  P  P  P |
//     1 | .  .  .  R  .  .  K  . |
//       +------------------------+
//         a  b  c  d  e  f  g  h'

.move(move)

Attempts to make a move on the board, returning a move object if the move was legal, otherwise null. The .move function can be called two ways, by passing a string in Standard Algebraic Notation (SAN):

var chess = new Chess();

chess.move('e4')
// -> { color: 'w', from: 'e2', to: 'e4', flags: 'b', piece: 'p', san: 'e2' }

chess.move('nf6') // SAN is case sensitive!!
// -> null

chess.move('Nf6')
// -> { color: 'b', from: 'g8', to: 'f6', flags: 'n', piece: 'n', san: 'Nf6' }

Or by passing .move() a move object (only the 'to', 'from', and when necessary 'promotion', fields are needed):

var chess = new Chess();

chess.move({ from: 'g2', to: 'g3' });
// -> { color: 'w', from: 'g2', to: 'g3', flags: 'n', piece: 'p', san: 'g3' }

.moves([ options ])

Returns a list of legals moves from the current position. The function takes an optional parameter which controls the single-square move generation and verbosity.

var chess = new Chess();
chess.moves();
// -> ['a3', 'a4', 'b3', 'b4', 'c3', 'c4', 'd3', 'd4', 'e3', 'e4',
//     'f3', 'f4', 'g3', 'g4', 'h3', 'h4', 'Na3', 'Nc3', 'Nf3', 'Nh3']

chess.moves({square: 'e2'});
// -> ['e3', 'e4']

chess.moves({square: 'e9'}); // invalid square
// -> []

chess.moves({ verbose: true });
// -> [{ color: 'w', from: 'a2', to: 'a3',
//       flags: 'n', piece: 'p', san 'a3'
//       # a captured: key is included when the move is a capture
//       # a promotion: key is included when the move is a promotion
//     },
//     ...
//     ]

The piece, captured, and promotion fields contain the lowercase representation of the applicable piece.

The flags field in verbose mode may contain one or more of the following values:

    'n' - a non-capture
    'b' - a pawn push of two squares
    'e' - an en passant capture
    'c' - a standard capture
    'p' - a promotion
    'k' - kingside castling
    'q' - queenside castling

A flag of 'pc' would mean that a pawn captured a piece on the 8th rank and promoted.
.pgn([ options ])

Returns the game in PGN format. Options is an optional parameter which may include max width and/or a newline character settings.

var chess = new Chess();
chess.header('White', 'Plunky', 'Black', 'Plinkie');
chess.move('e4');
chess.move('e5');
chess.move('Nc3');
chess.move('Nc6');

chess.pgn({ max_width: 5, newline_char: '<br />' });
// -> '[White "Plunky"]<br />[Black "Plinkie"]<br /><br />1. e4 e5<br />2. Nc3 Nc6'

.put(piece, square)

Place a piece on square where piece is an object with the form { type: ..., color: ... }. Returns true if piece was successfully placed, otherwise false.

chess.clear();

chess.put({ type: chess.PAWN, color: chess.BLACK }, 'a5') // put a black pawn on a5
// -> true
chess.put({ type: 'k', color: 'w' }, 'h1') // shorthand
// -> true

chess.fen();
// -> '8/8/8/p7/8/8/8/7K w - - 0 0'

.remove(square)

Remove and return the piece on square.

chess.clear();
chess.put({ type: chess.PAWN, color: chess.BLACK }, 'a5') // put a black pawn on a5
chess.put({ type: chess.KING, color: chess.WHITE }, 'h1') // put a white king on h1

chess.remove('a5');
// -> { type: 'p', color: 'b' },
chess.remove('h1');
// -> { type: 'k', color: 'w' },
chess.remove('e1');
// -> null

.reset()

Reset the board to the initial starting position.
.square_color(square)

Returns the color of the square ('light' or 'dark').

var chess = Chess();
chess.square_color('h1')
// -> 'light'
chess.square_color('a7')
// -> 'dark'
chess.square_color('bogus square')
// -> null

.turn()

Returns the current side to move.

chess.load('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')
chess.turn()
// -> 'b'

.undo()

Takeback the last half-move, returning a move object if successful, otherwise null.

var chess = new Chess();

chess.fen();
// -> 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
chess.move('e4');
chess.fen();
// -> 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

chess.undo();
// -> { color: 'w', from: 'e2', to: 'e4', flags: 'b', piece: 'p', san: 'e4' }
chess.fen();
// -> 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
chess.undo();
// -> null

.validate_fen(fen):

Returns a validation object specifying validity or the errors found within the FEN string.

chess.validate_fen('2n1r3/p1k2pp1/B1p3b1/P7/5bP1/2N1B3/1P2KP2/2R5 b - - 4 25');
// -> { valid: true, error_number: 0, error: 'No errors.' }

chess.validate_fen('4r3/8/X12XPk/1p6/pP2p1R1/P1B5/2P2K2/3r4 w - - 1 45');
// -> { valid: false, error_number: 9,
//     error: '1st field (piece positions) is invalid [invalid piece].' }

CONTRIBUTORS

Special thanks to the following developers for their patches and contributions (alphabetically):

    Steve Bragg
    E. Azer Koçulu
    Falco Nogatz
    jdponomarev
    David Moises Paz Reyes
    Raminder Singh
    Stiff
    Seb Vincent
    Linmiao Xu

Musical support provided by:

    The Grateful Dead
    Umphrey's McGee

BUGS

    The en passant square and castling flags aren't adjusted when using the put/remove functions (workaround: use .load() instead)

TODO

    Add AI (basic alpha-beta search w/ primitive position evaluation). The AI should probably be internal to the underlying Chess() object to take full advantage of 0x88 move generation.
    Add jQuery chessboard widget. (see widget branch for prototype)
    Investigate the use of piece lists (this may shave a few cycles off generate_moves() and attacked())


*/