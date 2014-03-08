(function(){

	$.get("/spielers",function(data,status){
		var hasGames = [];
		if(status==="success" && data) {
			$.each(data,function(){ if(this.rated>0) hasGames.push(this); })
			$("#spielers").render("spieler",hasGames);
		}
		kriegspiel.lobby.init();
	});

})();