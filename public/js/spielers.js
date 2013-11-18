(function(){

	$.get("/spielers",function(data,status){
		if(status==="success" && data) {
			$("#spielers").render("spieler",data);
		}
		kriegspiel.lobby.init();
	});

})();