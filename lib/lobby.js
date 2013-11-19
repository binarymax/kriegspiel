var cache   = require('./cache')
  , sockets = []
  , online  = [];

var Lobby = module.exports = {};

//Load the online lobby data from cache
var setup = Lobby.setup = function(){
	//Get who's online
	cache.get('online',-1,function(records,err){
		online = records||[];
		for(var key in online) {
			if (online.hasOwnProperty(key) && key.indexOf('_timeout')>-1 && online[key]) {
				var username = key.substr(0,key.indexOf('_timeout'));
				delete online[username];
			}
		}
	});
};

//Chat between two spielers in the lobby
var chat = Lobby.chat = function(data) {
	var reTag1  = /\</g, reTag2 = /\>/g;
	var from = data.from && online[data.from] && sockets[data.from];
	var to   = data.to && online[data.to] && sockets[data.to];
	var key  =(data.from < data.to) ? (data.from+':'+data.to) : (data.to+':'+data.from);

	if (from && to) {
		//Strip HTML tags:
		data.text = data.text.replace(reTag1,'&lt;').replace(reTag2,'&gt;');
		data.sent = Date.now();

		from.emit('lobbychat',data);
		to.emit('lobbychat',data);
		cache.add(key,data);
	}	
	
};

//Get list of chats between two spielers in the lobby
var chats = Lobby.chats = function(data) {
	var from = data.from && online[data.from] && sockets[data.from];
	var key  =(data.from < data.to) ? (data.from+':'+data.to) : (data.to+':'+data.from);
	if (data.from && data.to) {
		var head = data.head||0;
		cache.range(key,head,10,function(err,reply){
			if(!err) from.emit('lobbychats',reply);
		});
	}
};

//One Spieler Challenges Another
var challenge = Lobby.challenge = function(data){
	var challenger = data.challenger && online[data.challenger] && sockets[data.challenger];
	var challenged = data.challenged && online[data.challenged] && sockets[data.challenged];

	data.url = '/challenges/' + Math.floor(Math.random()*100000).toString(16);
	
	if(data.challenged!==data.challenger && challenger && challenged) {
		challenger.emit("lobbychallenge",data);
		challenged.emit("lobbychallenge",data);
	}
};

//Gets a list of who's online
var isonline = Lobby.isonline = function(username) {
	if (username) {
		return online[username];
	} else {
		var data = [];
		for(var key in online) {
			if (online.hasOwnProperty(key) && key.indexOf('_timeout')===-1 && online[key]) {
				data.push(key);
			}
		}
		return data;
	}
};

//Spieler connects to the lobby
var connect = Lobby.connect = function(socket,username) {
	goOnline(socket,username);
	
	socket.on('lobbychat', chat);

	socket.on('lobbychats', chats);

	socket.on('challenge', challenge);

	socket.on('acceptchallenge', function(data){
		//Accept a challenge in the 'lobby'
		socket.broadcast.emit("lobbychallengeaccept",data);
	});

	socket.on('declinechallenge', function(data){
		//Decline a challenge in the 'lobby'
		socket.broadcast.emit("lobbychallengedecline",data);
	});

	socket.on('lobbyjoin', function(data) {
		//Enter a room
		goOnline(socket,username,data.room)
	});
	
};

//Spieler disconnects from the lobby
var disconnect = Lobby.disconnect = function(socket,username) {
	goOffline(socket,username);
};

//When a spieler goes Online
var goOnline = function(socket,username,room) {
	clearTimeout(online[username + '_timeout']);
	delete online[username + '_timeout'];
	online[username] = room||'lobby';
	sockets[username] = socket;
	socket.broadcast.emit("lobbyadd",{ username:username });
	cache.set('online',online);
};

//When a spieler goes Offline
var goOffline = function(socket,username) {
	online[username + '_timeout'] = setTimeout(function() { 
		delete online[username];
		delete sockets[username];
		socket.broadcast.emit("lobbyremove",{ username:username });
		cache.set('online',online);
	},1000);
};