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
//  , sub = redis.createClient()
  , db = require('./lib/db')
  , security = require('./lib/security')
  , spiel = require('./lib/spiel');

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
	app.use(express.session({secret:"hccm@nag3R",store:new redstore,cookie:{maxAge:4E9}}));  
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
		var newaccount=req.body.newaccount;
		var username=req.body.username;
		var password1=req.body.password1;
		if (newaccount==='on') {
			//New account setup
			security.addUser(req,res,function(isValid){
				res.redirect('/join?message=logincreated');
			});
		} else if (username && password1) {
			//login
			security.loginUser(req,res,function(isValid){
				if(isValid) {
					res.redirect('/join?message=login');
				} else {
					res.redirect('/join?error=badlogin');
				}
			});
		} else {
			//Missing username or password
			res.redirect('/join/?error=missinglogin');
			return false;
		}
	}
});

app.get('/games/?',function(req,res){

});


app.get('/games/:gameid',security.authenticateUser,function(req,res){
	res.sendfile('public/game.html');
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

app.get('/logout',function(req,res){
	req.session.destroy(function(){res.redirect('/join')});
});

var newGame = function(req,res) {
  var gameid = Math.floor(Math.random()*100000).toString(16);
  res.redirect('/games/'+gameid);
};

var joinGame = function(req,res,gameid) {
  res.redirect('/games/'+gameid);
};

//-------------------------------------------
//Express
var server = http.createServer(app).listen(app.get('port'), function(){
  console.log('KRIEGSPIEL :: server listening on port ' + app.get('port'));
});

//-------------------------------------------
//WebSockets:
var io = require('socket.io').listen(server);
io.sockets.on('connection', function (socket) {
	socket.on('join', function (data) {
		socket.set('username',data.username);
		socket.get('gameid',function(err,name){
			console.log(err,name);
		});
		spiel.join(data.gameid, socket);
	});
	socket.on('move', function (data) {
		spiel.move(data.gameid, data.source, data.target)		
	});
});