/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*
* Player statistics
*
*******************************************/

var db = require('./db');

var start = 1400;
var kfact = 30;
var users = {};

var Spieler = module.exports = {};
 
var find = Spieler.find = function(username,callback){

	if(users[username]) {
		//Game is in memory
		callback(users[username]);
	} else {
		//Game is not in memory, find in DB
		db.findUserByUsername(username,function(err,record){
			//Create the game
			var player = users[username] = new user(username);
			if(!err && record) player.deserialize(record);
			callback(player);
		});
	}

}

var leaders = Spieler.leaders = function(type){

	var results = [];

	switch(type) {
		case 'active':break;
		case 'rated':break;
		case 'won':break;
		case 'lost':break;
		case 'drawn':break;
	}
	
	return results;
	
};

var email = Spieler.email = function(username,callback){

	find(username,function(player){
		if(player.email) callback(player.email); else callback(null);
	});
	
};

//Sets the new ratings for the players based on the result
var result = Spieler.result = function(rated,whiteusername,blackusername,whiteresult,blackresult){

	find(whiteusername,function(white){
		find(blackusername,function(black){

			if (rated) {
				var ratings = elo(white.rating,black.rating,whiteresult,blackresult,white.kfactor,black.kfactor);
				white.stats(whiteresult,ratings.white);
				black.stats(blackresult,ratings.black);
			} else {
				white.stats(whiteresult,null);
				black.stats(blackresult,null);
			}

			white.save();
			black.save();

		});
	});
	
};


// ==============================================================
// User Object
// Manages user data and statistics
//

// --------------------------------------------------------------
// Constructor:
var user = function(username){
	var self = this;
	self.username = username;
	self.rating = start;
	self.kfactor = kfact;
	self.played = 0;
	self.won = 0;
	self.lost = 0;
	self.drawn = 0;
	self.rated = 0;
	self.rwon = 0;
	self.rlost = 0;
	self.rdrawn = 0;
};

// --------------------------------------------------------------
// Prototypes:

//Deserializes the user from a database record
user.prototype.deserialize = function(record){
	
	var self = this;
	self.userid = record.id;
	self.username = record.username;
	self.email = record.email||"";
	self.forgot = record.forgot||"";
	self.hashword = record.hashword;
	
	self.rating = record.rating||start;
	self.kfactor = record.kfactor||kfact;

	self.played = record.played||0;
	self.won = record.won||0;
	self.lost = record.lost||0;
	self.drawn = record.drawn||0;

	self.rated = record.rated||0;
	self.rwon = record.rwon||0;
	self.rlost = record.rlost||0;
	self.rdrawn = record.rdrawn||0;

	self.wonpct = record.wonpct||0;
	self.lostpct = record.lostpct||0;
	self.drawnpct = record.drawnpct||0;

	self.rwonpct = record.rwonpct||0;
	self.rlostpct = record.rlostpct||0;
	self.rdrawnpct = record.rdrawnpct||0;

};

//Serializes the user for transport or save
user.prototype.serialize = function(){

	var self = this;

	return {
		userid:self.userid,
		username:self.username,
		email:self.email||"",
		forgot:self.forgot||"",
		hashword:self.hashword,

		rating:self.rating,
		kfactor:self.kfactor,

		played:self.played,
		won:self.won,
		lost:self.lost,
		drawn:self.drawn,

		rated:self.rated,
		rwon:self.rwon,
		rlost:self.rlost,
		rdrawn:self.rdrawn,

		wonpct:pct(self.won,self.played),
		lostpct:pct(self.lost,self.played),
		drawnpct:pct(self.drawn,self.played),

		rwonpct:pct(self.rwon,self.rated),
		rlostpct:pct(self.rlost,self.rated),
		rdrawnpct:pct(self.rdrawn,self.rated)

	}
	
};

//Saves the game to the database
user.prototype.save = function(callback){
	db.saveUser(this.serialize(),callback||function(){});
};

user.prototype.stats = function(result,rating) {
	var self = this;
	self.played++;
	if (result===1)   self.won++;
	if (result===0)   self.lost++;
	if (result===0.5) self.drawn++;
	self.wonpct = pct(self.won,self.played);
	self.lostpct = pct(self.lost,self.played);
	self.drawnpct = pct(self.drawn,self.played);

	
	if (rating) {
		self.rating = rating;
		self.rated++;
		if (result===1)   self.rwon++;
		if (result===0)   self.rlost++;
		if (result===0.5) self.rdrawn++;
		if (self.rated>=30 && self.kfactor>10) self.kfactor=15;
		if (self.rating>=2400) self.kfactor=10;

		self.rwonpct = pct(self.rwon,self.rated);
		self.rlostpct = pct(self.rlost,self.rated);
		self.rdrawnpct = pct(self.rdrawn,self.rated);
	}
	
}

//Percent formatter:
var pct=function(a,b){ return Math.floor((a/b)*100); };


//ELO rating calculation
var elo = function (whiteRating,blackRating,whiteResult,blackResult,kwhite,kblack) {
	var expected = function(a,b) { return (1/(1+(Math.pow(10,(a-b)/400)))) };
	return {
		white: (whiteRating+(kwhite*(whiteResult-expected(blackRating,whiteRating)))),
		black: (blackRating+(kblack*(blackResult-expected(whiteRating,blackRating))))
	}
}
