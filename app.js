/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*******************************************/

var express = require('express')
  , http = require('http')
  , path = require('path')
  , redis = require('redis')
  , redstore = require('connect-redis')(express)
  , sessionstore = new redstore()
  , secrets = require('./secrets')
  , db = require('./lib/db')
  , security = require('./lib/security')
  , spiel = require('./lib/spiel')
  , cookies = require('express/node_modules/cookie')
  , connectutils = require('express/node_modules/connect/lib/utils');
  

var app = express();


app.configure(function() {
	// all environments
	app.set('port', process.env.PORT || 3000);
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

var newGame = function(req,res) {
  var gameid = Math.floor(Math.random()*100000).toString(16);
  res.redirect('/games/'+gameid);
};

var joinGame = function(req,res,gameid) {
  res.redirect('/games/'+gameid);
};

//-------------------------------------------
//Routes
app.get('/', function(req,res){
  res.sendfile('public/index.html');
});

app.get('/join/?', function(req,res){
  res.sendfile('public/join.html');
});

app.post('/join/?', function(req,res) {
	
	if(req.session && req.session.username) {
		//Has a username
		var joingameid=req.body.joingameid;
		var startgame=req.body.startgame;
		if (startgame && startgame.length) {
			newGame(req,res);
		} else if (joingameid && joingameid.length) {
			joinGame(req,res,joingameid);
		} else {
			res.redirect('/join/');
		}
	} else {
		//No session or username
		security.loginOrCreateUser(req,res);
	}
});


app.get('/games/?',function(req,res){
	var state = spiel.state(req.query.state||'active');
	db.findGamesByFilter(
		{state:state},
		function(rec){ 
			var out = {
				gameid:rec.gameid,
				white:rec.whiteusername,
				black:rec.blackusername,
				state:spiel.state(rec.state),
				turn:rec.turn,
				moves:rec.history.length/2
			};
			
			if(req.query.all) out.messages = rec.messages;
			return out;
		},
		function(err,records){
			res.send(200,records);
		}
	);
});

app.get('/usernames/:username',function(req,res){
	security.existingUser(req.params.username,function(isExists){
		res.send(200,isExists);
	});
});

app.get('/session',function(req,res){
	if(req.session && req.session.username) {
		var data = {};
		for(var s in req.session) { if(req.session.hasOwnProperty(s) && s!=='cookie') data[s] = req.session[s]; }
		res.send(200,data);
	} else {
		res.send(204,false);
	}
});

//Authenticated Routes
app.get('/start/?', security.authenticateUser, newGame);

app.get('/games/:gameid',security.authenticateUser,function(req,res){
	res.sendfile('public/game.html');
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
					spiel.move(data.gameid, data.source, data.target, data.scratch, {session:session, socket:socket});		
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

				/*
				socket.on('disconnect', function() {
					spiel.disconnect(username);
				});
				*/
			});			
		}
	});
});

