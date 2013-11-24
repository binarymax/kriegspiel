var db = require('./db');
var spieler = require('./spieler');

var exclude = ['admin','guest','test',''];

db.findGamesByFilter({state:-1,rated:true},function(rec){return rec},function(err,recs){
	
	recs = recs.reverse();

	var players = {};
	var pnumber = 0;
	
	var check = function(total,callback) {
		var done = 0; return function() { if(++done===total) callback(); }
	}
	
	var recalculate = function(){
		for(var i=0,l=recs.length,rec,ok;i<l;i++) {
			ok  = true;
			rec = recs[i];
			for(var j=0,k=exclude.length;j<k;j++) { if(rec.whiteusername===exclude[j] || rec.blackusername===exclude[j]) ok = false; } 
			if (ok) spieler.result(rec.rated,rec.whiteusername,rec.blackusername,rec.result.white,rec.result.black);
		}
		for(player in players) {
			if(players.hasOwnProperty(player)) {
				spieler.find(player,function(data) {
					console.log(data.username,data.rating);
				});
			}
		}

	}
	
	for(var i=0,l=recs.length,rec;i<l;i++) {
		rec = recs[i];
		if(rec.whiteusername.length && !players[rec.whiteusername]) {pnumber++; players[rec.whiteusername]=1; }
		if(rec.blackusername.length && !players[rec.blackusername]) {pnumber++; players[rec.blackusername]=1; }		
	}

	var resetcheck = check(pnumber,recalculate);
	for(player in players) {
		if(players.hasOwnProperty(player)) {
			spieler.reset(player,resetcheck)
		}
	}

});