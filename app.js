/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*
* HTTP and WebSocket Router
*
*******************************************/

var express = require('express')
  , http = require('http')
  , path = require('path')
  , redis = require('redis')
  , redstore = require('connect-redis')(express)
  , sessionstore = new redstore()
  , cookies = require('express/node_modules/cookie')
  , connectutils = require('express/node_modules/connect/lib/utils')
  , secrets = require('./secrets')
  , db = require('./lib/db')
  , security = require('./lib/security')
  , spiel = require('./lib/spiel')
  , variants = require('./lib/variants').load()
  , cache = require('./lib/cache')
  , lobby = require('./lib/lobby');
  
var app = express();

app.configure(function() {
	// all environments
	app.set('port', process.env.PORT || 80);
	app.set('views', __dirname + '/views');
	app.set('view engine', 'jade');
	app.use(express.favicon());
	app.use(express.logger('dev'));
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({secret:secrets.redis,store:sessionstore,cookie:{maxAge:4E9}}));  
	app.use(express.methodOverride());
	app.use(app.router);
	app.use(express.static(path.join(__dirname, 'public')));

	//Setup rethinkdb connection
	db.setup();

	//Setup spieler lobby
	lobby.setup();
		
	// development only
	if ('development' == app.get('env')) {
	  app.use(express.errorHandler());
	}
});

var okId = function(id) {
	var reId = /^\w+$/i;
	return reId.test(id);
}

var badId = function(res) {
	res.redirect('/join?error=badid');
}

var newGame = function(req,res) {
  var gameid = Math.floor(Math.random()*100000).toString(16);
  res.redirect('/games/'+gameid);
};

var joinGame = function(req,res,gameid) {
  res.redirect('/games/'+gameid);
};

//Shortcut file sender
var file = function(filename) { return function(req,res){ res.sendfile(filename); }};


//Sends the result of a merge or db response
var sender = function(res) {
	return function(err,records){
		if(err) res.send(500,err); else res.send(200,records); 
	};
}

//Merges the two color results
var merger = function(total,res) {
	var output = [], count = 0;
	return function(err,records) {
		output = output.concat(records);
		if (++count===total) {
			sender(res)(null,output);
		} 
	};
}

//Formats a player record for listing
var formatspieler = function(rec) {  
	rec.rating = Math.floor(rec.rating); 
	rec.joined = (new Date(rec.joined||'10/10/2013')).toDateString().substr(3); 
	return rec; 
}

//Formats a game record for listing (hide secret opponent stuff)
var formatgame = function(rec) { 
	
	var fin = (typeof rec.result === 'object' && rec.result.type) ? (rec.result.white + '-' + rec.result.black) : "";

	var out = {
		gameid:rec.gameid,
		white:rec.whiteusername,
		black:rec.blackusername,
		state:spiel.state(rec.state),
		turn:rec.turn,
		moves:rec.moves,
		result:fin,
		rated:rec.rated?'Rated':'Unrated',
		startdate:rec.startdate,
		enddate:rec.enddate?rec.enddate.toDateString():''
	};

	if (rec.state===spiel.state('inactive')) { 
		out.player=out.white||out.black; 
		out.pcolor=out.white?'white':'black'; 
		out.ocolor=out.black?'white':'black';  
	}

	return out;
};

//-------------------------------------------
// Routes
app.get('/', file('public/index.html'));

app.get('/join/?', file('public/join.html'));

app.get('/about/?', file('public/about.html'));

app.get('/privacy/?', file('public/privacy.html'));

app.get('/robots.txt', file('public/robots.txt'));

app.get('/google70e3e038531249c6.html', file('public/google70e3e038531249c6.html'));

//Logs in or creates a new user
app.post('/join/?', function(req,res) {
	security.loginOrCreateUser(req,res);
});

//Forgot Password Flow
app.get('/forgot/:code/?', file('public/forgot.html'));

app.post('/forgot/:code/?', function(req,res){
	security.resetPassword(req,res);
});

app.post('/forgot/?', function(req,res) {
	security.forgotPassword(req,res,function(err,msg) {
		if(!err) res.sendfile('public/forgotsent.html');
		else res.redirect('/join?error='+err);
	});
});

