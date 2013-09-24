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
  , variants = require('./lib/variants').load();
  

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

//-------------------------------------------
//Routes
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

//Gets a list of games
app.get('/games/?',function(req,res) {

	var state  = spiel.state(req.query.state||'active');

	var all = req.query.all?true:false;

	//Sends the result
	var send = function(err,records){ if(err) res.send(500,err); else res.send(200,records); };

	var format = function(rec){ 
		//Formats a game record for listing (hide secret opponent stuff)
		var fin = (typeof rec.result === 'object' && rec.result.type) ? (rec.result.white + '-' + rec.result.white) : "";
		var out = {gameid:rec.gameid,white:rec.whiteusername,black:rec.blackusername,state:spiel.state(rec.state),turn:rec.turn,moves:rec.history.length/2,result:fin};
		if (all) out.messages = rec.messages;
		return out;
	};
		
	if (state==='inactive') {
		//Get all the inactive games
		db.findGamesByFilter({state:state},format,send);
		
	} else if (req && req.session && req.session.username) {
		//Get the user's games (both as black and white)
		var username = req.session.username;
		var output = [];
		var count = 0;
		
		//Merges the two color results
		var merge = function(err,records) { output = output.concat(records); if (++count===2) send(null,output); }
		
		//Get the user's games as white
		db.findGamesByFilter({state:state,whiteusername:username},format,merge);
		
		//Get the user's games as black
		db.findGamesByFilter({state:state,blackusername:username},format,merge);

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

//Starts up a new game
app.get('/start/?', security.authenticateUser, newGame);

//Gets a game html file
app.get('/games/:gameid',security.authenticateUser,function(req,res){
	var gameid = req.params.gameid;
	if(okId(gameid)) {
		spiel.find(gameid,function(game){
			if(game.state === spiel.state('finished')) {
				res.sendfile('public/replay.html');
			} else {
				res.sendfile('public/game.html');
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
			res.send(game.serialize());
		});
	} else {
		badId(res);
	}
});


app.get('/logout',security.authenticateUser,function(req,res){
	req.session.destroy(function(){res.redirect('/join')});
});

//-------------------------------------------
//Express
var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('KRIEGSPIEL :: server listening on port ' + app.get('port'));
});

//-------------------------------------------
//WebSockets:

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
					spiel.join(data.gameid, {session:session, socket:socket});
				});
				
				socket.on('move', function (data) {
					spiel.move(data.gameid, data.source, data.target, data.scratch, data.promotion, {session:session, socket:socket});		
				});
				
				socket.on('pawncaptures', function (data) {
					spiel.pawncaptures(data.gameid, {session:session, socket:socket});		
				});

				socket.on('occupies', function (data) {
					spiel.occupies(data.gameid, data.target, {session:session, socket:socket});		
				});

				socket.on('resign', function (data) {
					spiel.resign(data.gameid, {session:session, socket:socket});		
				});

				socket.on('offerdraw', function (data) {
					spiel.offerdraw(data.gameid, {session:session, socket:socket});		
				});

				socket.on('acceptdraw', function (data) {
					spiel.acceptdraw(data.gameid, {session:session, socket:socket});		
				});

				socket.on('declinedraw', function (data) {
					spiel.declinedraw(data.gameid, {session:session, socket:socket});		
				});

			});
		}
	});
});