//Starts a new Game:
app.post('/start/?', security.authenticateUser, function(req,res) {

	var username = req.session.username;
	var inactive = spiel.state('inactive');

	db.findGamesByPlayerAndState(username,inactive,formatgame,function(err,records) {
		if(!err && records.length) {
			//Inactive game found
			res.redirect('/games/'+records[0].gameid);
		} else {
			//No inactive games found - create a new one!	
			var gameid = Math.floor(Math.random()*100000).toString(16);
			var variant = 'lovenheim'; //req.body.variant;
			var color   = req.body.startcolor;
			var player  = req.session.username;
			var rated   = true; //req.body.ratedgame === 'rated' ? true : false;
			if (color === 'random') color = Math.floor(Math.random()*100)%2?'white':'black';
			spiel.add(gameid,variant,color,player,rated,function(game){
				res.redirect('/games/'+gameid);
			});
		}			
	});
});


app.get('/challenges/:gameid', security.authenticateUser, function(req,res) {
	var gameid = req.params.gameid;
	var username = req.session.username;
	if (okId(gameid)) {
		spiel.exists(gameid,function(dbgameid){
			if(gameid) {
				res.redirect('/games/'+gameid);
			} else {
				var variant = 'lovenheim';
				var color   = Math.floor(Math.random()*100)%2?'white':'black';
				var player  = req.session.username;
				var rated   = true;
				spiel.add(gameid,variant,color,player,rated,function(game){
					res.redirect('/games/'+gameid);
				});
			}
		});
	} else {
		badId(res);
	}
});



//Gets a list of games
app.get('/games/?', security.authenticateUser, function(req,res) {
 
	var state  = spiel.state(req.query.state||'active');
		
	if (state===spiel.state('inactive')) {
		//Get all the inactive games
		db.findGamesByFilter({state:state},formatgame,function(err,results){
			var send = sender(res);
			if (err) {
				send(err,results);
			} else {
				var outgoing = [];
				for(var i=0,l=results.length;i<l;i++) {
					if (lobby.isonline(results[i].player)) {
						//only add online players to the waiting list!
						outgoing.push(results[i]);
					}
				}
				send(err,outgoing);
			}
		});
		
	} else if (req && req.session && req.session.username) {
		//Get the user's games (both as black and white)
		var username = req.session.username;		
		db.findGamesByPlayerAndState(username,state,formatgame,sender(res));		
		
	} else {
		//No session, No data for you!
		req.send(204,false);
	}
	
});

//Checks the database for an existing username
app.get('/usernames/:username',function(req,res){
	security.existingUser(req.params.username,function(isExists){
		res.send(200,isExists);
	});
});

//Gets the user's session data
app.get('/session',function(req,res){
	if(req.session && req.session.username) {
		var data = {};
		//Send user session information, but not cookie stuff
		for(var s in req.session) { if(req.session.hasOwnProperty(s) && s!=='cookie') data[s] = req.session[s]; }
		res.send(200,data);

	} else {
		//No session, No data for you!
		res.send(204,false);
	}
});

//Gets all the users that are online
app.get('/online',function(req,res){
	res.send(200,{online:lobby.isonline()});
});

//Gets a game html file
app.get('/games/:gameid',security.authenticateUser,function(req,res){
	var gameid = req.params.gameid;
	var username = req.session.username;
	if (okId(gameid)) {
		spiel.find(gameid,function(game){
			if(game.state === spiel.state('finished')) {
				res.redirect('/replays/'+gameid);
			} else if (game.white.username && game.white.username!==username && game.black.username && game.black.username!==username) {
				res.redirect('/join?error=gameactive');
			} else {
				res.sendfile('public/game.html');
			}
		});
	} else {
		badId(res);
	}
});

//Gets game replays
app.get('/replays/?',function(req,res){

	if (req.query.username) {
		//Only get finished games for a specific username
		var username = req.query.username;
		var finished = spiel.state('finished');

		db.findGamesByPlayerAndState(username,finished,formatgame,sender(res));

	} else { 

		//Gets all the finished games:
		db.findGamesByFilter({state:spiel.state('finished'),rated:true},formatgame,sender(res));
	}
	
});

//Gets all game replays
app.get('/spielers/:username',file('public/spieler.html'));

//Gets player info
app.get('/spielers/?',function(req,res){
	var filter = {};
	if(req.query.username) filter.username=req.query.username;
	db.findUsersByFilter(filter,formatspieler,sender(res));
});

//Gets a game replay
app.get('/replays/:gameid',function(req,res){
	var gameid = req.params.gameid;
	if (okId(gameid)) {
		spiel.find(gameid,function(game){
			console.log(game.state,spiel.state('finished'));
			if(game.state === spiel.state('finished')) {
				res.sendfile('public/replay.html');
			} else if (game.white.username || game.black.username) {
				res.redirect('/join?error=gameactive');
			} else {
				res.redirect('/join?error=gamenotfound');
			}
		});
	} else {
		badId(res);
	}
});

//Gets game data for a finished game
app.get('/data/:gameid',security.authenticateUser,function(req,res){
	var gameid = req.params.gameid;
	if(okId(gameid)) {
		spiel.find(gameid,function(game){
			if (game.state===spiel.state('finished')) {
				var data = game.serialize();
				data.orientation = (req.session.username === data.blackusername) ? 'black' : 'white';
				res.send(data);
			} else {
				//No peeking!
				res.send(403);
			}
		});
	} else {
		badId(res);
	}
});

//Logs out the user
app.get('/logout',security.authenticateUser,function(req,res){
	req.session.destroy(function(){res.redirect('/join')});
});

//-------------------------------------------
// Express
var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('KRIEGSPIEL :: server listening on port ' + app.get('port'));
});


//-------------------------------------------
// WebSockets:

//Gets the connect-redis signed session cookie for the socket
var parseSessionCookie = function(cookie, callback) {
  var parsed = cookies.parse(cookie);
  var signed = connectutils.parseSignedCookies(parsed,secrets.redis);
  if (signed && signed['connect.sid']) { 
	sessionstore.get(signed['connect.sid'],callback);
  } else {
  	callback(null,null);
  }
}

var io = require('socket.io').listen(server);
io.set('log level', 1); //not so loud!
io.configure(function(){
	io.set('authorization',function(handshake,callback){
		parseSessionCookie(handshake.headers.cookie, function(err,session) {
			if (!err && session && session.username) {
				callback(null,true);
			} else if (!err) {
				callback(null,false);
			} else {
				callback(err,false);
			}
		});
	});
});

io.sockets.on('connection', function (socket) {
	parseSessionCookie(socket.handshake.headers.cookie, function(err,session) {
		if(!err && session && session.username) {
			socket.set('username',session.username,function(){
								
				socket.on('join', function (data) {
					if(data.gameid) spiel.join(data.gameid, {session:session, socket:socket}, function(game) {
						if (game.state===spiel.state('inactive')) {
							var out = { gameid:game.gameid,white:game.white.username,black:game.black.username,state:'inactive',rated:game.rated?'Rated':'Unrated' };
							out.player=out.white||out.black; 
							out.pcolor=out.white?'white':'black'; 
							out.ocolor=out.black?'white':'black';
							socket.broadcast.emit("joinadd",out);
						} else {
							socket.broadcast.emit("joinremove",{ gameid:game.gameid });
						}
					});					
				});
				
				socket.on('move', function (data) {
					if(data.gameid) spiel.move(data.gameid, data.source, data.target, data.scratch, data.promotion, {session:session, socket:socket});		
				});
				
				socket.on('chat', function (data) {
					if(data.gameid) spiel.chat(data.gameid, data.text, {session:session, socket:socket});		
				});

				socket.on('pawncaptures', function (data) {
					if(data.gameid) spiel.pawncaptures(data.gameid, {session:session, socket:socket});		
				});

				socket.on('occupies', function (data) {
					if(data.gameid) spiel.occupies(data.gameid, data.target, {session:session, socket:socket});		
				});

				socket.on('resign', function (data) {
					if(data.gameid) spiel.resign(data.gameid, {session:session, socket:socket});		
				});

				socket.on('offerdraw', function (data) {
					if(data.gameid) spiel.offerdraw(data.gameid, {session:session, socket:socket});		
				});

				socket.on('acceptdraw', function (data) {
					if(data.gameid) spiel.acceptdraw(data.gameid, {session:session, socket:socket});		
				});

				socket.on('declinedraw', function (data) {
					if(data.gameid) spiel.declinedraw(data.gameid, {session:session, socket:socket});		
				});
				
				socket.on('ping', function (data) {
					if(data.gameid) spiel.ping(data.gameid, {session:session, socket:socket});		
				});

				socket.on('disconnect', function(data){
					lobby.disconnect(socket,session.username);
				});

				lobby.connect(socket,session.username);

			});
		}
	});
});